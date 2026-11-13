/**
 * The Feedback rounds box's pending list, read from the browser through
 * `/api/factory/tickets/<key>/feedback`. Owned by `ticket-commands.svelte`,
 * which loads it while a round can start and clears it otherwise; the box
 * only receives its values.
 *
 * Every comment starts ticked. A read that lists the same comments keeps the
 * ticks; a read that lists different ones ticks them all again. A failed read
 * keeps the previous list and ticks, so a Retry that finds it unchanged
 * keeps the operator's choice. A newer read wins over an older one still in
 * flight, and `clear` drops any read in flight.
 */
import type { FeedbackCandidate, PendingFeedback, PendingFeedbackFailure } from './feedback';
import { allRefs, sameCandidates } from './feedback-rounds';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type PendingFeedbackStatus = 'idle' | 'loading' | 'ready' | 'failed';

const UNREADABLE: PendingFeedbackFailure = {
	type: 'network_error',
	title: 'Pending feedback unreachable',
	detail: 'The dashboard did not answer the pending feedback request.',
	retryable: true
};

export const pendingFeedbackEndpoint = (key: string) =>
	`/api/factory/tickets/${encodeURIComponent(key)}/feedback`;

type Read = ({ ok: true } & PendingFeedback) | { ok: false; failure: PendingFeedbackFailure };

function isRead(body: unknown): body is Read {
	if (typeof body !== 'object' || body === null) return false;
	const value = body as Record<string, unknown>;
	if (value.ok === true) {
		return (
			Array.isArray(value.candidates) &&
			Array.isArray(value.skipped) &&
			typeof value.truncated === 'boolean'
		);
	}
	const failure = value.failure as Record<string, unknown> | null | undefined;
	return (
		value.ok === false &&
		typeof failure === 'object' &&
		failure !== null &&
		typeof failure.type === 'string' &&
		typeof failure.title === 'string'
	);
}

export class PendingFeedbackState {
	/** The ticket whose list this is; null when cleared. */
	key: string | null = $state(null);
	status: PendingFeedbackStatus = $state('idle');
	candidates: FeedbackCandidate[] = $state.raw([]);
	skipped: PendingFeedback['skipped'] = $state.raw([]);
	truncated = $state(false);
	failure: PendingFeedbackFailure | null = $state.raw(null);
	/** A read is in flight (the first one, a refresh or a retry). */
	reading = $state(false);
	/** The ticked comments' refs, bound to the box, which ticks and unticks them. */
	ticked: string[] = $state([]);

	#fetch: Fetch;
	#generation = 0;

	constructor(fetch: Fetch = (input, init) => globalThis.fetch(input, init)) {
		this.#fetch = fetch;
	}

	/**
	 * Read the ticket's list when it is not read yet. Another ticket starts
	 * over, with nothing listed or ticked.
	 */
	load(key: string): Promise<void> {
		if (key !== this.key) {
			this.#reset();
			this.key = key;
		} else if (this.status !== 'idle') {
			return Promise.resolve();
		}
		return this.#read();
	}

	/** Read the list again (Refresh, Retry, and after a round confirms or is refused). */
	refresh(): Promise<void> {
		if (this.key === null) return Promise.resolve();
		return this.#read();
	}

	/** Forget the list and drop any read in flight: no round can start now. */
	clear(): void {
		this.#generation++;
		this.#reset();
		this.key = null;
	}

	#reset(): void {
		this.status = 'idle';
		this.candidates = [];
		this.skipped = [];
		this.truncated = false;
		this.failure = null;
		this.reading = false;
		this.ticked = [];
	}

	async #read(): Promise<void> {
		const key = this.key!;
		const generation = ++this.#generation;
		this.reading = true;
		if (this.status === 'idle') this.status = 'loading';
		let result: Read;
		try {
			const response = await this.#fetch(pendingFeedbackEndpoint(key), {
				headers: { accept: 'application/json' }
			});
			const body: unknown = await response.json();
			result = isRead(body) ? body : { ok: false, failure: UNREADABLE };
		} catch {
			result = { ok: false, failure: UNREADABLE };
		}
		if (generation !== this.#generation) return;
		this.reading = false;
		if (result.ok) {
			const fresh =
				this.status === 'loading' || !sameCandidates(this.candidates, result.candidates);
			if (fresh) this.ticked = allRefs(result.candidates);
			this.candidates = result.candidates;
			this.skipped = result.skipped;
			this.truncated = result.truncated;
			this.failure = null;
			this.status = 'ready';
		} else {
			this.failure = result.failure;
			this.status = 'failed';
		}
	}
}
