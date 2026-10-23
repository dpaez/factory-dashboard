/*
 * The factory event stream, browser-safe: an incremental Server-Sent Events
 * frame parser and the invalidation keys each event names. An event is a
 * notice, never state: it says what changed, and the dashboard rereads it.
 *
 * Bytes are decoded by the caller (one `TextDecoder` in `{stream: true}`
 * mode); the parser takes text in any chunking and never throws.
 */
import type { components } from './generated/factory-api';
import type { TicketFailure } from './inspector';

export type EventPayload = components['schemas']['EventPayload'];

/**
 * What `GET /api/factory/events` answers instead of a stream: a safe failure
 * with the normalized status (400 `invalid`, 401, 403, 500, 502, …).
 */
export type EventStreamFailure = { ok: false; failure: TicketFailure };

/** One parser output: a validated event, or a frame that was skipped and why. */
export type ParsedItem =
	| { type: 'event'; revision: number; kind: string; payload: EventPayload }
	| { type: 'malformed'; reason: string; revision: number | null };

export type FactoryEvent = Extract<ParsedItem, { type: 'event' }>;

export type EventParser = {
	/** Feed decoded text; returns the items completed by it. */
	push(text: string): ParsedItem[];
	/** The stream ended: drop any unterminated frame (SSE never dispatches one). */
	end(): ParsedItem[];
};

/**
 * A revision cursor (`Last-Event-ID`, `?since`, an event `id`): a non-negative
 * safe integer written in decimal digits only. Anything else is invalid.
 */
export function parseRevision(
	raw: string | null | undefined
): { ok: true; value: number } | { ok: false } {
	if (raw == null || !/^\d+$/.test(raw)) return { ok: false };
	const value = Number(raw);
	return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const NULLABLE_STRINGS = ['ticket', 'task', 'run', 'card'] as const;

/** The minimal payload check; missing fields become null. */
function toPayload(data: unknown): EventPayload | string {
	if (!isRecord(data)) return 'payload is not an object';
	const fields: Partial<Record<(typeof NULLABLE_STRINGS)[number], string | null>> = {};
	for (const name of NULLABLE_STRINGS) {
		const value = data[name] ?? null;
		if (value !== null && typeof value !== 'string') return `payload ${name} is not a string`;
		fields[name] = value;
	}
	const actor = data.actor ?? null;
	if (actor !== null && !(isRecord(actor) && typeof actor.client === 'string')) {
		return 'payload actor is invalid';
	}
	return {
		actor:
			actor === null
				? null
				: {
						client: actor.client as string,
						onBehalfOf: typeof actor.onBehalfOf === 'string' ? actor.onBehalfOf : null
					},
		card: fields.card ?? null,
		run: fields.run ?? null,
		task: fields.task ?? null,
		ticket: fields.ticket ?? null
	};
}

/** An incremental parser following the WHATWG SSE line rules. */
export function createEventParser(): EventParser {
	let buffer = '';
	// A chunk ended in `\r`: a `\n` starting the next chunk belongs to that line end.
	let skipLeadingLf = false;
	let data: string[] = [];
	let id: string | null = null;
	let kind = '';

	function dispatch(): ParsedItem | null {
		const lines = data;
		const rawId = id;
		const eventKind = kind || 'message';
		data = [];
		id = null;
		kind = '';
		if (lines.length === 0) return null;

		const parsed = parseRevision(rawId);
		const revision = parsed.ok ? parsed.value : null;
		if (!parsed.ok) {
			return {
				type: 'malformed',
				reason: rawId === null ? 'missing id' : 'id is not a revision',
				revision
			};
		}
		let json: unknown;
		try {
			json = JSON.parse(lines.join('\n'));
		} catch {
			return { type: 'malformed', reason: 'data is not JSON', revision };
		}
		const payload = toPayload(json);
		if (typeof payload === 'string') return { type: 'malformed', reason: payload, revision };
		return { type: 'event', revision: parsed.value, kind: eventKind, payload };
	}

	function line(text: string): ParsedItem | null {
		if (text === '') return dispatch();
		if (text.startsWith(':')) return null;
		const colon = text.indexOf(':');
		const field = colon === -1 ? text : text.slice(0, colon);
		let value = colon === -1 ? '' : text.slice(colon + 1);
		if (value.startsWith(' ')) value = value.slice(1);
		if (field === 'data') data.push(value);
		else if (field === 'id') {
			// The spec ignores an id containing NUL.
			if (!value.includes('\0')) id = value;
		} else if (field === 'event') kind = value;
		return null;
	}

	function push(text: string): ParsedItem[] {
		if (skipLeadingLf && text.startsWith('\n')) text = text.slice(1);
		skipLeadingLf = false;
		buffer += text;
		const items: ParsedItem[] = [];
		let start = 0;
		for (let i = 0; i < buffer.length; i++) {
			const char = buffer[i];
			if (char !== '\n' && char !== '\r') continue;
			const item = line(buffer.slice(start, i));
			if (item) items.push(item);
			if (char === '\r') {
				if (i + 1 === buffer.length) skipLeadingLf = true;
				else if (buffer[i + 1] === '\n') i++;
			}
			start = i + 1;
		}
		buffer = buffer.slice(start);
		return items;
	}

	function end(): ParsedItem[] {
		buffer = '';
		data = [];
		id = null;
		kind = '';
		skipLeadingLf = false;
		return [];
	}

	return { push, end };
}

/** Every event refreshes these: the board's tickets and agents. */
export const TICKETS_KEY = 'factory:tickets';
export const AGENTS_KEY = 'factory:agents';
export const BACKLOG_KEY = 'factory:backlog';

/** The dependency key of one ticket's detail. */
export function ticketKey(key: string): string {
	return `factory:ticket:${encodeURIComponent(key)}`;
}

/** The dependency key of one ticket's runs. */
export function runsKey(key: string): string {
	return `factory:runs:${encodeURIComponent(key)}`;
}

/** The dashboard resources an event names. Deliberately broad: unknown kinds still refresh the board. */
export function keysForEvent(event: Pick<FactoryEvent, 'kind' | 'payload'>): string[] {
	const keys = [TICKETS_KEY, AGENTS_KEY];
	const ticket = event.payload.ticket;
	if (ticket !== null) keys.push(ticketKey(ticket), runsKey(ticket));
	if (event.kind === 'start') keys.push(BACKLOG_KEY);
	return keys;
}
