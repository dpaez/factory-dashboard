/**
 * The inspector's run detail reads: one run's evidence, read lazily through
 * `/api/factory/runs/<id>` and cached per `(execution, run)`. Owned by the
 * inspector placement (the board page, the ticket page). A loaded key, or a
 * failed one, is not read again until `retry()`. A per-key generation drops a
 * response that a later read of the same key superseded.
 */
import type { RunDetailSource, RunDetailViewState, RunResult } from './inspector';

export type { RunDetailViewState };

export const RUN_ENDPOINT = '/api/factory/runs';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const UNREADABLE = { kind: 'error', title: 'Run unreachable', retryable: true } as const;
const LOADING = { kind: 'loading' } as const;
const NOT_FOUND: ReadonlySet<string> = new Set(['run_not_found', 'not_found']);

function isResult(body: unknown): body is RunResult {
	if (typeof body !== 'object' || body === null) return false;
	const value = body as Record<string, unknown>;
	if (value.ok === true) return typeof value.run === 'object' && value.run !== null;
	const failure = value.failure as Record<string, unknown> | null | undefined;
	return (
		value.ok === false &&
		typeof failure === 'object' &&
		failure !== null &&
		typeof failure.title === 'string' &&
		typeof failure.type === 'string'
	);
}

/** The endpoint URL for a run id (opaque, encoded). */
export function runEndpoint(id: string): string {
	return `${RUN_ENDPOINT}/${encodeURIComponent(id)}`;
}

/** The cache key: the execution is part of it, so the same id in another execution reads again. */
export function runDetailKey(execution: number, id: string): string {
	return `${execution}:${id}`;
}

export class RunDetailState implements RunDetailSource {
	#views: Map<string, RunDetailViewState> = $state.raw(new Map());
	#fetch: Fetch;
	#generations = new Map<string, number>();
	#stale = new Set<string>();

	constructor(fetch: Fetch = (input, init) => globalThis.fetch(input, init)) {
		this.#fetch = fetch;
	}

	/** The run's state; `loading` for a key that was never read. */
	view(execution: number, id: string): RunDetailViewState {
		return this.#views.get(runDetailKey(execution, id)) ?? LOADING;
	}

	/** Read the run once per `(execution, id)`; a key already read or in flight is not read again. */
	load(execution: number, id: string): Promise<void> {
		const key = runDetailKey(execution, id);
		if (this.#stale.has(key)) return this.#read(execution, id, true);
		if (this.#generations.has(key)) return Promise.resolve();
		return this.#read(execution, id);
	}

	/** Read the run again, whatever its state. */
	retry(execution: number, id: string): Promise<void> {
		return this.#read(execution, id);
	}

	/**
	 * After an event named the shown ticket's runs: every cached run is stale.
	 * Its view stays; the next `load()` of it rereads quietly, keeping the view
	 * when the reread fails. The Inspector calls `load()` again when its ticket
	 * detail is reread, which the same event triggers (it names both keys).
	 */
	markStale(): void {
		for (const key of this.#generations.keys()) this.#stale.add(key);
	}

	async #read(execution: number, id: string, quiet = false): Promise<void> {
		const key = runDetailKey(execution, id);
		const generation = (this.#generations.get(key) ?? 0) + 1;
		this.#generations.set(key, generation);
		this.#stale.delete(key);
		const previous = this.#views.get(key);
		if (!quiet || previous === undefined) this.#set(key, LOADING);
		let next: RunDetailViewState;
		try {
			const response = await this.#fetch(runEndpoint(id), {
				headers: { accept: 'application/json' }
			});
			const body: unknown = await response.json();
			if (!isResult(body)) next = UNREADABLE;
			else if (body.ok) next = { kind: 'loaded', run: body.run };
			else if (NOT_FOUND.has(body.failure.type)) next = { kind: 'not_found', id };
			else next = { kind: 'error', title: body.failure.title, retryable: body.failure.retryable };
		} catch {
			next = UNREADABLE;
		}
		if (this.#generations.get(key) !== generation) return;
		// A quiet reread replaces a shown run only with a newer view of it.
		if (quiet && previous?.kind === 'loaded' && next.kind !== 'loaded') return;
		this.#set(key, next);
	}

	#set(key: string, value: RunDetailViewState): void {
		const views = new Map(this.#views);
		views.set(key, value);
		this.#views = views;
	}
}
