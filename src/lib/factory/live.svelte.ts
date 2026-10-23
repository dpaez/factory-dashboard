/**
 * The browser's live controller: one stream to `/api/factory/events`, read
 * with `fetch` and the frame parser. Each event names what changed; the
 * controller collects the keys it names and invalidates them together, so the
 * loads that depend on them reread. It owns the connection state the header
 * shows, and `waitForRevision(n)` for commands (#28).
 *
 * Browser-safe and dependency-injected: no `$app/*` import, so it runs in the
 * client test project. The root layout passes SvelteKit's `invalidate`.
 */
import { createContext } from 'svelte';

import { createEventParser, keysForEvent, type EventStreamFailure } from './events';
import type { ConnectionState } from './live';

export type { ConnectionState };

export const EVENTS_ENDPOINT = '/api/factory/events';

/** Every dependency key the dashboard registers starts with this scheme. */
const FACTORY_PROTOCOL = 'factory:';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type Timer = ReturnType<typeof setTimeout>;

/** What one coalesced flush invalidated. On a (re)open it is every `factory:` key. */
export type LiveInvalidation = { keys: ReadonlySet<string>; reconnect: boolean };

export type LiveListener = (invalidation: LiveInvalidation) => void;

/** Whether `key` is among what an invalidation reread. */
export function invalidates(invalidation: LiveInvalidation, key: string): boolean {
	return invalidation.reconnect || invalidation.keys.has(key);
}

export type WaitResult = 'reached' | 'timeout' | 'aborted';

export type LiveControllerOptions = {
	/** SvelteKit's `invalidate`, given a URL predicate. */
	invalidate: (predicate: (url: URL) => boolean) => Promise<void>;
	fetch?: Fetch;
	setTimeout?: (callback: () => void, ms: number) => Timer;
	clearTimeout?: (timer: Timer) => void;
	now?: () => Date;
	/** Delays before each successive reconnect attempt; the last one repeats. */
	backoffMs?: readonly number[];
	/**
	 * Consecutive failed attempts before giving up as disconnected. A stream
	 * that opens and drops before `healthyMs` counts as a failed attempt.
	 */
	maxFailures?: number;
	/** How long a stream must stay open before the failure count resets. */
	healthyMs?: number;
	/** The window in which event keys are collected into one invalidation. */
	coalesceMs?: number;
	/** Where a skipped frame is reported (reason only, never the payload). */
	warn?: (message: string) => void;
};

const DEFAULT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;
const DEFAULT_MAX_FAILURES = 8;
const DEFAULT_HEALTHY_MS = 10_000;
const DEFAULT_COALESCE_MS = 150;
const DEFAULT_WAIT_MS = 30_000;

type Waiter = { revision: number; settle(result: WaitResult): void };
type Batch = { keys: Set<string>; reconnect: boolean; revision: number | null };

/** The safe failure body the proxy answers instead of a stream, when it has one. */
async function failureOf(response: Response): Promise<EventStreamFailure['failure'] | null> {
	try {
		const body = (await response.json()) as Partial<EventStreamFailure> | null;
		const failure = body?.failure;
		return typeof failure === 'object' && failure !== null && typeof failure.retryable === 'boolean'
			? failure
			: null;
	} catch {
		return null;
	}
}

export class LiveController {
	connectionState: ConnectionState = $state('connecting');
	/** The newest revision received; sent as `Last-Event-ID` on reconnect. */
	lastRevision: number | null = $state(null);
	/** ISO time the last refetch settled; null before the first one. */
	lastRefreshAt: string | null = $state(null);

	#invalidate: LiveControllerOptions['invalidate'];
	#fetch: Fetch;
	#setTimeout: NonNullable<LiveControllerOptions['setTimeout']>;
	#clearTimeout: NonNullable<LiveControllerOptions['clearTimeout']>;
	#now: () => Date;
	#backoffMs: readonly number[];
	#maxFailures: number;
	#healthyMs: number;
	#coalesceMs: number;
	#warn: (message: string) => void;

	#running = false;
	#abort: AbortController | null = null;
	#failures = 0;
	#retryTimer: Timer | null = null;
	#healthyTimer: Timer | null = null;

