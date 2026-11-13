import { randomUUID } from 'node:crypto';

import type { APIRequestContext, APIResponse } from '@playwright/test';

import {
	pendingFeedback,
	pendingFeedbackSkippedTruncated
} from '../src/lib/factory/fixtures/feedback.ts';
import {
	problemCodeHostUnavailable,
	problemFeedbackRoundNotOpen
} from '../src/lib/factory/fixtures/problems.ts';
import { ticketDetailActiveInQa } from '../src/lib/factory/fixtures/tickets.ts';
import { expect, test, type FakeFixture } from './fixtures.ts';

// Request-level behaviour of /api/factory/* that only the running server shows:
// SvelteKit's routing and CSRF check in front of the command handler. The
// handlers' own status codes and bodies (202, the intent as idempotency key,
// 400 field errors, safe failures, the operator header) are proved by the
// server vitest tests in src/routes/api/factory/**/server.test.ts. What stays
// here: the adapter-node origin (`ORIGIN`) the handler compares a browser's
// `Origin` with, SvelteKit's CSRF check in front of a non-JSON body, and the
// 405 SvelteKit answers for a verb the route does not export. The feedback
// command is also proved end to end here, through the built server to the fake
// factory: its upstream path and body (`note`, `only`), its 400s and its
// passed-through refusals. So is the pending feedback read
// (`GET /api/factory/tickets/{key}/feedback`): its body, its refusals and its verbs.

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

test.describe('the feedback command', () => {
	const send = (request: APIRequestContext, origin: string, data: Record<string, unknown>) =>
		request.post('/api/factory/commands/feedback', { data, headers: { origin } });

	test('without a note it reaches feedback-rounds with no body, keyed by its intent, and answers 202', async ({
		request,
		app,
		fake
	}) => {
		const intent = randomUUID();
		const response = await send(request, app.url, { intent, ticket: KEY });
		expect(response.status()).toBe(202);
		const body = await response.json();
		expect(body).toMatchObject({ ok: true, accepted: expect.any(Object) });
		await expectSafe(response, fake);
		expect(fake.commands()).toEqual([
			expect.objectContaining({
				method: 'POST',
				path: `/v1/tickets/${KEY}/feedback-rounds`,
				command: 'feedback',
				body: undefined,
				idempotencyKey: intent
			})
		]);
	});

	test('a note is sent trimmed, and a blank note is sent as no note', async ({
		request,
		app,
		fake
	}) => {
		expect(
			(
				await send(request, app.url, {
					intent: randomUUID(),
					ticket: KEY,
					note: '  Rename the flag.\n '
				})
			).status()
		).toBe(202);
		expect(
			(await send(request, app.url, { intent: randomUUID(), ticket: KEY, note: ' \n ' })).status()
		).toBe(202);
		const [noted, blank] = fake.commands();
		expect(noted).toMatchObject({ path: `/v1/tickets/${KEY}/feedback-rounds` });
		expect(noted!.body).toEqual({ note: 'Rename the flag.' });
		expect(blank).toMatchObject({ path: `/v1/tickets/${KEY}/feedback-rounds` });
		expect(blank!.body).toBeUndefined();
	});

	test('a non-text note or a bad ticket key is a 400 validation_error naming the field, and nothing reaches the factory', async ({
		request,
		app,
		fake
	}) => {
		for (const [data, field] of [
			[{ intent: randomUUID(), ticket: KEY, note: 3 }, 'body.note'],
			[{ intent: randomUUID(), ticket: 'Not A Key' }, 'body.ticket']
		] as const) {
			const response = await send(request, app.url, data);
			expect(response.status()).toBe(400);
			const body = await response.json();
			expect(body).toMatchObject({ ok: false, failure: { type: 'validation_error' } });
			expect(JSON.stringify(body.failure.fieldErrors)).toContain(field);
			await expectSafe(response, fake);
		}
		expect(fake.commands()).toEqual([]);
		expect(fake.requests().filter((r) => r.method === 'POST')).toEqual([]);
	});

	test('only is sent as the chosen refs, and an absent or empty only is sent as no only', async ({
		request,
		app,
		fake
	}) => {
		for (const data of [
			{ only: ['r1', 'c2'] },
			{ only: ['r1'], note: ' Also the README. ' },
			{},
			{ only: [] }
		]) {
			const response = await send(request, app.url, { intent: randomUUID(), ticket: KEY, ...data });
			expect(response.status()).toBe(202);
		}
		const bodies = fake.commands().map((command) => {
			expect(command.path).toBe(`/v1/tickets/${KEY}/feedback-rounds`);
			return command.body;
		});
		expect(bodies).toEqual([
			{ only: ['r1', 'c2'] },
			{ only: ['r1'], note: 'Also the README.' },
			undefined,
			undefined
		]);
	});

	test('a non-array only, or one with a blank or non-text ref, is a 400 validation_error naming only, and nothing reaches the factory', async ({
		request,
		app,
		fake
	}) => {
		for (const only of ['r1', ['r1', ' '], ['r1', 7], { r1: true }]) {
			const response = await send(request, app.url, { intent: randomUUID(), ticket: KEY, only });
			expect(response.status(), JSON.stringify(only)).toBe(400);
			const body = await response.json();
			expect(body).toMatchObject({ ok: false, failure: { type: 'validation_error' } });
			expect(JSON.stringify(body.failure.fieldErrors)).toContain('body.only');
			await expectSafe(response, fake);
		}
		expect(fake.commands()).toEqual([]);
		expect(fake.requests().filter((r) => r.method === 'POST')).toEqual([]);
	});

	for (const problem of [problemFeedbackRoundNotOpen, problemCodeHostUnavailable]) {
		test.describe(`the factory refuses with ${problem.type}`, () => {
			test.use({ fakeOptions: { failCommand: { commands: ['feedback'], problem } } });

			test(`the ${problem.status} comes back with its type, title and detail unchanged, and nothing leaks`, async ({
				request,
				app,
				fake
			}) => {
				const response = await send(request, app.url, { intent: randomUUID(), ticket: KEY });
				expect(response.status()).toBe(problem.status);
				const body = await response.json();
				expect(body).toMatchObject({
					ok: false,
					failure: { type: problem.type, title: problem.title, detail: problem.detail }
				});
				await expectSafe(response, fake);
				expect(fake.commands()).toHaveLength(1);
			});
		});
	}
});

