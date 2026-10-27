import { describe, expect, it } from 'vitest';

import {
	statsCompleteSummary,
	statsExportComplete,
	statsExportCompleteText,
	statsExportEmpty,
	statsExportMalformedText,
	statsExportText,
	statsExportTruncatedText,
	statsExportZeroMerges,
	statsZeroMergesSummary,
	toNdjson
} from './fixtures';
import { createStatsExportParser, type StatsExportParse } from './stats-export';

function parseAll(...chunks: string[]): StatsExportParse {
	const parser = createStatsExportParser();
	for (const chunk of chunks) parser.push(chunk);
	return parser.end();
}

/** Decode `bytes` split at `offsets` through one streaming decoder, as the reader does. */
function parseBytes(bytes: Uint8Array, offsets: number[]): StatsExportParse {
	const decoder = new TextDecoder('utf-8');
	const parser = createStatsExportParser();
	let start = 0;
	for (const offset of [...offsets, bytes.length]) {
		parser.push(decoder.decode(bytes.subarray(start, offset), { stream: true }));
		start = offset;
	}
	parser.push(decoder.decode());
	return parser.end();
}

const [ticket, secondTicket] = statsExportComplete.tickets;
const [run] = statsExportComplete.runs;
if (!ticket || !secondTicket || !run) throw new Error('fixture lines missing');

const ticketOf = (line: typeof ticket) => ({
	type: line.type,
	execution: line.execution,
	key: line.key,
	displayRef: line.displayRef,
	outcome: line.outcome,
	startedAt: line.startedAt,
	handedOffAt: line.handedOffAt,
	startToHandoffMs: line.startToHandoffMs,
	factoryMs: line.factoryMs,
	costUsd: line.costUsd,
	tokens: line.tokens,
	definitions: line.definitions,
	factoryId: line.factoryId
});

describe('stats export fixtures', () => {
	it('the complete export reconciles with the spec 04 summary', () => {
		const { tickets, runs } = statsExportComplete;
		expect(tickets).toHaveLength(statsCompleteSummary.started);
		expect(tickets.filter((line) => line.outcome === 'merged')).toHaveLength(16);
		const cents = tickets.reduce((sum, line) => sum + Math.round(line.costUsd * 100), 0);
		expect(cents / 100).toBe(statsCompleteSummary.costUsd);
		expect(tickets.filter((line) => line.handedOffAt !== null)).toHaveLength(
			statsCompleteSummary.handedOff
		);
		for (const [outcome, count] of Object.entries(statsCompleteSummary.outcomes)) {
			expect(
				tickets.filter((line) => line.outcome === outcome),
				outcome
			).toHaveLength(count);
		}
		const purposes = new Set(runs.map((line) => line.purpose));
		expect(purposes).toContain('return_to_work');
		expect(purposes).toContain('validation_correction');
		expect(runs.some((line) => line.infrastructureLost)).toBe(true);
		expect(runs.some((line) => line.purpose === 'return_to_work' && line.infrastructureLost)).toBe(
			true
		);
		expect(runs.some((line) => line.tokensInput === null && line.tokens === 0)).toBe(true);
	});

	it('the zero-merges export matches its summary', () => {
		const { tickets } = statsExportZeroMerges;
		expect(tickets).toHaveLength(statsZeroMergesSummary.started);
		expect(tickets.some((line) => line.outcome === 'merged')).toBe(false);
		const cents = tickets.reduce((sum, line) => sum + Math.round(line.costUsd * 100), 0);
		expect(cents / 100).toBe(statsZeroMergesSummary.costUsd);
	});
});