	#pending: Batch = { keys: new Set(), reconnect: false, revision: null };
	#flushTimer: Timer | null = null;
	#flushes: Promise<void> = Promise.resolve();
	#settledRevision = -1;
	#waiters = new Set<Waiter>();
	#listeners = new Set<LiveListener>();

	constructor(options: LiveControllerOptions) {
		this.#invalidate = options.invalidate;
		this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
		this.#setTimeout = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
		this.#clearTimeout = options.clearTimeout ?? ((timer) => clearTimeout(timer));
		this.#now = options.now ?? (() => new Date());
		this.#backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
		this.#maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
		this.#healthyMs = options.healthyMs ?? DEFAULT_HEALTHY_MS;
		this.#coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS;
		this.#warn = options.warn ?? ((message) => console.warn(message));
	}

	/** Open the stream. Calling it again while running does nothing. */
	start(): void {
		if (this.#running) return;
		this.#running = true;
		this.#failures = 0;
		this.connectionState = 'connecting';
		void this.#connect();
	}

	/** Reconnect now, whatever the state: the header's Retry. */
	retry(): void {
		this.#halt();
		this.#running = true;
		this.#failures = 0;
		this.connectionState = 'connecting';
		void this.#connect();
	}

	/** Abort the stream and every timer. Pending waits resolve `aborted`. */
	stop(): void {
		this.#halt();
		this.#running = false;
		if (this.#flushTimer !== null) this.#clearTimeout(this.#flushTimer);
		this.#flushTimer = null;
		for (const waiter of [...this.#waiters]) waiter.settle('aborted');
	}

	/** Called after each flush with what it invalidated. Returns the unsubscribe. */
	onInvalidate(listener: LiveListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/**
	 * Resolves `reached` once an event with revision ≥ `revision` arrived and
	 * the refetch it triggered settled; `timeout` or `aborted` otherwise. Never
	 * rejects.
	 */
	waitForRevision(
		revision: number,
		{ signal, timeoutMs = DEFAULT_WAIT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {}
	): Promise<WaitResult> {
		if (this.#settledRevision >= revision) return Promise.resolve('reached');
		if (signal?.aborted) return Promise.resolve('aborted');
		return new Promise((resolve) => {
			const onAbort = () => waiter.settle('aborted');
			const timer = this.#setTimeout(() => waiter.settle('timeout'), timeoutMs);
			const waiter: Waiter = {
				revision,
				settle: (result) => {
					if (!this.#waiters.delete(waiter)) return;
					this.#clearTimeout(timer);
					signal?.removeEventListener('abort', onAbort);
					resolve(result);
				}
			};
			this.#waiters.add(waiter);
			signal?.addEventListener('abort', onAbort, { once: true });
		});
	}

	#halt(): void {
		this.#abort?.abort();
		this.#abort = null;
		if (this.#retryTimer !== null) this.#clearTimeout(this.#retryTimer);
		this.#retryTimer = null;
		this.#clearHealthy();
	}

	#clearHealthy(): void {
		if (this.#healthyTimer !== null) this.#clearTimeout(this.#healthyTimer);
		this.#healthyTimer = null;
	}

	async #connect(): Promise<void> {
		const abort = new AbortController();
		this.#abort = abort;
		const current = () => this.#abort === abort && !abort.signal.aborted;
		const headers: Record<string, string> = { accept: 'text/event-stream' };
		if (this.lastRevision !== null) headers['last-event-id'] = String(this.lastRevision);

		let response: Response;
		try {
			response = await this.#fetch(EVENTS_ENDPOINT, {
				headers,
				signal: abort.signal,
				cache: 'no-store'
			});
		} catch {
			if (current()) this.#retryLater();
			return;
		}
		if (!current()) {
			void response.body?.cancel().catch(() => {});
			return;
		}

		if (response.status === 401 || response.status === 403) {
			void response.body?.cancel().catch(() => {});
			this.#abort = null;
			this.connectionState = 'auth_failed';
			return;
		}
		if (!response.ok || !response.body) {
			const failure = await failureOf(response);
			if (!current()) return;
			const retryable = failure ? failure.retryable : response.status >= 500 || response.ok;
			if (retryable) this.#retryLater();
			else this.#giveUp();
			return;
		}

		this.connectionState = 'live';
		// Only a stream that stays open is healthy: one that opens and drops at
		// once keeps counting toward the cap, so it cannot retry forever.
		this.#healthyTimer = this.#setTimeout(() => {
			this.#healthyTimer = null;
			if (current()) this.#failures = 0;
		}, this.#healthyMs);
		this.#queue({ reconnect: true });
		await this.#read(response.body, current);
		if (current()) {
			this.#clearHealthy();
			this.#retryLater();
		}
	}

	/** Read frames until the stream ends, fails, or this connection is replaced. */
	async #read(body: ReadableStream<Uint8Array>, current: () => boolean): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder('utf-8');
		const parser = createEventParser();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (!current()) break;
				if (done) {
					this.#handle(parser.push(decoder.decode()));
					parser.end();
					break;
				}
				this.#handle(parser.push(decoder.decode(value, { stream: true })));
			}
		} catch {
			// A dropped or aborted stream: the caller decides whether to reconnect.
		} finally {
			reader.cancel().catch(() => {});
		}
	}

	#handle(items: ReturnType<ReturnType<typeof createEventParser>['push']>): void {
		for (const item of items) {
			if (item.type === 'malformed') {
				this.#warn(`Skipped a malformed factory event: ${item.reason}.`);
				continue;
			}
			if (this.lastRevision !== null && item.revision <= this.lastRevision) continue;
			this.lastRevision = item.revision;
			this.#queue({ keys: keysForEvent(item), revision: item.revision });
		}
	}

