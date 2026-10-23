/**
 * The Flow board's Inspector read: the selected ticket's execution, read
 * through `/api/factory/tickets/<key>[?execution=n]`. Owned by the board page,
 * keyed by `(key, execution)`. It reacts to `select()` only and never reads
 * the board lanes, so a ticket that leaves the lanes keeps its Inspector.
 * A generation guard drops a response that a newer selection superseded.
 */
import type { InspectorState, TicketResult } from './inspector';

export const TICKET_ENDPOINT = '/api/factory/tickets';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const UNREADABLE = { kind: 'error', title: 'Ticket unreachable', retryable: true } as const;
const NOT_FOUND: ReadonlySet<string> = new Set(['ticket_not_found', 'not_found']);

function isResult(body: unknown): body is TicketResult {
	if (typeof body !== 'object' || body === null) return false;
	const value = body as Record<string, unknown>;
	if (value.ok === true) {
		return (
			typeof value.detail === 'object' &&
			value.detail !== null &&
			typeof value.runsComplete === 'boolean'
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

/** The endpoint URL for a key (opaque, encoded) and an execution (omit for current). */
export function ticketEndpoint(key: string, execution?: number): string {
	const path = `${TICKET_ENDPOINT}/${encodeURIComponent(key)}`;
	return execution === undefined ? path : `${path}?execution=${execution}`;
}

export class TicketInspectorState {
	view: InspectorState = $state.raw({ kind: 'loading' });

	#fetch: Fetch;
	#generation = 0;
	#selected: { key: string; execution: number | undefined } | null = null;

	constructor(fetch: Fetch = (input, init) => globalThis.fetch(input, init)) {
		this.#fetch = fetch;
	}

	/**
	 * Show `key` at `execution` (the current one when omitted). The same
	 * selection as the last one is not read again; use `retry()` for that.
	 */
	select(key: string, execution?: number): Promise<void> {
		const last = this.#selected;
		if (last !== null && last.key === key && last.execution === execution) {
			return Promise.resolve();
		}
		this.#selected = { key, execution };
		return this.#read();
	}

	/** Repeat the last request. */
	retry(): Promise<void> {
		return this.#selected === null ? Promise.resolve() : this.#read();
	}

	/** Forget the selection; a later `select()` reads again. */
	clear(): void {
		this.#generation++;
		this.#selected = null;
		this.view = { kind: 'loading' };
	}

	/**
	 * Reread the selection quietly, after an event named it: the current view
	 * stays until the answer arrives, and a failed reread keeps it.
	 */
	refresh(): Promise<void> {
		return this.#selected === null ? Promise.resolve() : this.#read(true);
	}

	async #read(quiet = false): Promise<void> {
		const { key, execution } = this.#selected!;
		const generation = ++this.#generation;
		if (!quiet) this.view = { kind: 'loading', key };
		let next: InspectorState;
		try {
			const response = await this.#fetch(ticketEndpoint(key, execution), {
				headers: { accept: 'application/json' }
			});
			const body: unknown = await response.json();
			if (!isResult(body)) next = UNREADABLE;
			else if (body.ok)
				next = { kind: 'loaded', detail: body.detail, runsComplete: body.runsComplete };
			else if (NOT_FOUND.has(body.failure.type)) next = { kind: 'not_found', key, execution };
			else next = { kind: 'error', title: body.failure.title, retryable: body.failure.retryable };
		} catch {
			next = UNREADABLE;
		}
		if (generation !== this.#generation) return;
		// A quiet reread replaces a shown ticket only with a newer view of it.
		if (quiet && this.view.kind === 'loaded' && next.kind !== 'loaded') return;
		this.view = next;
	}
}
