import { describe, expect, it } from 'vitest';

import { eventFrame, eventStart, eventValidationFinished } from './fixtures';
import { LiveController, type LiveInvalidation } from './live.svelte';

const encoder = new TextEncoder();
const STREAM_HEADERS = { 'content-type': 'text/event-stream; charset=utf-8' };

/** One stream the test writes frames into by hand. */
type Stream = {
	write(text: string): void;
	writeBytes(bytes: Uint8Array): void;
	end(): void;
	fail(): void;
	headers: Headers;
	signal: AbortSignal;
};

type Answer = { status: number; body?: unknown };

/**
 * A fake `fetch` for `/api/factory/events`: every call is recorded, and opens
 * a hand-driven stream unless the next queued answer says otherwise.
 */
function fakeEvents() {
	const streams: Stream[] = [];
	const answers: Answer[] = [];
	const calls: { headers: Headers }[] = [];
	const fetch = async (_input: string, init?: RequestInit): Promise<Response> => {
		const headers = new Headers(init?.headers);
		calls.push({ headers });
		const answer = answers.shift();
		if (answer?.status === 0) throw new TypeError('Failed to fetch');
		if (answer) {
			return new Response(JSON.stringify(answer.body ?? {}), {
				status: answer.status,
				headers: { 'content-type': 'application/json' }
			});
		}
		let controller!: ReadableStreamDefaultController<Uint8Array>;
		const body = new ReadableStream<Uint8Array>({
			start: (c) => void (controller = c)
		});
		const signal = init!.signal!;
		signal.addEventListener('abort', () => {
			try {
				controller.error(new DOMException('Aborted', 'AbortError'));
			} catch {
				// Already closed.
			}
		});
		streams.push({
			write: (text) => controller.enqueue(encoder.encode(text)),
			writeBytes: (bytes) => controller.enqueue(bytes),
			end: () => controller.close(),
			fail: () => controller.error(new TypeError('network error')),
			headers,
			signal
		});
		return new Response(body, { status: 200, headers: STREAM_HEADERS });
	};
	return { fetch, streams, answers, calls };
}

/** Timers the test runs by hand, in due order. */
function manualTimers() {
	let now = 0;
	let id = 0;
	const timers = new Map<number, { due: number; callback: () => void }>();
	const setTimeout = (callback: () => void, ms: number) => {
		timers.set(++id, { due: now + ms, callback });
		return id as unknown as ReturnType<typeof globalThis.setTimeout>;
	};
	const clearTimeout = (timer: ReturnType<typeof globalThis.setTimeout>) =>
		void timers.delete(timer as unknown as number);
	/** Advance the clock by `ms`, firing every timer due on the way. */
	const advance = async (ms: number) => {
		const until = now + ms;
		for (;;) {
			await settle();
			const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
			if (!next || next[1].due > until) break;
			timers.delete(next[0]);
			now = next[1].due;
			next[1].callback();
		}
		now = until;
		await settle();
	};
	return { setTimeout, clearTimeout, advance, pending: () => timers.size };
}

