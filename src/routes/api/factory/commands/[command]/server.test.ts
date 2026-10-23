import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandResponse } from '$lib/factory/commands';
import {
	problemInsufficientScope,
	problemInternalError,
	problemInvalidState,
	problemReplyValidationError,
	runWorkValidationFailed,
	ticketDetailActiveInQa
} from '$lib/factory/fixtures';

import {
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	type FakeFactory,
	type FakeFactoryOptions
} from '../../../../../../test/fake-factory';
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

const FACTORY_HOST = 'factory.command-handler-test.internal';
const FACTORY_URL = `http://${FACTORY_HOST}:7731`;
const DASHBOARD = 'http://dashboard.test';
const UPSTREAM = 'upstream-secret-body-marker';
const KEY = ticketDetailActiveInQa.key;
const INTENT = '3f0c8a52-6a0e-4c4b-9d0e-1f2a3b4c5d6e';

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
	delete process.env.FACTORY_OPERATOR_NAME;
});

type PostOptions = {
	fake?: FakeFactory;
	fakeOptions?: FakeFactoryOptions;
	headers?: Record<string, string>;
	rawBody?: string;
};

async function post(command: string, body: unknown, options: PostOptions = {}) {
	const fake = options.fake ?? createFakeFactory(options.fakeOptions);
	const url = new URL(`${DASHBOARD}/api/factory/commands/${command}`);
	const request = new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: DASHBOARD, ...options.headers },
		body: options.rawBody ?? JSON.stringify(body)
	});
	const event = { fetch: fake.handle, params: { command }, request, url } as unknown as Parameters<
		typeof handlers.POST
	>[0];
	const response = await handlers.POST(event);
	const text = await response.text();
	return {
		status: response.status,
		headers: response.headers,
		cacheControl: response.headers.get('cache-control'),
		text,
		body: JSON.parse(text) as CommandResponse,
		fake
	};
}

function expectSafe(text: string, headers: Headers) {
	const all = `${text}\n${[...headers].map(([name, value]) => `${name}: ${value}`).join('\n')}`;
	expect(all).not.toContain(FAKE_FACTORY_TOKEN);
	expect(all).not.toContain(FACTORY_URL);
	expect(all).not.toContain(FACTORY_HOST);
	expect(all).not.toContain(UPSTREAM);
	expect(all).not.toContain('Bearer');
}

function fieldPaths(body: CommandResponse): string[] {
	if (body.ok) throw new Error('expected a failure');
	return (body.failure.fieldErrors ?? []).map((e) => e.path);
}

