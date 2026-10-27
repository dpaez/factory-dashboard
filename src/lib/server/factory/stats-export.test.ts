import { describe, expect, it } from 'vitest';

import {
	problemTrackerUnavailable,
	problemValidationError,
	statsExportComplete,
	statsExportCompleteText
} from '$lib/factory/fixtures';

import {
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	type FakeFactoryOptions
} from '../../../../test/fake-factory';

import { createFactoryClient } from './client';
import { CONTRACT_ERROR, NETWORK_ERROR } from './errors';
import { readStatsExport } from './stats-export';

const BASE_URL = 'http://127.0.0.1:7731';
const TOKEN = 'secret-token-abc123';
const WINDOW = { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' };

/** A body that enqueues `chunks`, then ends, errors, or stays open; it records cancellation. */
function streamOf(chunks: Uint8Array[], end: 'close' | 'error' | 'hang' = 'close') {
	const state = { cancelled: false, pulled: 0 };
	const queue = [...chunks];
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			const chunk = queue.shift();
			if (chunk) {
				state.pulled++;
				controller.enqueue(chunk);
			} else if (end === 'close') controller.close();
			else if (end === 'error') controller.error(new Error('socket hang up'));
			else return new Promise(() => {});
		},
		cancel() {
			state.cancelled = true;
		}
	});
	return { stream, state };
}

/** Split `text` into `count` byte chunks at arbitrary offsets. */
function chunksOf(text: string, count: number): Uint8Array[] {
	const bytes = new TextEncoder().encode(text);
	const size = Math.ceil(bytes.length / count);
	const chunks: Uint8Array[] = [];
	for (let start = 0; start < bytes.length; start += size) {
		chunks.push(bytes.subarray(start, start + size));
	}
	return chunks;
}

function fakeClient(respond: (request: Request) => Response | Promise<Response>) {
	const requests: Request[] = [];
	const client = createFactoryClient({
		baseUrl: BASE_URL,
		token: TOKEN,
		fetch: async (request) => {
			requests.push(request);
			return respond(request);
		}
	});
	return { client, requests };
}

const ndjson = (body: ReadableStream<Uint8Array> | string, status = 200) =>
	new Response(body, { status, headers: { 'content-type': 'application/x-ndjson' } });

describe('readStatsExport', () => {
	it('reads the export for the window, streamed in chunks, as a complete result', async () => {
		const { stream } = streamOf(chunksOf(statsExportCompleteText, 9));
		const { client, requests } = fakeClient(() => ndjson(stream));
		const result = await readStatsExport(client, WINDOW);

		expect(requests).toHaveLength(1);
		const url = new URL(requests[0]?.url ?? '');
		expect(url.pathname).toBe('/v1/stats/export');
		expect([...url.searchParams]).toEqual([
			['from', WINDOW.from],
			['to', WINDOW.to]
		]);
		expect(requests[0]?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);

		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(true);
		expect(result.diagnostics).toEqual([]);
		expect(result.tickets).toHaveLength(26);
		expect(result.runs).toHaveLength(statsExportComplete.runs.length);
		expect(result.envelope).toEqual({ factoryId: 'factory-geut-01', definitions: 'stats.v1' });
	});

	it('a Problem response is a normalized failure without the upstream detail', async () => {
		const { client } = fakeClient(
			() =>
				new Response(JSON.stringify(problemTrackerUnavailable), {
					status: problemTrackerUnavailable.status,
					headers: { 'content-type': 'application/problem+json' }
				})
		);
		const result = await readStatsExport(client, WINDOW);
		expect(result).toEqual({
			ok: false,
			failure: {
				status: 503,
				type: 'tracker_unavailable',
				title: 'Tracker unavailable',
				retryable: true
			}
		});
		expect(JSON.stringify(result)).not.toContain(problemTrackerUnavailable.detail);
	});

	it('a transport failure carries no detail either', async () => {
		const { client } = fakeClient(() => Promise.reject(new TypeError('fetch failed')));
		const result = await readStatsExport(client, WINDOW);
		if (result.ok) throw new Error('expected a failure');
		expect(result.failure).not.toHaveProperty('detail');
	});

	it.each([
		['a 2xx other than 200', () => ndjson(statsExportCompleteText, 206), CONTRACT_ERROR],
		['an HTML error page', () => new Response('<html>', { status: 502 }), CONTRACT_ERROR],
		['a fetch that rejects', () => Promise.reject(new TypeError('fetch failed')), NETWORK_ERROR]
	])('%s is a normalized failure', async (_name, respond, type) => {
		const { client } = fakeClient(respond);
		const result = await readStatsExport(client, WINDOW);
		expect(result).toMatchObject({ ok: false, failure: { type } });
	});

	it('a read error mid-body yields not complete with the lines read so far', async () => {
		const lines = statsExportCompleteText.split('\n');
		const head = `${lines.slice(0, 5).join('\n')}\n${lines[5]?.slice(0, 20)}`;
		const { stream } = streamOf(chunksOf(head, 3), 'error');
		const { client } = fakeClient(() => ndjson(stream));
		const result = await readStatsExport(client, WINDOW);
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(false);
		expect(result.tickets).toHaveLength(5);
		expect(result.diagnostics).toEqual([{ line: 6, reason: 'read failed' }]);
	});

	it('an abort mid-body yields not complete', async () => {
		const abort = new AbortController();
		// The body never ends on its own: only the abort can stop the read.
		const { stream, state } = streamOf(
			chunksOf(statsExportCompleteText.split('\n')[0] + '\n', 1),
			'hang'
		);
		const { client } = fakeClient(() => ndjson(stream));
		const read = readStatsExport(client, WINDOW, { signal: abort.signal });
		setTimeout(() => abort.abort(), 10);
		const result = await read;
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(false);
		expect(result.tickets).toHaveLength(1);
		expect(result.diagnostics).toEqual([{ line: 2, reason: 'read aborted' }]);
		expect(state.cancelled).toBe(true);
	});

	it('the line bound stops reading, cancels the body, and is not complete', async () => {
		const { stream, state } = streamOf(chunksOf(statsExportCompleteText, 40));
		const { client } = fakeClient(() => ndjson(stream));
		const result = await readStatsExport(client, WINDOW, { maxLines: 10 });
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(false);
		expect(result.tickets).toHaveLength(10);
		expect(result.diagnostics).toEqual([{ line: 11, reason: 'line limit reached' }]);
		expect(state.cancelled).toBe(true);
		expect(state.pulled).toBeLessThan(40);
	});

	it('blank lines past the line bound stop reading and cancel the body', async () => {
		const [first] = statsExportCompleteText.split('\n');
		const blanks = new TextEncoder().encode('\n'.repeat(10));
		const { stream, state } = streamOf([
			new TextEncoder().encode(`${first}\n`),
			blanks,
			...chunksOf(statsExportCompleteText, 10)
		]);
		const { client } = fakeClient(() => ndjson(stream));
		const result = await readStatsExport(client, WINDOW, { maxLines: 3 });
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(false);
		expect(result.tickets).toHaveLength(1);
		expect(result.diagnostics).toEqual([{ line: 4, reason: 'line limit reached' }]);
		expect(state.cancelled).toBe(true);
		// The stream may queue one chunk ahead; the 10 export chunks are never read.
		expect(state.pulled).toBeLessThanOrEqual(3);
	});

	it('a whitespace-only final fragment past the line bound is not complete', async () => {
		const [first] = statsExportCompleteText.split('\n');
		const { stream } = streamOf([new TextEncoder().encode(`${first}\n\n\n \t`)]);
		const { client } = fakeClient(() => ndjson(stream));
		const result = await readStatsExport(client, WINDOW, { maxLines: 3 });
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(false);
		expect(result.tickets).toHaveLength(1);
		expect(result.diagnostics).toEqual([{ line: 4, reason: 'line limit reached' }]);
	});

	it('the byte bound stops reading, cancels the body, and is not complete', async () => {
		const { stream, state } = streamOf(chunksOf(statsExportCompleteText, 40));
		const { client } = fakeClient(() => ndjson(stream));
		const maxBytes = Math.floor(new TextEncoder().encode(statsExportCompleteText).length / 4);
		const result = await readStatsExport(client, WINDOW, { maxBytes });
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(false);
		expect(result.diagnostics.at(-1)?.reason).toBe('byte limit reached');
		expect(result.tickets.length).toBeGreaterThan(0);
		expect(state.cancelled).toBe(true);
		expect(state.pulled).toBeLessThan(40);
	});
});

