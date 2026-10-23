import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { expect, test, type APIResponse } from '@playwright/test';

import { ticketDetailActiveInQa } from '../src/lib/factory/fixtures/tickets.ts';
import {
	FAKE_FACTORY_TOKEN,
	startFakeFactory,
	type FakeCommandRequest,
	type FakeFactoryOptions
} from './fake-factory';

// QA for ticket #28, task 01: `POST /api/factory/commands/<command>` in the built app.
const KEY = ticketDetailActiveInQa.key;
const MARKER = 'qa-28-upstream-body-marker';

async function commandsAt(fakePort: number): Promise<FakeCommandRequest[]> {
	return (await (await fetch(`http://127.0.0.1:${fakePort}/__fake/commands`)).json()) as never;
}
async function commandsFor(intent: string, fakePort = FAKE) {
	return (await commandsAt(fakePort)).filter((c) => c.idempotencyKey === intent);
}

/** Asserts neither headers nor body leak the token, the factory URL or host, or an upstream marker. */
async function expectSafe(response: APIResponse, fakePort = FAKE, token = FAKE_FACTORY_TOKEN) {
	const text = await response.text();
	const headers = JSON.stringify(response.headers());
	for (const leak of [token, '127.0.0.1', String(fakePort), 'Bearer', '/v1/', MARKER]) {
		expect.soft(text, `body leaks ${leak}`).not.toContain(leak);
		expect.soft(headers, `headers leak ${leak}`).not.toContain(leak);
	}
	return JSON.parse(text);
}