describe('createStatsExportParser', () => {
	it('parses the complete export into validated tickets and runs', () => {
		const result = parseAll(statsExportCompleteText);
		expect(result.complete).toBe(true);
		expect(result.diagnostics).toEqual([]);
		expect(result.tickets).toHaveLength(26);
		expect(result.runs).toHaveLength(statsExportComplete.runs.length);
		expect(result.tickets[0]).toEqual(ticketOf(ticket));
		expect(result.envelope).toEqual({ factoryId: 'factory-geut-01', definitions: 'stats.v1' });
		// Only the validated fields are kept.
		expect(result.runs[0]).not.toHaveProperty('model');
		expect(result.runs[0]).toMatchObject({
			type: 'run',
			execution: run.execution,
			purpose: run.purpose,
			tokensInput: run.tokensInput
		});
	});

	it('an empty body is a complete, empty export', () => {
		expect(parseAll(statsExportText(statsExportEmpty))).toEqual({
			tickets: [],
			runs: [],
			envelope: null,
			complete: true,
			diagnostics: []
		});
	});

	it('yields the same records for any chunking, including inside a multibyte character', () => {
		const bytes = new TextEncoder().encode(statsExportCompleteText);
		expect(bytes.length).toBeGreaterThan(statsExportCompleteText.length); // non-ASCII present
		const multibyte = statsExportCompleteText.indexOf('ü');
		const inside = new TextEncoder().encode(statsExportCompleteText.slice(0, multibyte)).length + 1;
		const whole = parseAll(statsExportCompleteText);
		const chunkings: Array<[string, number[]]> = [
			['inside a multibyte character', [inside]],
			[
				'every 7 bytes',
				Array.from({ length: Math.floor(bytes.length / 7) }, (_, i) => (i + 1) * 7)
			],
			[
				'every 1000 bytes',
				Array.from({ length: Math.floor(bytes.length / 1000) }, (_, i) => (i + 1) * 1000)
			],
			['right before and after a newline', [bytes.indexOf(10), bytes.indexOf(10) + 1]]
		];
		for (const [name, offsets] of chunkings) {
			expect(parseBytes(bytes, offsets), name).toEqual(whole);
		}
		// Every byte offset of the first two lines.
		const head = new TextEncoder().encode(
			toNdjson([{ ...ticket, displayRef: 'jürgen/fábrica#7' }, secondTicket])
		);
		const headWhole = parseBytes(head, []);
		expect(headWhole.complete).toBe(true);
		for (let offset = 0; offset <= head.length; offset++) {
			expect(parseBytes(head, [offset]), `split at byte ${offset}`).toEqual(headWhole);
		}
	});

	it('blank lines and \\r\\n line ends produce no records and no diagnostics', () => {
		const text = statsExportCompleteText.replaceAll('\n', '\r\n');
		const result = parseAll('\n', '   \n\r\n', text, '\t\n', '\n');
		expect(result).toEqual(parseAll(statsExportCompleteText));
		// A `\r\n` split between chunks.
		const [line] = text.split('\r\n');
		expect(parseAll(`${line}\r`, '\n').tickets).toHaveLength(1);
		expect(parseAll(`${line}\r`, '\n').diagnostics).toEqual([]);
	});

	it.each([
		['not JSON', '{"type":"ticket",', 'not JSON'],
		['not an object', '[1,2]', 'not an object'],
		['an unknown type', JSON.stringify({ ...ticket, type: 'stage' }), 'unknown type'],
		['a missing field', JSON.stringify({ ...ticket, key: undefined }), 'missing key'],
		['a mistyped field', JSON.stringify({ ...ticket, costUsd: '1.60' }), 'invalid costUsd'],
		['an unknown outcome', JSON.stringify({ ...ticket, outcome: 'shipped' }), 'invalid outcome'],
		['a non-finite number', JSON.stringify({ ...ticket, tokens: null }), 'invalid tokens'],
		[
			'an unknown purpose',
			JSON.stringify({ ...run, purpose: 'operator_nudge' }),
			'invalid purpose'
		],
		['an unknown stage', JSON.stringify({ ...run, stage: 'deploy' }), 'invalid stage'],
		['a mistyped passed', JSON.stringify({ ...run, passed: 'yes' }), 'invalid passed'],
		[
			'a mistyped returnedFrom',
			JSON.stringify({ ...run, returnedFrom: 'ship' }),
			'invalid returnedFrom'
		],
		['a mistyped tokensInput', JSON.stringify({ ...run, tokensInput: '5' }), 'invalid tokensInput'],
		[
			'a mistyped infrastructureLost',
			JSON.stringify({ ...run, infrastructureLost: 1 }),
			'invalid infrastructureLost'
		]
	])('a line with %s is a diagnostic; the others still parse', (_name, bad, reason) => {
		const text = `${toNdjson([ticket])}${bad}\n${toNdjson([secondTicket, run])}`;
		const result = parseAll(text);
		expect(result.diagnostics).toEqual([{ line: 2, reason }]);
		expect(result.complete).toBe(false);
		expect(result.tickets).toHaveLength(2);
		expect(result.runs).toHaveLength(1);
	});

	it('diagnostics carry the line number and reason, never content', () => {
		const result = parseAll(statsExportMalformedText);
		expect(result.diagnostics).toEqual([
			{ line: 2, reason: 'not JSON' },
			{ line: 3, reason: 'unknown type' }
		]);
		expect(result.tickets).toHaveLength(26);
		expect(result.complete).toBe(false);
		expect(JSON.stringify(result.diagnostics)).not.toContain('factory-geut');
	});

	it('a stream cut mid-line is truncated and not complete', () => {
		const result = parseAll(statsExportTruncatedText);
		const lines = statsExportCompleteText.split('\n').filter(Boolean).length;
		expect(result.diagnostics).toEqual([{ line: lines, reason: 'truncated line' }]);
		expect(result.complete).toBe(false);
		expect(result.runs).toHaveLength(statsExportComplete.runs.length - 1);
	});

	it('a final valid line without a trailing newline is accepted and complete', () => {
		const result = parseAll(statsExportCompleteText.slice(0, -1));
		expect(result).toEqual(parseAll(statsExportCompleteText));
		expect(result.complete).toBe(true);
		// With `\r` and no `\n` too.
		expect(parseAll(`${JSON.stringify(ticket)}\r`).complete).toBe(true);
	});

	it('a ticket line after a run line is not complete', () => {
		const result = parseAll(toNdjson([ticket, run, secondTicket]));
		expect(result.diagnostics).toEqual([{ line: 3, reason: 'ticket line after a run line' }]);
		expect(result.complete).toBe(false);
		expect(result.tickets).toHaveLength(2);
	});

	it('a run for an unknown execution is not complete', () => {
		const result = parseAll(toNdjson([secondTicket, run]));
		expect(result.diagnostics).toEqual([{ line: 2, reason: 'run for an unknown execution' }]);
		expect(result.complete).toBe(false);
	});

	it('mixed factoryId is not complete', () => {
		const result = parseAll(toNdjson([ticket, { ...secondTicket, factoryId: 'factory-geut-02' }]));
		expect(result.diagnostics).toEqual([{ line: 2, reason: 'mixed factoryId or definitions' }]);
		expect(result.complete).toBe(false);
		expect(result.envelope).toEqual({ factoryId: 'factory-geut-01', definitions: 'stats.v1' });
	});

	it('definitions other than stats.v1 are invalid, even when every line agrees', () => {
		const v2 = { definitions: 'stats.v2' };
		const result = parseAll(
			toNdjson([
				{ ...ticket, ...v2 },
				{ ...secondTicket, ...v2 },
				{ ...run, ...v2 }
			])
		);
		expect(result.diagnostics).toEqual([
			{ line: 1, reason: 'invalid definitions' },
			{ line: 2, reason: 'invalid definitions' },
			{ line: 3, reason: 'invalid definitions' }
		]);
		expect(result.complete).toBe(false);
		expect(result.envelope).toBeNull();
	});

	it('the line bound stops reading and is not complete', () => {
		const parser = createStatsExportParser({ maxLines: 3 });
		expect(parser.push(toNdjson([ticket, secondTicket]))).toBe(true);
		expect(parser.push(statsExportCompleteText)).toBe(false);
		expect(parser.push(statsExportCompleteText)).toBe(false);
		const result = parser.end();
		expect(result.tickets).toHaveLength(3);
		expect(result.diagnostics).toEqual([{ line: 4, reason: 'line limit reached' }]);
		expect(result.complete).toBe(false);
	});

	it('blank lines count toward the line bound', () => {
		const parser = createStatsExportParser({ maxLines: 3 });
		expect(parser.push(`${toNdjson([ticket])}\n\n\n`)).toBe(false);
		const result = parser.end();
		expect(result.tickets).toHaveLength(1);
		expect(result.diagnostics).toEqual([{ line: 4, reason: 'line limit reached' }]);
		expect(result.complete).toBe(false);
	});

	it('a whitespace-only final fragment counts toward the line bound', () => {
		const parser = createStatsExportParser({ maxLines: 3 });
		expect(parser.push(`${toNdjson([ticket])}\n\n  `)).toBe(true);
		const result = parser.end();
		expect(result.tickets).toHaveLength(1);
		expect(result.diagnostics).toEqual([{ line: 4, reason: 'line limit reached' }]);
		expect(result.complete).toBe(false);
		// Within the bound, the same blank fragment is skipped and the export is complete.
		const within = createStatsExportParser({ maxLines: 4 });
		within.push(`${toNdjson([ticket])}\n\n  `);
		expect(within.end()).toMatchObject({ complete: true, diagnostics: [] });
	});

	it('a failed read keeps the lines read so far and is not complete', () => {
		const parser = createStatsExportParser();
		parser.push(`${toNdjson([ticket])}{"type":"tic`);
		const result = parser.fail('read failed');
		expect(result.tickets).toHaveLength(1);
		expect(result.diagnostics).toEqual([{ line: 2, reason: 'read failed' }]);
		expect(result.complete).toBe(false);
	});

	it('never throws on hostile input', () => {
		const parser = createStatsExportParser();
		for (const text of ['\0', '\uFFFD\n', 'null\n', '"x"\n', '{"__proto__":{"type":"ticket"}}\n']) {
			expect(() => parser.push(text)).not.toThrow();
		}
		const result = parser.end();
		expect(result.complete).toBe(false);
		expect(result.diagnostics.map((item) => item.line)).toEqual([1, 2, 3, 4]);
	});
});
