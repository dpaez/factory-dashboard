import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { expect, test, type APIResponse } from '@playwright/test';

import { ticketDetailActiveInQa } from '../src/lib/factory/fixtures/tickets.ts';
import { FAKE_FACTORY_TOKEN, startFakeFactory, type FakeCommandRequest } from './fake-factory';

// Ticket #28, task 01: `POST /api/factory/commands/<command>` in the built app,
// against its own fake factory, so the shared fake on 7799 keeps seeing GETs only.
const FAKE_PORT = 7951;
const APP_PORT = 4351;
const FAKE = `http://127.0.0.1:${FAKE_PORT}`;
const APP_ORIGIN = `http://localhost:${APP_PORT}`;
const KEY = ticketDetailActiveInQa.key;

const state: { fake?: Server; app?: ChildProcess } = {};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	({ server: state.fake } = await startFakeFactory(FAKE_PORT));
	state.app = spawn('node', ['build'], {
		env: {
			...process.env,
			PORT: String(APP_PORT),
			// As a deployment sets it; without it adapter-node assumes https.
			ORIGIN: APP_ORIGIN,
			FACTORY_API_URL: FAKE,
			FACTORY_API_TOKEN: FAKE_FACTORY_TOKEN
		},
		stdio: 'ignore'
	});
	await expect
		.poll(
			() =>
				fetch(`${APP_ORIGIN}/robots.txt`).then(
					(r) => r.status > 0,
					() => false
				),
			{ timeout: 30_000 }
		)
		.toBe(true);
});

test.afterAll(async () => {
	state.app?.kill();
	await new Promise((resolve) => state.fake?.close(resolve));
});

test.use({ baseURL: APP_ORIGIN });

async function commandsFor(intent: string): Promise<FakeCommandRequest[]> {
	const all = (await (await fetch(`${FAKE}/__fake/commands`)).json()) as FakeCommandRequest[];
	return all.filter((command) => command.idempotencyKey === intent);
}

async function expectSafe(response: APIResponse) {
	const text = await response.text();
	const headers = JSON.stringify(response.headers());
	for (const leak of [FAKE_FACTORY_TOKEN, '127.0.0.1', String(FAKE_PORT), 'Bearer', '/v1/']) {
		expect.soft(text).not.toContain(leak);
		expect.soft(headers).not.toContain(leak);
	}
	return JSON.parse(text);
}

test('a retry answers 202 and the fake saw the intent as the idempotency key', async ({
	request
}) => {
	const intent = randomUUID();
	const response = await request.post('/api/factory/commands/retry', {
		data: { intent, ticket: KEY },
		headers: { origin: APP_ORIGIN, 'x-factory-on-behalf-of': 'Mallory' }
	});
	expect(response.status()).toBe(202);
	expect(response.headers()['cache-control']).toBe('no-store');
	const body = await expectSafe(response);
	expect(body).toEqual({
		ok: true,
		accepted: { ticket: KEY, revision: expect.any(Number), message: expect.any(String) }
	});

	const seen = await commandsFor(intent);
	expect(seen).toHaveLength(1);
	expect(seen[0]).toMatchObject({
		method: 'POST',
		path: `/v1/tickets/${KEY}/retries`,
		command: 'retry',
		idempotencyKey: intent,
		onBehalfOf: null,
		authorization: true
	});
});

test('the same intent twice reaches the factory under one key and answers one revision', async ({
	request
}) => {
	const intent = randomUUID();
	const send = () => request.post('/api/factory/commands/retry', { data: { intent, ticket: KEY } });
	const first = await send();
	const second = await send();
	expect(first.status()).toBe(202);
	expect(second.status()).toBe(202);
	expect(await second.json()).toEqual(await first.json());
	expect((await commandsFor(intent)).map((c) => c.idempotencyKey)).toEqual([intent, intent]);
});

test('an invalid intent is a 400 validation_error and sends nothing', async ({ request }) => {
	const response = await request.post('/api/factory/commands/retry', {
		data: { intent: 'not-a-uuid', ticket: KEY }
	});
	expect(response.status()).toBe(400);
	const body = await expectSafe(response);
	expect(body.failure.type).toBe('validation_error');
	expect(body.failure.fieldErrors).toContainEqual(expect.objectContaining({ path: 'body.intent' }));
	expect(await commandsFor('not-a-uuid')).toHaveLength(0);
});

test('an unknown ticket maps to a safe failure', async ({ request }) => {
	const response = await request.post('/api/factory/commands/retry', {
		data: { intent: randomUUID(), ticket: 'no-such-ticket' }
	});
	expect(response.status()).toBe(404);
	const body = await expectSafe(response);
	expect(body).toMatchObject({ ok: false, failure: { type: 'ticket_not_found' } });
});

test('unknown command 404, non-JSON 415, cross-origin 403, GET 405', async ({ request }) => {
	const intent = randomUUID();
	expect(
		(await request.post('/api/factory/commands/delete', { data: { intent, ticket: KEY } })).status()
	).toBe(404);
	expect(
		(
			await request.post('/api/factory/commands/retry', {
				data: JSON.stringify({ intent, ticket: KEY }),
				// Same origin, as a browser sends it: without `Origin`, SvelteKit's own CSRF
				// check refuses a form content type (text/plain) with 403 first.
				headers: { 'content-type': 'text/plain', origin: APP_ORIGIN }
			})
		).status()
	).toBe(415);
	expect(
		(
			await request.post('/api/factory/commands/retry', {
				data: { intent, ticket: KEY },
				headers: { origin: 'http://evil.test' }
			})
		).status()
	).toBe(403);
	expect((await request.get('/api/factory/commands/retry')).status()).toBe(405);
	expect(await commandsFor(intent)).toHaveLength(0);
});
