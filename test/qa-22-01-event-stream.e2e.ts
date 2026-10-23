import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test } from '@playwright/test';

import { eventCard, eventStart } from '../src/lib/factory/fixtures/events.ts';
import { FAKE_FACTORY_TOKEN, startFakeFactory, type FakeFactory } from './fake-factory';

// QA for ticket #22, task 01: the `/api/factory/events` proxy, driven over HTTP
// against the built app and its own fake factory. Node `fetch` reads the stream
// incrementally, as a browser EventSource would.
const FAKE_PORT = 7931;
const APP_PORT = 4331;
const APP = `http://localhost:${APP_PORT}`;
const FAKE = `http://127.0.0.1:${FAKE_PORT}`;
const SECRETS = [FAKE_FACTORY_TOKEN, `127.0.0.1:${FAKE_PORT}`, `localhost:${FAKE_PORT}`, 'Bearer'];

async function startApp(port: number, factoryUrl: string, token: string): Promise<ChildProcess> {
	const child = spawn('node', ['build'], {
		env: {
			...process.env,
			PORT: String(port),
			FACTORY_API_URL: factoryUrl,
			FACTORY_API_TOKEN: token
		},
		stdio: 'ignore'
	});
	await expect
		.poll(
			() =>
				fetch(`http://localhost:${port}/robots.txt`).then(
					(r) => r.status > 0,
					() => false
				),
			{ timeout: 30_000 }
		)
		.toBe(true);
	return child;
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

const append = (body: unknown) =>
	fetch(`${FAKE}/__fake/events`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	}).then((r) => r.json() as Promise<{ revision: number }>);

const connections = () =>
	fetch(`${FAKE}/__fake/events/connections`).then(
		(r) =>
			r.json() as Promise<{ lastEventId: string | null; since: string | null; open: boolean }[]>
	);

test.describe('event stream proxy', () => {
	let fake: Server;
	let factory: FakeFactory;
	let app: ChildProcess;

	test.beforeAll(async () => {
		({ server: fake, fake: factory } = await startFakeFactory(FAKE_PORT, { heartbeatMs: 100 }));
		app = await startApp(APP_PORT, FAKE, FAKE_FACTORY_TOKEN);
	});

	test.afterAll(async () => {
		app?.kill();
		await new Promise((resolve) => fake?.close(resolve));
	});

	test.beforeEach(async () => {
		await fetch(`${FAKE}/__fake/events/drop`, { method: 'POST' });
		await expect.poll(() => factory.openStreams()).toBe(0);
	});

	test('AC1: 200 text/event-stream delivers an event appended after connecting and stays open', async () => {
		const client = new AbortController();
		const response = await fetch(`${APP}/api/factory/events`, { signal: client.signal });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
		const reader = response.body!.getReader();
		await expect.poll(() => factory.openStreams()).toBe(1);

		const { revision } = await append({ kind: 'card', payload: eventCard });
		const seen = { text: '' };
		await readUntil(reader, (t) => t.includes(`id: ${revision}\n`), seen);
		expect(seen.text).toContain('event: card');

		// Not ended: heartbeats keep flowing and a later event still arrives.
		await readUntil(reader, (t) => (t.match(/: heartbeat/g) ?? []).length >= 3, seen);
		const later = await append({ kind: 'start', payload: eventStart });
		await readUntil(reader, (t) => t.includes(`id: ${later.revision}\n`), seen);
		client.abort();
	});

	test('AC2: Last-Event-ID n yields only events after n and the fake records n', async () => {
		const a = await append({ kind: 'card', payload: eventCard });
		const b = await append({ kind: 'start', payload: eventStart });
		const c = await append({ kind: 'card', payload: eventCard });
		const client = new AbortController();
		const response = await fetch(`${APP}/api/factory/events`, {
			headers: { 'Last-Event-ID': String(b.revision) },
			signal: client.signal
		});
		expect(response.status).toBe(200);
		const text = await readUntil(response.body!.getReader(), (t) =>
			t.includes(`id: ${c.revision}\n`)
		);
		expect(text).not.toContain(`id: ${a.revision}\n`);
		expect(text).not.toContain(`id: ${b.revision}\n`);
		expect((await connections()).at(-1)).toMatchObject({
			lastEventId: String(b.revision),
			open: true
		});
		client.abort();
	});

	test('AC3: closing the client connection closes the fake upstream stream', async () => {
		const client = new AbortController();
		const response = await fetch(`${APP}/api/factory/events`, { signal: client.signal });
		expect(response.status).toBe(200);
		await expect.poll(() => factory.openStreams()).toBe(1);
		client.abort();
		await expect.poll(() => factory.openStreams(), { timeout: 5_000 }).toBe(0);
		expect((await connections()).at(-1)?.open).toBe(false);
	});

	test('AC4: a streamed response leaks no token, factory host or authorization header', async () => {
		const client = new AbortController();
		const response = await fetch(`${APP}/api/factory/events?since=0`, { signal: client.signal });
		expect(response.status).toBe(200);
		expect(response.headers.has('authorization')).toBe(false);
		const headerText = [...response.headers].map(([n, v]) => `${n}: ${v}`).join('\n');
		await append({ kind: 'card', payload: eventCard });
		const body = await readUntil(response.body!.getReader(), (t) => t.includes('event: card'));
		for (const secret of SECRETS) {
			expect(headerText).not.toContain(secret);
			expect(body).not.toContain(secret);
		}
		client.abort();
	});
});

test.describe('event stream proxy with a refused token', () => {
	const BAD_FAKE_PORT = 7932;
	const BAD_APP_PORT = 4332;
	let fake: Server;
	let app: ChildProcess;

	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(BAD_FAKE_PORT));
		app = await startApp(BAD_APP_PORT, `http://127.0.0.1:${BAD_FAKE_PORT}`, 'qa-refused-token');
	});

	test.afterAll(async () => {
		app?.kill();
		await new Promise((resolve) => fake?.close(resolve));
	});

	test('AC4: an upstream 401 answers 401 with a safe failure body', async () => {
		const response = await fetch(`http://localhost:${BAD_APP_PORT}/api/factory/events`);
		expect(response.status).toBe(401);
		expect(response.headers.has('authorization')).toBe(false);
		const headerText = [...response.headers].map(([n, v]) => `${n}: ${v}`).join('\n');
		const text = await response.text();
		expect(JSON.parse(text)).toMatchObject({ ok: false, failure: { type: 'unauthorized' } });
		for (const secret of [
			'qa-refused-token',
			FAKE_FACTORY_TOKEN,
			`${BAD_FAKE_PORT}`,
			'127.0.0.1',
			'Bearer',
			'/v1/'
		]) {
			expect(headerText).not.toContain(secret);
			expect(text).not.toContain(secret);
		}
	});
});