describe('readStatsExport against the fake factory', () => {
	async function fakeRead(options: FakeFactoryOptions = {}) {
		const fake = createFakeFactory(options);
		let chunks = 0;
		const client = createFactoryClient({
			baseUrl: BASE_URL,
			token: FAKE_FACTORY_TOKEN,
			fetch: async (request) => {
				const response = await fake.handle(request);
				if (!response.body) return response;
				// Count the writes the fake makes.
				const counted = response.body.pipeThrough(
					new TransformStream<Uint8Array, Uint8Array>({
						transform(chunk, controller) {
							chunks++;
							controller.enqueue(chunk);
						}
					})
				);
				return new Response(counted, { status: response.status, headers: response.headers });
			}
		});
		const result = await readStatsExport(client, WINDOW);
		return { result, fake, chunks };
	}

	it('serves the complete export in several chunks and records the window', async () => {
		const { result, fake, chunks } = await fakeRead();
		expect(chunks).toBeGreaterThan(1);
		expect(fake.exportRequests).toEqual([WINDOW]);
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(true);
		expect(result.tickets).toHaveLength(26);
		expect(result.tickets.filter((line) => line.outcome === 'merged')).toHaveLength(16);
	});

	it.each([
		['zeroMerges', 6],
		['empty', 0]
	] as const)('serves the %s cohort', async (statsExportCohort, tickets) => {
		const { result } = await fakeRead({ statsExportCohort });
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(true);
		expect(result.tickets).toHaveLength(tickets);
	});

	it('honours failStatsExport with a Problem', async () => {
		const { result } = await fakeRead({ failStatsExport: problemValidationError });
		expect(result).toMatchObject({ ok: false, failure: { type: 'validation_error' } });
	});

	it('honours statsExportMalformed', async () => {
		const { result } = await fakeRead({ statsExportMalformed: true });
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(false);
		expect(result.diagnostics).toEqual([
			{ line: 2, reason: 'not JSON' },
			{ line: 3, reason: 'unknown type' }
		]);
		expect(result.tickets).toHaveLength(26);
	});

	it('honours statsExportTruncate', async () => {
		const { result } = await fakeRead({ statsExportTruncate: true });
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(false);
		expect(result.diagnostics.map((item) => item.reason)).toEqual(['truncated line']);
	});

	it('the mismatch cohort carries another factory envelope', async () => {
		const { result } = await fakeRead({ statsExportCohort: 'mismatch' });
		if (!result.ok) throw new Error('expected ok');
		expect(result.complete).toBe(true);
		expect(result.envelope?.factoryId).toBe('factory-geut-02');
	});
});
