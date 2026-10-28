import { randomUUID } from 'node:crypto';

import type { APIResponse } from '@playwright/test';

import { ticketDetailActiveInQa } from '../src/lib/factory/fixtures/tickets.ts';
import { expect, test, type FakeFixture } from './fixtures.ts';

// Request-level behaviour of /api/factory/* that only the running server shows:
// SvelteKit's routing and CSRF check in front of the command handler. The
// handlers' own status codes and bodies (202, the intent as idempotency key,
// 400 field errors, safe failures, the operator header) are proved by the
// server vitest tests in src/routes/api/factory/**/server.test.ts. What stays
// here: the adapter-node origin (`ORIGIN`) the handler compares a browser's
// `Origin` with, SvelteKit's CSRF check in front of a non-JSON body, and the
// 405 SvelteKit answers for a verb the route does not export.

const KEY = ticketDetailActiveInQa.key;

/** Neither the body nor the headers name the token, the factory URL or host. */
async function expectSafe(response: APIResponse, fake: FakeFixture) {
	const text = await response.text();
	const headers = JSON.stringify(response.headers());
	for (const leak of [fake.token, fake.url, new URL(fake.url).host, 'Bearer', '/v1/']) {
		expect.soft(text, `body leaks ${leak}`).not.toContain(leak);
		expect.soft(headers, `headers leak ${leak}`).not.toContain(leak);
	}
}

test('the command endpoint answers 415, 403 and 405 through the server, and nothing reaches the factory', async ({
	request,
	app,
	fake
}) => {
	const data = { intent: randomUUID(), ticket: KEY };
	// Same origin, as a browser sends it: without `Origin`, SvelteKit's own CSRF
	// check refuses a form content type (text/plain) with 403 before the handler.
	const plain = await request.post('/api/factory/commands/retry', {
		data: JSON.stringify(data),
		headers: { 'content-type': 'text/plain', origin: app.url }
	});
	expect(plain.status()).toBe(415);
	await expectSafe(plain, fake);

	const crossOrigin = await request.post('/api/factory/commands/retry', {
		data,
		headers: { origin: 'https://evil.example' }
	});
	expect(crossOrigin.status()).toBe(403);
	await expectSafe(crossOrigin, fake);

	const get = await request.get('/api/factory/commands/retry');
	expect(get.status()).toBe(405);

	expect(fake.commands()).toEqual([]);
});

test('a same-origin command reaches the factory once, keyed by its intent, and its answer is safe', async ({
	request,
	app,
	fake
}) => {
	const intent = randomUUID();
	const response = await request.post('/api/factory/commands/retry', {
		data: { intent, ticket: KEY },
		headers: { origin: app.url }
	});
	expect(response.status()).toBe(202);
	expect(response.headers()['cache-control']).toBe('no-store');
	await expectSafe(response, fake);
	expect(fake.commands()).toEqual([
		expect.objectContaining({
			path: `/v1/tickets/${KEY}/retries`,
			idempotencyKey: intent,
			authorization: true
		})
	]);
});