	#retryLater(): void {
		this.#abort = null;
		this.#failures++;
		if (this.#failures >= this.#maxFailures) return this.#giveUp();
		this.connectionState = 'reconnecting';
		const delays = this.#backoffMs;
		const delay = delays[Math.min(this.#failures - 1, delays.length - 1)] ?? 0;
		this.#retryTimer = this.#setTimeout(() => {
			this.#retryTimer = null;
			if (this.#running) void this.#connect();
		}, delay);
	}

	#giveUp(): void {
		this.#abort = null;
		this.connectionState = 'disconnected';
	}

	/** Add to the pending batch and flush it once the coalescing window closes. */
	#queue({
		keys = [],
		reconnect = false,
		revision = null
	}: {
		keys?: string[];
		reconnect?: boolean;
		revision?: number | null;
	}): void {
		for (const key of keys) this.#pending.keys.add(key);
		if (reconnect) this.#pending.reconnect = true;
		if (revision !== null) this.#pending.revision = revision;
		if (this.#flushTimer !== null) return;
		this.#flushTimer = this.#setTimeout(() => {
			this.#flushTimer = null;
			const batch = this.#pending;
			this.#pending = { keys: new Set(), reconnect: false, revision: null };
			// One flush at a time, so a revision settles only after every earlier one.
			this.#flushes = this.#flushes.then(() => this.#flush(batch));
		}, this.#coalesceMs);
	}

	async #flush(batch: Batch): Promise<void> {
		const { keys, reconnect } = batch;
		const predicate = reconnect
			? (url: URL) => url.protocol === FACTORY_PROTOCOL
			: (url: URL) => keys.has(url.href);
		const invalidation: LiveInvalidation = { keys, reconnect };
		for (const listener of [...this.#listeners]) {
			try {
				listener(invalidation);
			} catch {
				// A listener's failure never stops the stream or the refetch.
			}
		}
		try {
			await this.#invalidate(predicate);
		} catch {
			// A failed load shows its own error; the refetch still settled.
		}
		this.lastRefreshAt = this.#now().toISOString();
		if (batch.revision !== null && batch.revision > this.#settledRevision) {
			this.#settledRevision = batch.revision;
		}
		for (const waiter of [...this.#waiters]) {
			if (waiter.revision <= this.#settledRevision) waiter.settle('reached');
		}
	}
}

const [getContext, setContext, hasContext] = createContext<LiveController>();

/** Make the layout's controller available to its pages. */
export function setLiveContext(controller: LiveController): LiveController {
	return setContext(controller);
}

/** The layout's controller, or undefined outside it (a page rendered alone in a test). */
export function getLiveContext(): LiveController | undefined {
	return hasContext() ? getContext() : undefined;
}
