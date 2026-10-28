import { createEventParser, type ParsedItem } from '../src/lib/factory/events.ts';
import { eventCard, eventStart } from '../src/lib/factory/fixtures/events.ts';
import { expect, test, type FakeFixture } from './fixtures.ts';

// The `/api/factory/events` proxy, read over HTTP against the worker's app and
// fake factory. Node `fetch` reads the stream incrementally, as the browser's
// live controller does. Status codes and headers for every upstream failure
// are proved by src/routes/api/factory/events/server.test.ts; what stays here
// needs the running server: a real stream, its cursor, and its close.

/** Read parsed events until `count` arrived, keeping the stream open. */
async function readEvents(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	count: number,
	parser = createEventParser(),
	decoder = new TextDecoder()
): Promise<ParsedItem[]> {
	const items: ParsedItem[] = [];
	while (items.length < count) {
		const { done, value } = await reader.read();
		if (done) throw new Error('the stream ended');
		items.push(...parser.push(decoder.decode(value, { stream: true })));
	}
	return items;
}

/** Read raw text until `predicate` holds; throws if the stream ends first. */
async function readUntil(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	predicate: (text: string) => boolean,
	seen = { text: '' }
): Promise<string> {
	const decoder = new TextDecoder();
	while (!predicate(seen.text)) {
		const { done, value } = await reader.read();
		if (done) throw new Error(`the stream ended after: ${seen.text}`);
		seen.text += decoder.decode(value, { stream: true });
	}
	return seen.text;
}

/** What must never reach a client of the proxy. */
const secrets = (fake: FakeFixture) => [
	fake.token,
	fake.url,
	new URL(fake.url).host,
	'127.0.0.1',
	'Bearer',
	'/v1/'
];

function expectSafe(response: Response, body: string, fake: FakeFixture) {
	expect(response.headers.has('authorization')).toBe(false);
	expect(response.headers.has('set-cookie')).toBe(false);
	const headers = [...response.headers].map(([name, value]) => `${name}: ${value}`).join('\n');
	for (const secret of secrets(fake)) {
		expect.soft(headers, `headers leak ${secret}`).not.toContain(secret);
		expect.soft(body, `body leaks ${secret}`).not.toContain(secret);
	}
}

test.describe('the event stream proxy', () => {
	test.use({ fakeOptions: { heartbeatMs: 100 } });

	// The fixture's reset leaves nothing from the previous test: no open stream,
	// no connection, no event.
	test.beforeEach(({ fake }) => {
		expect(fake.openStreams()).toBe(0);
		expect(fake.connections()).toEqual([]);
	});

	test('answers 200 text/event-stream, delivers an event appended after connecting, stays open and leaks nothing', async ({
		app,
		fake
	}) => {
		const client = new AbortController();
		const response = await fetch(`${app.url}/api/factory/events`, { signal: client.signal });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('x-accel-buffering')).toBe('no');
		const reader = response.body!.getReader();
		await expect.poll(() => fake.openStreams()).toBe(1);

		const parser = createEventParser();
		const first = fake.emit({ kind: 'card', payload: eventCard });
		expect(await readEvents(reader, 1, parser)).toEqual([
			{ type: 'event', revision: first.revision, kind: 'card', payload: eventCard }
		]);

		// Not ended: heartbeats keep flowing and a later event still arrives.
		const seen = { text: '' };
		await readUntil(reader, (text) => (text.match(/: heartbeat/g) ?? []).length >= 3, seen);
		const later = fake.emit({ kind: 'start', payload: eventStart });
		await readUntil(reader, (text) => text.includes(`id: ${later.revision}\n`), seen);
		expectSafe(response, seen.text, fake);
		client.abort();
	});

	test('Last-Event-ID n replays only the events after n, and the factory receives n', async ({
		app,
		fake
	}) => {
		const a = fake.emit({ kind: 'card', payload: eventCard });
		const b = fake.emit({ kind: 'start', payload: eventStart });
		const c = fake.emit({ kind: 'card', payload: eventCard });
		const client = new AbortController();
		const response = await fetch(`${app.url}/api/factory/events`, {
			headers: { 'last-event-id': String(b.revision) },
			signal: client.signal
		});
		expect(response.status).toBe(200);
		const text = await readUntil(response.body!.getReader(), (t) =>
			t.includes(`id: ${c.revision}\n`)
		);
		expect(text).not.toContain(`id: ${a.revision}\n`);
		expect(text).not.toContain(`id: ${b.revision}\n`);
		expect(fake.connections()).toEqual([
			{ lastEventId: String(b.revision), since: null, open: true }
		]);
		client.abort();
	});

	test('closing the client closes the upstream stream', async ({ app, fake }) => {
		const client = new AbortController();
		const response = await fetch(`${app.url}/api/factory/events?since=0`, {
			signal: client.signal
		});
		expect(response.status).toBe(200);
		await expect.poll(() => fake.openStreams()).toBe(1);
		expect(fake.connections()).toEqual([{ lastEventId: null, since: '0', open: true }]);
		client.abort();
		await expect.poll(() => fake.openStreams(), { timeout: 5_000 }).toBe(0);
		expect(fake.connections()).toEqual([{ lastEventId: null, since: '0', open: false }]);
	});

	test('an invalid cursor is a 400 with no upstream call', async ({ app, fake }) => {
		const invalid: [string, RequestInit][] = [
			['/api/factory/events', { headers: { 'last-event-id': 'nope' } }],
			['/api/factory/events?since=-1', {}]
		];
		for (const [path, init] of invalid) {
			const response = await fetch(`${app.url}${path}`, init);
			expect(response.status).toBe(400);
			const body = await response.text();
			expect(JSON.parse(body)).toMatchObject({ ok: false, failure: { type: 'invalid' } });
			expectSafe(response, body, fake);
		}
		expect(fake.connections()).toEqual([]);
		expect(fake.requests()).toEqual([]);
	});
});

test.describe('the factory refuses the token', () => {
	test.use({ fakeOptions: { token: 'not-the-dashboard-token' } });

	test('an upstream 401 answers a safe 401', async ({ app, fake }) => {
		const response = await fetch(`${app.url}/api/factory/events`);
		expect(response.status).toBe(401);
		const body = await response.text();
		expect(JSON.parse(body)).toMatchObject({ ok: false, failure: { type: 'unauthorized' } });
		expectSafe(response, body, fake);
		expect(body).not.toContain('not-the-dashboard-token');
		expect(fake.openStreams()).toBe(0);
	});
});