async function settle() {
	for (let i = 0; i < 10; i++) await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

const COALESCE = 150;

function setup(options: { maxFailures?: number } = {}) {
	const events = fakeEvents();
	const timers = manualTimers();
	const invalidations: ((url: URL) => boolean)[] = [];
	const warnings: string[] = [];
	let release: (() => void) | null = null;
	let holdInvalidate = false;
	const controller = new LiveController({
		fetch: events.fetch,
		invalidate: (predicate) => {
			invalidations.push(predicate);
			if (!holdInvalidate) return Promise.resolve();
			return new Promise<void>((resolve) => (release = resolve));
		},
		setTimeout: timers.setTimeout,
		clearTimeout: timers.clearTimeout,
		now: () => new Date('2026-10-23T10:00:00.000Z'),
		backoffMs: [1_000, 2_000, 5_000],
		maxFailures: options.maxFailures ?? 3,
		coalesceMs: COALESCE,
		warn: (message) => warnings.push(message)
	});
	const heard: LiveInvalidation[] = [];
	controller.onInvalidate((invalidation) => heard.push(invalidation));
	return {
		controller,
		...events,
		...timers,
		invalidations,
		warnings,
		heard,
		holdInvalidates: () => (holdInvalidate = true),
		releaseInvalidate: () => release?.()
	};
}

/** Which of these dependency keys a predicate passed to `invalidate` reruns. */
const KEYS = [
	'factory:tickets',
	'factory:agents',
	'factory:backlog',
	`factory:ticket:${encodeURIComponent(eventStart.ticket)}`,
	`factory:runs:${encodeURIComponent(eventStart.ticket)}`,
	`factory:ticket:${encodeURIComponent(eventValidationFinished.ticket)}`,
	'app:other'
];
const matched = (predicate: (url: URL) => boolean) => KEYS.filter((key) => predicate(new URL(key)));

/** Start, open the stream, and let the open's refetch flush. */
async function opened(t: ReturnType<typeof setup>) {
	t.controller.start();
	await t.advance(0);
	expect(t.controller.connectionState).toBe('live');
	await t.advance(COALESCE);
	t.invalidations.length = 0;
	t.heard.length = 0;
	return t.streams.at(-1)!;
}

describe('LiveController', () => {
	it('starts connecting, then live on a 200 stream, asking for text/event-stream', async () => {
		const t = setup();
		t.controller.start();
		expect(t.controller.connectionState).toBe('connecting');
		await t.advance(0);
		expect(t.controller.connectionState).toBe('live');
		expect(t.calls[0]!.headers.get('accept')).toBe('text/event-stream');
		expect(t.calls[0]!.headers.has('last-event-id')).toBe(false);
		t.controller.stop();
	});

	it('an open refetches every factory: key once, and tells the listeners it reconnected', async () => {
		const t = setup();
		t.controller.start();
		await t.advance(0);
		expect(t.invalidations).toHaveLength(0);
		await t.advance(COALESCE);
		expect(t.invalidations).toHaveLength(1);
		expect(matched(t.invalidations[0]!)).toEqual(KEYS.filter((key) => key !== 'app:other'));
		expect(t.heard).toEqual([{ keys: new Set(), reconnect: true }]);
		expect(t.controller.lastRefreshAt).toBe('2026-10-23T10:00:00.000Z');
		t.controller.stop();
	});

	it('a burst of events in one window is one invalidate with the union of their keys', async () => {
		const t = setup();
		const stream = await opened(t);
		stream.write(eventFrame(1, 'start', eventStart));
		await t.advance(50);
		stream.write(eventFrame(2, 'validation_finished', eventValidationFinished));
		stream.write(eventFrame(3, 'card', eventValidationFinished));
		await t.advance(COALESCE);
		expect(t.invalidations).toHaveLength(1);
		expect(matched(t.invalidations[0]!)).toEqual([
			'factory:tickets',
			'factory:agents',
			'factory:backlog',
			`factory:ticket:${encodeURIComponent(eventStart.ticket)}`,
			`factory:runs:${encodeURIComponent(eventStart.ticket)}`,
			`factory:ticket:${encodeURIComponent(eventValidationFinished.ticket)}`
		]);
		expect(t.heard).toHaveLength(1);
		expect(t.heard[0]!.reconnect).toBe(false);
		expect(t.heard[0]!.keys.has('factory:backlog')).toBe(true);
		expect(t.controller.lastRevision).toBe(3);
		t.controller.stop();
	});

	it('an event for one ticket does not invalidate another ticket', async () => {
		const t = setup();
		const stream = await opened(t);
		stream.write(eventFrame(1, 'validation_finished', eventValidationFinished));
		await t.advance(COALESCE);
		const keys = matched(t.invalidations[0]!);
		expect(keys).toContain(`factory:ticket:${encodeURIComponent(eventValidationFinished.ticket)}`);
		expect(keys).not.toContain(`factory:ticket:${encodeURIComponent(eventStart.ticket)}`);
		t.controller.stop();
	});

	it('the revision advances monotonically and is sent as Last-Event-ID on reconnect', async () => {
		const t = setup();
		const stream = await opened(t);
		stream.write(eventFrame(4, 'start', eventStart));
		stream.write(eventFrame(2, 'start', eventStart));
		await t.advance(0);
		expect(t.controller.lastRevision).toBe(4);
		stream.end();
		await t.advance(0);
		expect(t.controller.connectionState).toBe('reconnecting');
		await t.advance(1_000);
		expect(t.calls).toHaveLength(2);
		expect(t.calls[1]!.headers.get('last-event-id')).toBe('4');
		expect(t.controller.connectionState).toBe('live');
		t.controller.stop();
	});

	it('a stream end goes reconnecting, then live, and the reopen refetches again', async () => {
		const t = setup();
		const stream = await opened(t);
		stream.fail();
		await t.advance(0);
		expect(t.controller.connectionState).toBe('reconnecting');
		await t.advance(1_000);
		expect(t.controller.connectionState).toBe('live');
		await t.advance(COALESCE);
		expect(t.invalidations).toHaveLength(1);
		expect(t.heard[0]!.reconnect).toBe(true);
		t.controller.stop();
	});

	it('a 503 goes reconnecting with backoff, then live', async () => {
		const t = setup();
		t.answers.push({
			status: 503,
			body: { ok: false, failure: { type: 'unavailable', title: 'Down', retryable: true } }
		});
		t.answers.push({ status: 502 });
		t.controller.start();
		await t.advance(0);
		expect(t.controller.connectionState).toBe('reconnecting');
		await t.advance(999);
		expect(t.calls).toHaveLength(1);
		await t.advance(1);
		expect(t.calls).toHaveLength(2);
		expect(t.controller.connectionState).toBe('reconnecting');
		await t.advance(2_000);
		expect(t.calls).toHaveLength(3);
		expect(t.controller.connectionState).toBe('live');
		t.controller.stop();
	});

	it('401 is auth_failed with no further fetch; retry() reconnects', async () => {
		const t = setup();
		t.answers.push({
			status: 401,
			body: { ok: false, failure: { type: 'unauthorized', title: 'No', retryable: false } }
		});
		t.controller.start();
		await t.advance(0);
		expect(t.controller.connectionState).toBe('auth_failed');
		await t.advance(120_000);
		expect(t.calls).toHaveLength(1);
		t.controller.retry();
		await t.advance(0);
		expect(t.calls).toHaveLength(2);
		expect(t.controller.connectionState).toBe('live');
		t.controller.stop();
	});

	it('403 is auth_failed too', async () => {
		const t = setup();
		t.answers.push({ status: 403 });
		t.controller.start();
		await t.advance(60_000);
		expect(t.controller.connectionState).toBe('auth_failed');
		expect(t.calls).toHaveLength(1);
	});

	it('a non-retryable failure body is disconnected at once', async () => {
		const t = setup();
		t.answers.push({
			status: 500,
			body: {
				ok: false,
				failure: { type: 'configuration_error', title: 'Not configured', retryable: false }
			}
		});
		t.controller.start();
		await t.advance(60_000);
		expect(t.controller.connectionState).toBe('disconnected');
		expect(t.calls).toHaveLength(1);
	});

	it('after the failure cap it is disconnected and stops; retry() reconnects', async () => {
		const t = setup({ maxFailures: 3 });
		for (let i = 0; i < 3; i++) t.answers.push({ status: 0 });
		t.controller.start();
		await t.advance(60_000);
		expect(t.calls).toHaveLength(3);
		expect(t.controller.connectionState).toBe('disconnected');
		await t.advance(120_000);
		expect(t.calls).toHaveLength(3);
		t.controller.retry();
		await t.advance(0);
		expect(t.controller.connectionState).toBe('live');
		t.controller.stop();
	});

	it('streams that open and drop at once count toward the cap and end disconnected', async () => {
		const t = setup({ maxFailures: 3 });
		t.controller.start();
		for (let attempt = 1; attempt <= 3; attempt++) {
			await t.advance(0);
			expect(t.calls).toHaveLength(attempt);
			expect(t.controller.connectionState).toBe('live');
			t.streams.at(-1)!.end();
			await t.advance(0);
			if (attempt < 3) {
				expect(t.controller.connectionState).toBe('reconnecting');
				await t.advance(5_000);
			}
		}
		expect(t.controller.connectionState).toBe('disconnected');
		await t.advance(120_000);
		expect(t.calls).toHaveLength(3);
		t.controller.retry();
		await t.advance(0);
		expect(t.calls).toHaveLength(4);
		expect(t.controller.connectionState).toBe('live');
		t.controller.stop();
	});

	it('a stream that stayed open past healthyMs resets the failure count', async () => {
		const t = setup({ maxFailures: 2 });
		t.controller.start();
		await t.advance(0);
		t.streams.at(-1)!.end();
		await t.advance(1_000);
		expect(t.calls).toHaveLength(2);
		// The second stream stays open past the healthy window (10 s), then drops.
		await t.advance(10_000);
		t.streams.at(-1)!.end();
		await t.advance(0);
		expect(t.controller.connectionState).toBe('reconnecting');
		await t.advance(1_000);
		expect(t.calls).toHaveLength(3);
		expect(t.controller.connectionState).toBe('live');
		t.controller.stop();
	});

	it('a malformed frame is skipped and reported without its payload; the stream goes on', async () => {
		const t = setup();
		const stream = await opened(t);
		stream.write('id: 7\nevent: start\ndata: {"ticket": 42, "secret": "s3cr3t"}\n\n');
		stream.write('id: 8\nevent: start\ndata: not json s3cr3t\n\n');
		await t.advance(COALESCE);
		expect(t.controller.lastRevision).toBeNull();
		expect(t.invalidations).toHaveLength(0);
		expect(t.warnings).toHaveLength(2);
		expect(t.warnings.join()).not.toContain('s3cr3t');
		stream.write(eventFrame(9, 'start', eventStart));
		await t.advance(COALESCE);
		expect(t.controller.lastRevision).toBe(9);
		expect(t.invalidations).toHaveLength(1);
		expect(t.controller.connectionState).toBe('live');
		t.controller.stop();
	});

	it('decodes a UTF-8 sequence split across chunks', async () => {
		const t = setup();
		const stream = await opened(t);
		const bytes = encoder.encode(eventFrame(1, 'card', { ...eventStart, card: 'café ✓' }));
		// Split inside the two-byte `é`.
		const split = bytes.indexOf(0xc3) + 1;
		stream.writeBytes(bytes.slice(0, split));
		stream.writeBytes(bytes.slice(split));
		await t.advance(COALESCE);
		expect(t.controller.lastRevision).toBe(1);
		expect(t.warnings).toEqual([]);
		t.controller.stop();
	});

	it('stop() aborts the stream and no reconnect follows', async () => {
		const t = setup();
		const stream = await opened(t);
		t.controller.stop();
		await t.advance(0);
		expect(stream.signal.aborted).toBe(true);
		await t.advance(60_000);
		expect(t.calls).toHaveLength(1);
	});

	describe('waitForRevision', () => {
		it("resolves 'reached' only after the flush that included the revision settled", async () => {
			const t = setup();
			const stream = await opened(t);
			t.holdInvalidates();
			let result: string | null = null;
			void t.controller.waitForRevision(2, { timeoutMs: 10_000 }).then((r) => (result = r));
			stream.write(eventFrame(1, 'start', eventStart));
			await t.advance(COALESCE);
			t.releaseInvalidate();
			await t.advance(0);
			expect(result).toBeNull();
			stream.write(eventFrame(2, 'start', eventStart));
			await t.advance(COALESCE);
			expect(t.invalidations).toHaveLength(2);
			expect(result).toBeNull();
			t.releaseInvalidate();
			await t.advance(0);
			expect(result).toBe('reached');
			t.controller.stop();
		});

		it("resolves 'reached' at once for a revision already settled", async () => {
			const t = setup();
			const stream = await opened(t);
			stream.write(eventFrame(5, 'start', eventStart));
			await t.advance(COALESCE);
			expect(await t.controller.waitForRevision(3)).toBe('reached');
			t.controller.stop();
		});

		it("resolves 'timeout' when the revision never arrives", async () => {
			const t = setup();
			await opened(t);
			let result: string | null = null;
			void t.controller.waitForRevision(9, { timeoutMs: 2_000 }).then((r) => (result = r));
			await t.advance(1_999);
			expect(result).toBeNull();
			await t.advance(1);
			expect(result).toBe('timeout');
			t.controller.stop();
		});

		it("resolves 'aborted' on its signal, and on stop()", async () => {
			const t = setup();
			await opened(t);
			const abort = new AbortController();
			const first = t.controller.waitForRevision(9, { signal: abort.signal });
			abort.abort();
			expect(await first).toBe('aborted');
			const second = t.controller.waitForRevision(9);
			t.controller.stop();
			expect(await second).toBe('aborted');
			expect(await t.controller.waitForRevision(9, { signal: abort.signal })).toBe('aborted');
		});
	});
});
