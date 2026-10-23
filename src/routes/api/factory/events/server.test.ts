import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEventParser, type EventStreamFailure, type ParsedItem } from '$lib/factory/events';
import { eventCard, eventStart, eventValidationFinished } from '$lib/factory/fixtures';

import { FAKE_FACTORY_TOKEN, createFakeFactory } from '../../../../../test/fake-factory';
import * as handlers from './+server';

vi.mock('$env/dynamic/private', () => ({
	env: {
		get FACTORY_API_URL() {
			return process.env.FACTORY_API_URL;
		},
		get FACTORY_API_TOKEN() {
			return process.env.FACTORY_API_TOKEN;
		},
		get FACTORY_OPERATOR_NAME() {
			return process.env.FACTORY_OPERATOR_NAME;
		}
	}
}));

const FACTORY_HOST = 'factory.events-handler-test.internal';
const FACTORY_URL = `http://${FACTORY_HOST}:7731`;
const UPSTREAM = 'upstream-secret-body-marker';

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
	process.env.FACTORY_OPERATOR_NAME = 'Diego';
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
	delete process.env.FACTORY_OPERATOR_NAME;
});

type Upstream = {
	fetch: (request: Request) => Promise<Response>;
	requests: Request[];
	/** Enqueue text on the open upstream body. */
	write(text: string): void;
	/** End the upstream body. */
	end(): void;
	/** The upstream request's signal aborted. */
	aborted(): boolean;
};

/** A fake upstream whose 200 body is a stream the test writes to by hand. */
function controllableUpstream(): Upstream {
	const requests: Request[] = [];
	let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
	const encoder = new TextEncoder();
	return {
		requests,
		async fetch(request) {
			requests.push(request);
			const body = new ReadableStream<Uint8Array>({
				start(c) {
					controller = c;
				}
			});
			return new Response(body, {
				headers: {
					'content-type': 'text/event-stream',
					'set-cookie': `session=${UPSTREAM}`,
					authorization: `Bearer ${FAKE_FACTORY_TOKEN}`,
					'x-upstream': FACTORY_URL
				}
			});
		},
		write: (text) => controller?.enqueue(encoder.encode(text)),
		end: () => controller?.close(),
		aborted: () => requests[0]?.signal.aborted ?? false
	};
}

function get(
	fetch: (request: Request) => Promise<Response>,
	{
		headers = {},
		search = '',
		signal = new AbortController().signal
	}: { headers?: Record<string, string>; search?: string; signal?: AbortSignal } = {}
) {
	const url = new URL(`http://dashboard.test/api/factory/events${search}`);
	const request = new Request(url, { headers, signal });
	const event = { fetch, request, url } as unknown as Parameters<typeof handlers.GET>[0];
	return handlers.GET(event);
}

/** Read and parse the response until `count` items arrived. */
async function readItems(response: Response, count: number): Promise<ParsedItem[]> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	const parser = createEventParser();
	const items: ParsedItem[] = [];
	while (items.length < count) {
		const { done, value } = await reader.read();
		if (done) break;
		items.push(...parser.push(decoder.decode(value, { stream: true })));
	}
	reader.releaseLock();
	return items;
}

function expectSafe(text: string) {
	expect(text).not.toContain(FAKE_FACTORY_TOKEN);
	expect(text).not.toContain(FACTORY_URL);
	expect(text).not.toContain(FACTORY_HOST);
	expect(text).not.toContain(UPSTREAM);
}

function headerText(response: Response) {
	return [...response.headers].map(([name, value]) => `${name}: ${value}`).join('\n');
}