describe('POST /api/factory/commands/[command]', () => {
	it('retry answers 202 with the accepted command, keyed by the intent', async () => {
		const { status, body, cacheControl, text, headers, fake } = await post('retry', {
			intent: INTENT,
			ticket: KEY
		});
		expect(status).toBe(202);
		expect(cacheControl).toBe('no-store');
		expect(body).toEqual({
			ok: true,
			accepted: { ticket: KEY, revision: 1, message: expect.any(String) }
		});
		expect(fake.commands).toEqual([
			{
				method: 'POST',
				path: `/v1/tickets/${KEY}/retries`,
				command: 'retry',
				body: undefined,
				idempotencyKey: INTENT,
				onBehalfOf: null,
				authorization: true
			}
		]);
		expectSafe(text, headers);
	});

	it.each([
		[
			'start',
			{ ref: 'dpaez/factory-dashboard#28' },
			'/v1/tickets',
			{ ref: 'dpaez/factory-dashboard#28' }
		],
		['start', { id: 'n1', text: '# Do' }, '/v1/tickets', { id: 'n1', text: '# Do' }],
		['reply', { ticket: KEY, answer: 'B' }, `/v1/tickets/${KEY}/replies`, { answer: 'B' }],
		['complete', { ticket: KEY }, `/v1/tickets/${KEY}/complete`, undefined],
		['cancel', { ticket: KEY }, `/v1/tickets/${KEY}/cancel`, undefined],
		['cancel', { ticket: KEY, reason: 'Dup' }, `/v1/tickets/${KEY}/cancel`, { reason: 'Dup' }],
		['rerun', { ticket: KEY }, `/v1/tickets/${KEY}/reruns`, undefined],
		[
			'stop',
			{ run: runWorkValidationFailed.id },
			`/v1/runs/${runWorkValidationFailed.id}/stop`,
			undefined
		]
	])('%s %o forwards to %s', async (command, fields, path, upstreamBody) => {
		const { status, body, fake } = await post(command, { intent: INTENT, ...fields });
		expect(status).toBe(202);
		expect(body.ok).toBe(true);
		expect(fake.commands).toHaveLength(1);
		expect(fake.commands[0]).toMatchObject({ path, body: upstreamBody, idempotencyKey: INTENT });
	});

	it('the same intent twice sends the same key and answers the same revision', async () => {
		const fake = createFakeFactory();
		const first = await post('retry', { intent: INTENT, ticket: KEY }, { fake });
		const second = await post('retry', { intent: INTENT, ticket: KEY }, { fake });
		expect(first.status).toBe(202);
		expect(second.status).toBe(202);
		expect(second.body).toEqual(first.body);
		expect(fake.commands.map((c) => c.idempotencyKey)).toEqual([INTENT, INTENT]);

		const other = await post(
			'retry',
			{ intent: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', ticket: KEY },
			{ fake }
		);
		expect(other.body).toMatchObject({ ok: true, accepted: { revision: 2 } });
	});

	it.each([
		['retry', { ticket: KEY }, 'body.intent'],
		['retry', { intent: 'not-a-uuid', ticket: KEY }, 'body.intent'],
		['retry', { intent: INTENT, ticket: 'Not A Key' }, 'body.ticket'],
		['reply', { intent: INTENT, ticket: KEY, answer: '' }, 'body.answer'],
		['start', { intent: INTENT, ref: '#1', id: 'a', text: 'b' }, 'body.ref'],
		['start', { intent: INTENT }, 'body.ref']
	])('%s %o is a 400 validation_error at %s, sending nothing', async (command, body, path) => {
		const { status, body: response, cacheControl, fake } = await post(command, body);
		expect(status).toBe(400);
		expect(cacheControl).toBe('no-store');
		expect(response).toMatchObject({
			ok: false,
			failure: { type: 'validation_error', retryable: false }
		});
		expect(fieldPaths(response)).toContain(path);
		expect(fake.commands).toHaveLength(0);
		expect(fake.requests).toHaveLength(0);
	});

	it('invalid JSON is a 400 validation_error', async () => {
		const { status, body, fake } = await post('retry', undefined, { rawBody: '{not json' });
		expect(status).toBe(400);
		expect(fieldPaths(body)).toEqual(['body']);
		expect(fake.requests).toHaveLength(0);
	});

	it('an unknown command is a 404', async () => {
		const { status, body, fake } = await post('delete', { intent: INTENT, ticket: KEY });
		expect(status).toBe(404);
		expect(body).toMatchObject({ ok: false, failure: { type: 'not_found' } });
		expect(fake.requests).toHaveLength(0);
	});

	it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data'])(
		'a %s body is a 415',
		async (contentType) => {
			const { status, body, fake } = await post(
				'retry',
				{ intent: INTENT, ticket: KEY },
				{ headers: { 'content-type': contentType } }
			);
			expect(status).toBe(415);
			expect(body).toMatchObject({ ok: false, failure: { type: 'unsupported_media_type' } });
			expect(fake.requests).toHaveLength(0);
		}
	);

	it('accepts application/json with a charset', async () => {
		const { status } = await post(
			'retry',
			{ intent: INTENT, ticket: KEY },
			{ headers: { 'content-type': 'application/json; charset=utf-8' } }
		);
		expect(status).toBe(202);
	});

	it('a cross-origin request is a 403', async () => {
		const { status, body, fake } = await post(
			'retry',
			{ intent: INTENT, ticket: KEY },
			{ headers: { origin: 'http://evil.test' } }
		);
		expect(status).toBe(403);
		expect(body).toMatchObject({ ok: false, failure: { retryable: false } });
		expect(fake.requests).toHaveLength(0);
	});

	it.each([
		'http://dashboard.test:80',
		'https://dashboard.test',
		'http://dashboard.test:4000',
		'null'
	])('an Origin of %s, not exactly the dashboard origin, is a 403', async (origin) => {
		const { status, fake } = await post(
			'retry',
			{ intent: INTENT, ticket: KEY },
			{ headers: { origin, host: 'dashboard.test' } }
		);
		expect(status).toBe(403);
		expect(fake.requests).toHaveLength(0);
	});

	it('a request without Origin is allowed', async () => {
		const fake = createFakeFactory();
		const url = new URL(`${DASHBOARD}/api/factory/commands/retry`);
		const request = new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ intent: INTENT, ticket: KEY })
		});
		const response = await handlers.POST({
			fetch: fake.handle,
			params: { command: 'retry' },
			request,
			url
		} as unknown as Parameters<typeof handlers.POST>[0]);
		expect(response.status).toBe(202);
	});

	it("ignores the browser's x-factory-on-behalf-of", async () => {
		const { status, fake } = await post(
			'retry',
			{ intent: INTENT, ticket: KEY, onBehalfOf: 'Mallory' },
			{ headers: { 'x-factory-on-behalf-of': 'Mallory' } }
		);
		expect(status).toBe(202);
		expect(fake.commands[0]?.onBehalfOf).toBeNull();
	});

	it('forwards the configured operator name, not the browser one', async () => {
		process.env.FACTORY_OPERATOR_NAME = 'Diego';
		const { status, fake } = await post(
			'retry',
			{ intent: INTENT, ticket: KEY },
			{ headers: { 'x-factory-on-behalf-of': 'Mallory' } }
		);
		expect(status).toBe(202);
		expect(fake.commands[0]?.onBehalfOf).toBe('Diego');
	});

	it.each([
		[problemInvalidState, 409, 'invalid_state'],
		[problemInsufficientScope, 403, 'insufficient_scope'],
		[problemInternalError, 500, 'internal_error']
	])('passes a $type problem through as a safe failure', async (problem, status, type) => {
		const result = await post(
			'retry',
			{ intent: INTENT, ticket: KEY },
			{ fakeOptions: { failCommand: { problem } } }
		);
		expect(result.status).toBe(status);
		expect(result.cacheControl).toBe('no-store');
		expect(result.body).toMatchObject({ ok: false, failure: { type, title: problem.title } });
		expectSafe(result.text, result.headers);
	});

	it('passes upstream field errors through', async () => {
		const { status, body } = await post(
			'reply',
			{ intent: INTENT, ticket: KEY, answer: 'x' },
			{ fakeOptions: { failCommand: { problem: problemReplyValidationError } } }
		);
		expect(status).toBe(400);
		expect(fieldPaths(body)).toEqual(['body.answer']);
	});

	it('an unknown ticket is a 404 ticket_not_found', async () => {
		const { status, body } = await post('retry', { intent: INTENT, ticket: 'no-such-ticket' });
		expect(status).toBe(404);
		expect(body).toMatchObject({ ok: false, failure: { type: 'ticket_not_found' } });
	});

	it('never echoes an upstream body that breaks the contract', async () => {
		const malformed = await post(
			'retry',
			{ intent: INTENT, ticket: KEY },
			{
				fakeOptions: {
					failCommand: { problem: { status: 500, title: UPSTREAM, type: 'nonsense' } as never }
				}
			}
		);
		expect(malformed.status).toBe(502);
		expect(malformed.body).toMatchObject({ ok: false, failure: { type: 'contract_error' } });
		expectSafe(malformed.text, malformed.headers);

		const badAccepted = await post(
			'retry',
			{ intent: INTENT, ticket: KEY },
			{ fakeOptions: { commandBody: { message: UPSTREAM, revision: 'x', ticket: KEY } } }
		);
		expect(badAccepted.status).toBe(502);
		expect(badAccepted.body).toMatchObject({ ok: false, failure: { type: 'contract_error' } });
		expectSafe(badAccepted.text, badAccepted.headers);
	});

	it('contains a wrong token as a safe failure', async () => {
		process.env.FACTORY_API_TOKEN = 'not-the-token';
		const { status, body, text, headers } = await post('retry', { intent: INTENT, ticket: KEY });
		expect(status).toBe(401);
		expect(body).toMatchObject({ ok: false, failure: { type: 'unauthorized' } });
		expect(text).not.toContain('not-the-token');
		expectSafe(text, headers);
	});

	it('missing configuration is a 500 configuration_error that sends nothing', async () => {
		delete process.env.FACTORY_API_URL;
		const { status, body, text, fake } = await post('retry', { intent: INTENT, ticket: KEY });
		expect(status).toBe(500);
		expect(body).toMatchObject({ ok: false, failure: { type: 'configuration_error' } });
		expect(text).toContain('FACTORY_API_URL');
		expect(text).not.toContain(FAKE_FACTORY_TOKEN);
		expect(fake.requests).toHaveLength(0);
	});

	it('accepted bodies carry no token, factory URL or host', async () => {
		const { text, headers } = await post('start', { intent: INTENT, ref: '#28' });
		expectSafe(text, headers);
	});

	it('exports POST only', () => {
		expect(Object.keys(handlers)).toEqual(['POST']);
	});
});