const post = (command: string, data: unknown, headers: Record<string, string> = {}) =>
	[`${BASE}/api/factory/commands/${command}`, { data, headers }] as const;

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(
	fakePort: number,
	appPort: number,
	options: FakeFactoryOptions,
	env: Record<string, string> = {}
) {
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, options));
		app = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(appPort),
				FACTORY_API_URL: `http://127.0.0.1:${fakePort}`,
				FACTORY_API_TOKEN: FAKE_FACTORY_TOKEN,
				// adapter-node assumes https without it, so a same-origin http `Origin` would not match.
				ORIGIN: `http://localhost:${appPort}`,
				...env
			},
			stdio: 'ignore'
		});
		await expect
			.poll(
				async () => {
					try {
						return (await fetch(`http://localhost:${appPort}/robots.txt`)).status > 0;
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
	return `http://localhost:${appPort}`;
}

// Its own fake and app, so these POSTs never reach the shared fake the GET-only specs inspect.
const FAKE = 7943;
const BASE = scenario(FAKE, 4343, {});

test('AC5 + AC11: a retry answers 202 {ok:true, accepted} and the fake saw the intent as idempotency-key', async ({
	request
}) => {
	const intent = randomUUID();
	const response = await request.post(...post('retry', { intent, ticket: KEY }));
	expect(response.status()).toBe(202);
	const body = await expectSafe(response);
	expect(body).toEqual({
		ok: true,
		accepted: { ticket: KEY, revision: expect.any(Number), message: expect.any(String) }
	});
	const seen = await commandsFor(intent);
	expect(seen).toHaveLength(1);
	expect(seen[0]).toMatchObject({ command: 'retry', idempotencyKey: intent, authorization: true });
});

test('AC6: the same intent twice sends the same key both times and answers the same revision', async ({
	request
}) => {
	const intent = randomUUID();
	const first = await request.post(...post('retry', { intent, ticket: KEY }));
	const second = await request.post(...post('retry', { intent, ticket: KEY }));
	expect(first.status()).toBe(202);
	expect(second.status()).toBe(202);
	const a = await first.json();
	const b = await second.json();
	expect(b.accepted.revision).toBe(a.accepted.revision);
	expect((await commandsFor(intent)).map((c) => c.idempotencyKey)).toEqual([intent, intent]);
});

test('AC7: invalid intents, ticket keys, reply answers and start shapes are 400 with a field error, nothing sent', async ({
	request
}) => {
	const before = (await commandsAt(FAKE)).length;
	const intent = randomUUID();
	const cases: [string, Record<string, unknown>, string][] = [
		['retry', { ticket: KEY }, 'body.intent'],
		['retry', { intent: 'not-a-uuid', ticket: KEY }, 'body.intent'],
		['retry', { intent, ticket: 'Bad Key!' }, 'body.ticket'],
		['reply', { intent, ticket: KEY, answer: '' }, 'body.answer'],
		['reply', { intent, ticket: KEY, answer: '   ' }, 'body.answer'],
		['start', { intent, ref: 'r', id: 'i', text: 't' }, 'body.ref'],
		['start', { intent }, 'body.ref']
	];
	for (const [command, data, path] of cases) {
		const response = await request.post(...post(command, data));
		const label = `${command} ${JSON.stringify(data)}`;
		expect.soft(response.status(), label).toBe(400);
		const body = await expectSafe(response);
		expect.soft(body.failure?.type, label).toBe('validation_error');
		expect.soft(body.failure?.fieldErrors, label).toContainEqual(expect.objectContaining({ path }));
	}
	expect((await commandsAt(FAKE)).length).toBe(before);
});

test('AC8: unknown command 404, non-JSON 415, cross-origin 403, GET not allowed', async ({
	request
}) => {
	const before = (await commandsAt(FAKE)).length;
	const data = { intent: randomUUID(), ticket: KEY };
	expect((await request.post(...post('delete', data))).status()).toBe(404);
	const plain = await request.post(`${BASE}/api/factory/commands/retry`, {
		data: JSON.stringify(data),
		headers: { 'content-type': 'text/plain', origin: BASE }
	});
	expect(plain.status()).toBe(415);
	expect(
		(await request.post(...post('retry', data, { origin: 'https://evil.example' }))).status()
	).toBe(403);
	const get = await request.get(`${BASE}/api/factory/commands/retry`);
	expect(get.status()).toBe(405);
	expect((await commandsAt(FAKE)).length).toBe(before);
});

test('AC9: a browser-sent x-factory-on-behalf-of is not forwarded when no operator is configured', async ({
	request
}) => {
	const intent = randomUUID();
	const response = await request.post(
		...post('retry', { intent, ticket: KEY }, { 'x-factory-on-behalf-of': 'Mallory' })
	);
	expect(response.status()).toBe(202);
	expect((await commandsFor(intent))[0]?.onBehalfOf).toBeNull();
});

test.describe('AC9: FACTORY_OPERATOR_NAME is configured', () => {
	const base = scenario(7941, 4341, {}, { FACTORY_OPERATOR_NAME: 'Diego' });
	test('AC9: the configured operator name is forwarded, not the browser-sent one', async ({
		request
	}) => {
		const intent = randomUUID();
		const response = await request.post(`${base}/api/factory/commands/retry`, {
			data: { intent, ticket: KEY },
			headers: { 'x-factory-on-behalf-of': 'Mallory' }
		});
		expect(response.status()).toBe(202);
		const seen = await commandsFor(intent, 7941);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.onBehalfOf).toBe('Diego');
	});
});

test.describe('AC10: the factory answers a problem with an extra upstream field', () => {
	const base = scenario(7942, 4342, {
		failCommand: {
			problem: {
				status: 409,
				type: 'invalid_state',
				title: 'Invalid state',
				[MARKER]: `${MARKER} http://127.0.0.1:7942/v1/tickets`
			} as never
		}
	});
	test('AC10: neither success nor failure responses leak the token, URL, host or upstream marker', async ({
		request
	}) => {
		const failure = await request.post(`${base}/api/factory/commands/retry`, {
			data: { intent: randomUUID(), ticket: KEY }
		});
		expect(failure.status()).toBe(409);
		const body = await expectSafe(failure, 7942);
		expect(body).toMatchObject({ ok: false, failure: { type: 'invalid_state' } });
		expect(Object.keys(body.failure).sort()).toEqual(['retryable', 'title', 'type']);
	});
	test('AC10: a 202 on the default fake leaks nothing either', async ({ request }) => {
		await expectSafe(await request.post(...post('retry', { intent: randomUUID(), ticket: KEY })));
	});
});