test.describe('the pending feedback read', () => {
	const read = (request: APIRequestContext, key = KEY) =>
		request.get(`/api/factory/tickets/${encodeURIComponent(key)}/feedback`);

	test("answers 200 with the ticket's pending comments, skipped comments, pull request and truncation", async ({
		request,
		fake
	}) => {
		const response = await read(request);
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toBe('no-store');
		const body = await response.json();
		expect(body).toEqual({
			ok: true,
			ticket: KEY,
			candidates: pendingFeedback.candidates,
			skipped: [],
			pullRequestUrl: ticketDetailActiveInQa.pullRequest.url,
			truncated: false
		});
		for (const candidate of body.candidates) {
			expect(Object.keys(candidate).sort()).toEqual([
				'author',
				'kind',
				'location',
				'ref',
				'summary',
				'url'
			]);
		}
		await expectSafe(response, fake);
		expect(fake.requests()).toContainEqual({
			method: 'GET',
			path: `/v1/tickets/${KEY}/feedback`
		});
	});

	test.describe('with skipped authors and a truncated list', () => {
		test.use({ fakeOptions: { pendingFeedbackCohort: 'skippedTruncated' } });

		test('answers the skipped comments and truncated: true', async ({ request, fake }) => {
			const response = await read(request);
			expect(response.status()).toBe(200);
			expect(await response.json()).toMatchObject({
				ok: true,
				candidates: pendingFeedbackSkippedTruncated.candidates,
				skipped: pendingFeedbackSkippedTruncated.skipped,
				truncated: true
			});
			expect(pendingFeedbackSkippedTruncated.skipped.length).toBeGreaterThan(0);
			await expectSafe(response, fake);
		});
	});

	const problemNoOpenPullRequest = {
		status: 409,
		title: 'Invalid state',
		type: 'invalid_state',
		detail: `${ticketDetailActiveInQa.displayRef} has no open pull request.`
	} as const;

	for (const problem of [problemNoOpenPullRequest, problemCodeHostUnavailable]) {
		test.describe(`the factory refuses with ${problem.status} ${problem.type}`, () => {
			test.use({ fakeOptions: { failPendingFeedback: problem } });

			test(`the ${problem.status} comes back with its title and detail, and nothing leaks`, async ({
				request,
				fake
			}) => {
				const response = await read(request);
				expect(response.status()).toBe(problem.status);
				expect(response.headers()['cache-control']).toBe('no-store');
				expect(await response.json()).toMatchObject({
					ok: false,
					failure: { type: problem.type, title: problem.title, detail: problem.detail }
				});
				await expectSafe(response, fake);
			});
		});
	}

	test('an unknown ticket is a 404 with the factory title and detail, and nothing leaks', async ({
		request,
		fake
	}) => {
		const response = await read(request, 'no-such-ticket-00000000');
		expect(response.status()).toBe(404);
		expect(await response.json()).toMatchObject({
			ok: false,
			failure: {
				type: 'ticket_not_found',
				title: 'Ticket not found',
				detail: 'No ticket has the key no-such-ticket-00000000.'
			}
		});
		await expectSafe(response, fake);
	});

	test('answers only GET: other verbs are 405 and reach nothing', async ({
		request,
		app,
		fake
	}) => {
		const url = `/api/factory/tickets/${KEY}/feedback`;
		const headers = { origin: app.url };
		for (const response of [
			await request.post(url, { data: {}, headers }),
			await request.put(url, { data: {}, headers }),
			await request.delete(url, { headers })
		]) {
			expect(response.status()).toBe(405);
		}
		expect(fake.requests().filter((r) => r.path.endsWith('/feedback'))).toEqual([]);
	});
});