describe('GET /api/factory/events', () => {
	it('forwards Last-Event-ID and since, with the bearer, to /v1/events', async () => {
		const upstream = controllableUpstream();
		const response = await get(upstream.fetch, {
			headers: { 'last-event-id': '41' },
			search: '?since=7'
		});
		expect(response.status).toBe(200);
		const [sent] = upstream.requests;
		const sentUrl = new URL(sent!.url);
		expect(`${sentUrl.origin}${sentUrl.pathname}`).toBe(`${FACTORY_URL}/v1/events`);
		expect(sentUrl.searchParams.get('since')).toBe('7');
		expect(sent!.method).toBe('GET');
		expect(sent!.headers.get('last-event-id')).toBe('41');
		expect(sent!.headers.get('accept')).toBe('text/event-stream');
		expect(sent!.headers.get('authorization')).toBe(`Bearer ${FAKE_FACTORY_TOKEN}`);
		expect(sent!.headers.get('x-factory-on-behalf-of')).toBe('Diego');
		await response.body!.cancel();
	});

	it('sends no cursor when the browser sent none', async () => {
		const upstream = controllableUpstream();
		const response = await get(upstream.fetch);
		const sent = upstream.requests[0]!;
		expect(sent.headers.has('last-event-id')).toBe(false);
		expect(new URL(sent.url).search).toBe('');
		await response.body!.cancel();
	});

	it('streams the first chunk before the upstream closes', async () => {
		const upstream = controllableUpstream();
		const response = await get(upstream.fetch);
		const reader = response.body!.getReader();
		upstream.write(': from revision 3\n\nid: 4\nevent: card\n');
		const first = await reader.read();
		expect(new TextDecoder().decode(first.value)).toBe(': from revision 3\n\nid: 4\nevent: card\n');
		upstream.write('data: {}\n\n');
		const second = await reader.read();
		expect(new TextDecoder().decode(second.value)).toBe('data: {}\n\n');
		upstream.end();
		expect((await reader.read()).done).toBe(true);
	});

	it('aborts the upstream request when the client disconnects', async () => {
		const upstream = controllableUpstream();
		const client = new AbortController();
		const response = await get(upstream.fetch, { signal: client.signal });
		expect(upstream.aborted()).toBe(false);
		client.abort();
		expect(upstream.aborted()).toBe(true);
		// The client stream ends quietly instead of erroring.
		const reader = response.body!.getReader();
		expect((await reader.read()).done).toBe(true);
	});

	it('aborts the upstream request when the response body is cancelled', async () => {
		const upstream = controllableUpstream();
		const response = await get(upstream.fetch);
		expect(upstream.aborted()).toBe(false);
		await response.body!.cancel();
		expect(upstream.aborted()).toBe(true);
	});

	it('sets its own headers: no authorization, no set-cookie, no token or factory host', async () => {
		const upstream = controllableUpstream();
		const response = await get(upstream.fetch);
		expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('x-accel-buffering')).toBe('no');
		expect(response.headers.has('authorization')).toBe(false);
		expect(response.headers.has('set-cookie')).toBe(false);
		expect(response.headers.has('x-upstream')).toBe(false);
		expectSafe(headerText(response));
		upstream.write(': from revision 0\n\n');
		upstream.end();
		expectSafe(await response.text());
	});

	it('delivers events from the fake factory after the cursor, and new ones as they happen', async () => {
		const fake = createFakeFactory();
		fake.emit({ kind: 'start', payload: eventStart });
		fake.emit({ kind: 'validation_finished', payload: eventValidationFinished });
		const client = new AbortController();
		const response = await get(fake.handle, {
			headers: { 'last-event-id': '1' },
			signal: client.signal
		});
		expect(response.status).toBe(200);
		expect(fake.connections).toEqual([{ lastEventId: '1', since: null, open: true }]);
		expect(await readItems(response, 1)).toEqual([
			{ type: 'event', revision: 2, kind: 'validation_finished', payload: eventValidationFinished }
		]);
		fake.emit({ kind: 'card', payload: eventCard });
		expect(await readItems(response, 1)).toEqual([
			{ type: 'event', revision: 3, kind: 'card', payload: eventCard }
		]);
		client.abort();
		expect(fake.openStreams()).toBe(0);
		expect(fake.connections[0]!.open).toBe(false);
	});

	it('an upstream 401 answers 401 with a safe failure body', async () => {
		process.env.FACTORY_API_TOKEN = 'not-the-token';
		const fake = createFakeFactory();
		const response = await get(fake.handle);
		const text = await response.text();
		const body = JSON.parse(text) as EventStreamFailure;
		expect(response.status).toBe(401);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(body).toMatchObject({ ok: false, failure: { type: 'unauthorized', retryable: false } });
		expect(text).not.toContain('not-the-token');
		expectSafe(text);
		expectSafe(headerText(response));
	});

	it('an upstream 500 answers its normalized status without the upstream body', async () => {
		const fake = createFakeFactory({
			failEvents: { status: 500, title: 'Internal error', type: 'internal_error', detail: 'x' }
		});
		const response = await get(fake.handle);
		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			ok: false,
			failure: { type: 'internal_error', retryable: true }
		});

		const broken = createFakeFactory({
			failEvents: { status: 500, title: UPSTREAM, type: 'nonsense' } as never
		});
		const contract = await get(broken.handle);
		const text = await contract.text();
		expect(contract.status).toBe(502);
		expect(JSON.parse(text)).toMatchObject({ ok: false, failure: { type: 'contract_error' } });
		expectSafe(text);
	});

	it('an upstream 2xx other than 200 is a contract failure, never a stream', async () => {
		for (const status of [201, 206]) {
			const upstream = controllableUpstream();
			const response = await get(async (request) => {
				const ok = await upstream.fetch(request);
				return new Response(ok.body, { status, headers: ok.headers });
			});
			const text = await response.text();
			expect(response.status, String(status)).toBe(502);
			expect(response.headers.get('content-type')).toContain('application/json');
			expect(JSON.parse(text)).toMatchObject({
				ok: false,
				failure: { type: 'contract_error', retryable: false }
			});
			expect(upstream.aborted()).toBe(true);
			expectSafe(text);
		}
	});

	it('a fetch rejection answers 502 network_error', async () => {
		const response = await get(async () => {
			throw new TypeError(`connect ECONNREFUSED ${FACTORY_URL}`);
		});
		const text = await response.text();
		expect(response.status).toBe(502);
		expect(JSON.parse(text)).toMatchObject({
			ok: false,
			failure: { type: 'network_error', retryable: true }
		});
		expectSafe(text);
	});

	it('missing configuration is a safe configuration_error with no upstream call', async () => {
		delete process.env.FACTORY_API_URL;
		const upstream = controllableUpstream();
		const response = await get(upstream.fetch);
		const text = await response.text();
		expect(response.status).toBe(500);
		expect(JSON.parse(text)).toMatchObject({
			ok: false,
			failure: { type: 'configuration_error', retryable: false }
		});
		expect(text).toContain('FACTORY_API_URL');
		expect(text).not.toContain(FAKE_FACTORY_TOKEN);
		expect(upstream.requests).toHaveLength(0);
	});

	it('an invalid Last-Event-ID or since is a 400 invalid with no upstream call', async () => {
		for (const options of [
			{ headers: { 'last-event-id': 'abc' } },
			{ headers: { 'last-event-id': '-1' } },
			{ search: '?since=1.5' },
			{ search: '?since=' }
		]) {
			const upstream = controllableUpstream();
			const response = await get(upstream.fetch, options);
			expect(response.status, JSON.stringify(options)).toBe(400);
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(await response.json()).toMatchObject({
				ok: false,
				failure: { type: 'invalid', retryable: false }
			});
			expect(upstream.requests).toHaveLength(0);
		}
	});

	it('exports GET only', () => {
		expect(Object.keys(handlers)).toEqual(['GET']);
	});
});
