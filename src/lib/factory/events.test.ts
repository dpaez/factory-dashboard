import { describe, expect, it } from 'vitest';

import {
	createEventParser,
	keysForEvent,
	parseRevision,
	runsKey,
	ticketKey,
	type ParsedItem
} from './events';
import {
	eventCard,
	eventFrame,
	eventNoTicket,
	eventRuntimeTerminal,
	eventStart,
	eventValidationFinished
} from './fixtures/events';

function parseAll(...chunks: string[]): ParsedItem[] {
	const parser = createEventParser();
	return [...chunks.flatMap((chunk) => parser.push(chunk)), ...parser.end()];
}

const body =
	': from revision 6\n\n' +
	eventFrame(7, 'card', eventCard) +
	': heartbeat\n\n' +
	eventFrame(8, 'start', eventStart) +
	eventFrame(9, 'runtime_terminal', eventRuntimeTerminal);

const expected: ParsedItem[] = [
	{ type: 'event', revision: 7, kind: 'card', payload: eventCard },
	{ type: 'event', revision: 8, kind: 'start', payload: eventStart },
	{ type: 'event', revision: 9, kind: 'runtime_terminal', payload: eventRuntimeTerminal }
];

describe('createEventParser', () => {
	it('parses a whole body in one chunk, skipping comments and heartbeats', () => {
		expect(parseAll(body)).toEqual(expected);
	});

	it('yields identical events for a UTF-8 body split at every byte offset', () => {
		const bytes = new TextEncoder().encode(body);
		expect(bytes.length).toBeGreaterThan(body.length); // non-ASCII present
		for (let offset = 0; offset <= bytes.length; offset++) {
			const decoder = new TextDecoder('utf-8');
			const parser = createEventParser();
			const items = [
				...parser.push(decoder.decode(bytes.subarray(0, offset), { stream: true })),
				...parser.push(decoder.decode(bytes.subarray(offset), { stream: true })),
				...parser.push(decoder.decode()),
				...parser.end()
			];
			expect(items, `split at byte ${offset}`).toEqual(expected);
		}
	});

	it('yields identical events when fed one byte at a time', () => {
		const bytes = new TextEncoder().encode(body);
		const decoder = new TextDecoder('utf-8');
		const parser = createEventParser();
		const items: ParsedItem[] = [];
		for (const byte of bytes) {
			items.push(...parser.push(decoder.decode(new Uint8Array([byte]), { stream: true })));
		}
		expect(items).toEqual(expected);
	});

	it('parses multiple frames in one chunk', () => {
		const items = parseAll(
			eventFrame(1, 'start', eventStart) +
				eventFrame(2, 'validation_finished', eventValidationFinished)
		);
		expect(items.map((item) => item.type === 'event' && [item.revision, item.kind])).toEqual([
			[1, 'start'],
			[2, 'validation_finished']
		]);
	});

	it('ignores heartbeat and `: from revision` comments', () => {
		expect(parseAll(': from revision 41\n\n', ': heartbeat\n\n', ':\n\n')).toEqual([]);
	});

	it('joins multiline data with newlines', () => {
		const [item] = parseAll('id: 3\nevent: card\ndata: {"ticket":\ndata: "k-1"}\n\n');
		expect(item).toMatchObject({ type: 'event', revision: 3, payload: { ticket: 'k-1' } });
		const [pretty] = parseAll('id: 4\ndata: {\ndata:  "card": "a"\ndata: }\n\n');
		expect(pretty).toMatchObject({ type: 'event', kind: 'message', payload: { card: 'a' } });
	});

	it('strips only one leading space from a value', () => {
		const [item] = parseAll('id:5\nevent:  spaced\ndata:{}\n\n');
		expect(item).toMatchObject({ type: 'event', revision: 5, kind: ' spaced' });
	});

	it('accepts CRLF and CR line ends, including a CR and LF split across chunks', () => {
		const crlf = eventFrame(10, 'start', eventStart).replaceAll('\n', '\r\n');
		expect(parseAll(crlf)).toEqual([
			{ type: 'event', revision: 10, kind: 'start', payload: eventStart }
		]);
		for (let i = 0; i <= crlf.length; i++) {
			expect(parseAll(crlf.slice(0, i), crlf.slice(i)), `split at ${i}`).toHaveLength(1);
		}
		const cr = eventFrame(11, 'card', eventCard).replaceAll('\n', '\r');
		expect(parseAll(cr)).toEqual([
			{ type: 'event', revision: 11, kind: 'card', payload: eventCard }
		]);
		// A `\r` then `\n` across chunks is one line end, not a blank line in between.
		expect(parseAll('id: 12\r', '\ndata: {}\r', '\n\r', '\n')).toEqual([
			{
				type: 'event',
				revision: 12,
				kind: 'message',
				payload: { actor: null, card: null, run: null, task: null, ticket: null }
			}
		]);
	});

	it('reports malformed JSON and still parses the next frame', () => {
		const items = parseAll(
			'id: 1\nevent: card\ndata: {not json\n\n' + eventFrame(2, 'start', eventStart)
		);
		expect(items).toEqual([
			{ type: 'malformed', reason: 'data is not JSON', revision: 1 },
			{ type: 'event', revision: 2, kind: 'start', payload: eventStart }
		]);
	});

	it('reports a missing or non-numeric id', () => {
		expect(parseAll('event: start\ndata: {}\n\n')).toEqual([
			{ type: 'malformed', reason: 'missing id', revision: null }
		]);
		for (const id of ['abc', '-1', '1.5', '', '99999999999999999999']) {
			expect(parseAll(`id: ${id}\ndata: {}\n\n`), id).toEqual([
				{ type: 'malformed', reason: 'id is not a revision', revision: null }
			]);
		}
	});

	it('reports an invalid payload', () => {
		const cases: [string, string][] = [
			['[]', 'payload is not an object'],
			['"text"', 'payload is not an object'],
			['null', 'payload is not an object'],
			['{"ticket":42}', 'payload ticket is not a string'],
			['{"card":{}}', 'payload card is not a string'],
			['{"actor":"pi"}', 'payload actor is invalid'],
			['{"actor":{"client":1}}', 'payload actor is invalid']
		];
		for (const [data, reason] of cases) {
			expect(parseAll(`id: 1\ndata: ${data}\n\n`), data).toEqual([
				{ type: 'malformed', reason, revision: 1 }
			]);
		}
	});

	it('normalizes missing payload fields to null', () => {
		const [item] = parseAll(
			'id: 1\nevent: start\ndata: {"ticket":"k","actor":{"client":"pi"}}\n\n'
		);
		expect(item).toEqual({
			type: 'event',
			revision: 1,
			kind: 'start',
			payload: {
				actor: { client: 'pi', onBehalfOf: null },
				card: null,
				run: null,
				task: null,
				ticket: 'k'
			}
		});
	});

	it('does not dispatch a frame without data, and ignores unknown fields', () => {
		expect(parseAll('id: 1\nevent: start\n\n', 'retry: 10\nfoo: bar\n\n')).toEqual([]);
		expect(parseAll('id: 2\nfoo: bar\ndata: {}\n\n')).toHaveLength(1);
	});

	it('drops an unterminated frame at the end of the stream', () => {
		const parser = createEventParser();
		expect(parser.push('id: 1\ndata: {}\n')).toEqual([]);
		expect(parser.end()).toEqual([]);
	});

	it('never throws on arbitrary input', () => {
		const junk = ['\u0000', '\r\r\n\n', 'data', ':::', 'id: 1\0\ndata: {}\n\n', '\uFFFD\n\n'];
		expect(() => parseAll(...junk)).not.toThrow();
	});
});

