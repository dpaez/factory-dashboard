import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test } from '@playwright/test';

import { createEventParser, type ParsedItem } from '../src/lib/factory/events.ts';
import { eventCard, eventStart } from '../src/lib/factory/fixtures/events.ts';
import { FAKE_FACTORY_TOKEN, startFakeFactory, type FakeFactory } from './fake-factory';

// The `/api/factory/events` proxy against a fake factory and the built app, on
// their own ports. Node `fetch` reads the stream as the browser controller will.
const FAKE_PORT = 7921;
const APP_PORT = 4321;
const APP = `http://localhost:${APP_PORT}`;
const FAKE = `http://127.0.0.1:${FAKE_PORT}`;

let fake: Server;
let factory: FakeFactory;
let app: ChildProcess;

test.beforeAll(async () => {
	({ server: fake, fake: factory } = await startFakeFactory(FAKE_PORT, { heartbeatMs: 200 }));
	app = spawn('node', ['build'], {
		env: {
			...process.env,
			PORT: String(APP_PORT),
			FACTORY_API_URL: FAKE,
			FACTORY_API_TOKEN: FAKE_FACTORY_TOKEN
		},
		stdio: 'ignore'
	});
	await expect
		.poll(
			async () => {
				try {
					return (await fetch(`${APP}/robots.txt`)).status > 0;
				} catch {
					return false;
				}
			},
			{ timeout: 30_000 }
		)
		.toBe(true);
});

test.afterAll(async () => {
	app?.kill();
	await new Promise((resolve) => fake?.close(resolve));
});

test.beforeEach(async () => {
	await fetch(`${FAKE}/__fake/events/drop`, { method: 'POST' });
	await expect.poll(() => factory.openStreams()).toBe(0);
});

/** Read parsed events from a stream until `count` arrived, keeping the stream open. */
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

const append = (body: unknown) =>
	fetch(`${FAKE}/__fake/events`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	}).then((response) => response.json() as Promise<{ revision: number }>);

const connections = () =>
	fetch(`${FAKE}/__fake/events/connections`).then(
		(response) =>
			response.json() as Promise<
				{ lastEventId: string | null; since: string | null; open: boolean }[]
			>
	);

function expectSafeHeaders(response: Response) {
	const text = [...response.headers].map(([name, value]) => `${name}: ${value}`).join('\n');
	expect(response.headers.has('authorization')).toBe(false);
	expect(response.headers.has('set-cookie')).toBe(false);
	expect(text).not.toContain(FAKE_FACTORY_TOKEN);
	expect(text).not.toContain(`127.0.0.1:${FAKE_PORT}`);
}

test('AC1: the proxy answers 200 text/event-stream and delivers an event appended after connecting', async () => {
	const client = new AbortController();
	const response = await fetch(`${APP}/api/factory/events`, { signal: client.signal });
	expect(response.status).toBe(200);
	expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
	expect(response.headers.get('cache-control')).toBe('no-store');
	expect(response.headers.get('x-accel-buffering')).toBe('no');
	expectSafeHeaders(response);
	const reader = response.body!.getReader();

	await expect.poll(() => factory.openStreams()).toBe(1);
	const { revision } = await append({ kind: 'card', payload: eventCard });
	expect(await readEvents(reader, 1)).toEqual([
		{ type: 'event', revision, kind: 'card', payload: eventCard }
	]);
	// Still open: a second event arrives on the same response.
	const second = await append({ kind: 'start', payload: eventStart });
	expect(await readEvents(reader, 1)).toMatchObject([{ revision: second.revision, kind: 'start' }]);
	client.abort();
});

test('AC2: Last-Event-ID n replays only events after n, and the fake records n', async () => {
	const first = await append({ kind: 'card', payload: eventCard });
	const second = await append({ kind: 'start', payload: eventStart });
	const client = new AbortController();
	const response = await fetch(`${APP}/api/factory/events`, {
		headers: { 'last-event-id': String(first.revision) },
		signal: client.signal
	});
	expect(response.status).toBe(200);
	const items = await readEvents(response.body!.getReader(), 1);
	expect(items).toEqual([
		{ type: 'event', revision: second.revision, kind: 'start', payload: eventStart }
	]);
	expect((await connections()).at(-1)).toEqual({
		lastEventId: String(first.revision),
		since: null,
		open: true
	});
	client.abort();
});

test('AC3: closing the client connection closes the upstream stream', async () => {
	const client = new AbortController();
	const response = await fetch(`${APP}/api/factory/events?since=0`, { signal: client.signal });
	expect(response.status).toBe(200);
	await expect.poll(() => factory.openStreams()).toBe(1);
	expect((await connections()).at(-1)).toMatchObject({ since: '0', open: true });
	client.abort();
	await expect.poll(() => factory.openStreams(), { timeout: 5_000 }).toBe(0);
	expect((await connections()).at(-1)).toMatchObject({ open: false });
});

test('AC4: an invalid cursor is a 400 with no upstream call', async () => {
	const before = (await connections()).length;
	const response = await fetch(`${APP}/api/factory/events`, {
		headers: { 'last-event-id': 'nope' }
	});
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ ok: false, failure: { type: 'invalid' } });
	expect(await connections()).toHaveLength(before);
});

test.describe('with a refused token', () => {
	const BAD_FAKE_PORT = 7922;
	const BAD_APP_PORT = 4322;
	let badFake: Server;
	let badApp: ChildProcess;

	test.beforeAll(async () => {
		({ server: badFake } = await startFakeFactory(BAD_FAKE_PORT));
		badApp = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(BAD_APP_PORT),
				FACTORY_API_URL: `http://127.0.0.1:${BAD_FAKE_PORT}`,
				FACTORY_API_TOKEN: 'refused-token-e2e'
			},
			stdio: 'ignore'
		});
		await expect
			.poll(
				async () => {
					try {
						return (await fetch(`http://localhost:${BAD_APP_PORT}/robots.txt`)).status > 0;
					} catch {
						return false;
					}
				},
				{ timeout: 30_000 }
			)
			.toBe(true);
	});

	test.afterAll(async () => {
		badApp?.kill();
		await new Promise((resolve) => badFake?.close(resolve));
	});

	test('AC4: an upstream 401 answers 401 with a safe body', async () => {
		const response = await fetch(`http://localhost:${BAD_APP_PORT}/api/factory/events`);
		expect(response.status).toBe(401);
		expectSafeHeaders(response);
		const text = await response.text();
		expect(JSON.parse(text)).toMatchObject({ ok: false, failure: { type: 'unauthorized' } });
		for (const secret of ['refused-token-e2e', FAKE_FACTORY_TOKEN, '127.0.0.1', 'Bearer', '/v1/']) {
			expect(text).not.toContain(secret);
		}
	});
});
