/**
 * The Flow board page's backlog: seeded from the root load's streamed result,
 * re-read through `/api/factory/backlog` for Refresh and Retry. A failed read
 * keeps the previous issues and their `fetchedAt`; Retry repeats the last
 * attempt. Owned by the page; the lane only receives its values.
 */
import {
	backlogFailureReason,
	readyToStart,
	toBacklogCards,
	type BacklogCardModel,
	type BacklogFailure,
	type BacklogIssue,
	type BacklogResult
} from './backlog';

export const BACKLOG_ENDPOINT = '/api/factory/backlog';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const UNREADABLE: BacklogFailure = {
	type: 'network_error',
	title: 'Backlog unreachable',
	detail: 'The dashboard did not answer the backlog request.',
	retryable: true
};

function isResult(body: unknown): body is BacklogResult {
	if (typeof body !== 'object' || body === null) return false;
	const value = body as Record<string, unknown>;
	if (value.ok === true) {
		return (
			Array.isArray(value.items) &&
			typeof value.fetchedAt === 'string' &&
			typeof value.complete === 'boolean'
		);
	}
	const failure = value.failure as Record<string, unknown> | null | undefined;
	return (
		value.ok === false &&
		typeof failure === 'object' &&
		failure !== null &&
		typeof failure.title === 'string' &&
		typeof failure.type === 'string'
	);
}

export class BacklogState {
	items: BacklogIssue[] = $state.raw([]);
	fetchedAt: string | null = $state(null);
	complete = $state(true);
	status: 'loading' | 'ready' | 'failed' = $state('loading');
	failure: BacklogFailure | null = $state.raw(null);
	refreshing = $state(false);
	/** The lane's label filter; null shows every label. */
	label: string | null = $state(null);

	readonly cards: BacklogCardModel[] = $derived(toBacklogCards(this.items));
	/** Ready to start: null while loading or when the latest read failed. */
	readonly readyToStart: number | null = $derived(
		this.status === 'ready' ? readyToStart(this.items) : null
	);
	readonly reason: string | null = $derived(
		this.failure === null ? null : backlogFailureReason(this.failure)
	);

	#fetch: Fetch;
	#lastRefresh = false;
	#generation = 0;

	constructor(fetch: Fetch = (input, init) => globalThis.fetch(input, init)) {
		this.#fetch = fetch;
	}

	/** Apply the root load's streamed result. A newer refresh wins over it. */
	seed(result: Promise<BacklogResult>): void {
		const generation = ++this.#generation;
		this.#lastRefresh = false;
		result.then(
			(value) => generation === this.#generation && this.#apply(value),
			() => generation === this.#generation && this.#apply({ ok: false, failure: UNREADABLE })
		);
	}

	/** Ask the tracker again. */
	refresh(): Promise<void> {
		return this.#read(true);
	}

	/** Repeat the last attempt: the initial read or a refresh. */
	retry(): Promise<void> {
		return this.#read(this.#lastRefresh);
	}

	async #read(refresh: boolean): Promise<void> {
		const generation = ++this.#generation;
		this.#lastRefresh = refresh;
		this.refreshing = true;
		let result: BacklogResult;
		try {
			const response = await this.#fetch(BACKLOG_ENDPOINT + (refresh ? '?refresh=true' : ''), {
				headers: { accept: 'application/json' }
			});
			const body: unknown = await response.json();
			result = isResult(body) ? body : { ok: false, failure: UNREADABLE };
		} catch {
			result = { ok: false, failure: UNREADABLE };
		}
		if (generation !== this.#generation) return;
		this.refreshing = false;
		this.#apply(result);
	}

	#apply(result: BacklogResult): void {
		this.refreshing = false;
		if (result.ok) {
			this.items = result.items;
			this.fetchedAt = result.fetchedAt;
			this.complete = result.complete;
			this.failure = null;
			this.status = 'ready';
			// A label no refreshed issue carries is no longer a filter option: clear it,
			// so the lane never hides every issue behind a label it cannot show.
			const label = this.label;
			if (label !== null && !result.items.some((issue) => issue.labels.includes(label))) {
				this.label = null;
			}
		} else {
			// Keep the previous issues and their timestamp.
			this.failure = result.failure;
			this.status = 'failed';
		}
	}
}