describe('parseRevision', () => {
	it('accepts non-negative safe integers only', () => {
		expect(parseRevision('0')).toEqual({ ok: true, value: 0 });
		expect(parseRevision('42')).toEqual({ ok: true, value: 42 });
		expect(parseRevision(String(Number.MAX_SAFE_INTEGER))).toEqual({
			ok: true,
			value: Number.MAX_SAFE_INTEGER
		});
		for (const raw of [null, undefined, '', ' 1', '-1', '1e3', '0x1', '1.0', '9007199254740992']) {
			expect(parseRevision(raw), String(raw)).toEqual({ ok: false });
		}
	});
});

describe('keysForEvent', () => {
	it('names tickets and agents for every event', () => {
		expect(keysForEvent({ kind: 'cancel', payload: eventNoTicket })).toEqual([
			'factory:tickets',
			'factory:agents'
		]);
	});

	it("names a ticket's detail and runs with an encoded key", () => {
		const payload = { ...eventValidationFinished, ticket: 'org/repo#1 a' };
		expect(keysForEvent({ kind: 'validation_finished', payload })).toEqual([
			'factory:tickets',
			'factory:agents',
			'factory:ticket:org%2Frepo%231%20a',
			'factory:runs:org%2Frepo%231%20a'
		]);
		expect(ticketKey('org/repo#1 a')).toBe('factory:ticket:org%2Frepo%231%20a');
		expect(runsKey('org/repo#1 a')).toBe('factory:runs:org%2Frepo%231%20a');
	});

	it('adds the backlog for a start, with or without a ticket', () => {
		expect(keysForEvent({ kind: 'start', payload: eventStart })).toEqual([
			'factory:tickets',
			'factory:agents',
			ticketKey(eventStart.ticket),
			runsKey(eventStart.ticket),
			'factory:backlog'
		]);
		expect(keysForEvent({ kind: 'start', payload: eventNoTicket })).toEqual([
			'factory:tickets',
			'factory:agents',
			'factory:backlog'
		]);
	});
});
