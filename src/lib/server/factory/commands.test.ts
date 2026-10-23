import { describe, expect, it } from 'vitest';

import {
	acceptedRetry,
	problemInsufficientScope,
	problemInternalError,
	problemInvalidState,
	problemNotWaitingForReply,
	problemReplyValidationError,
	problemUnauthorized
} from '$lib/factory/fixtures';

import { createFactoryClient, type FactoryClient } from './client';
import { cancel, complete, rerun, reply, retry, start, stop } from './commands';
import type { FactoryResult } from './reads';

const BASE_URL = 'http://127.0.0.1:7731';
const TOKEN = 'secret-token-abc123';
const KEY = 'dpaez-factory-dashboard-28-e3869746';
const INTENT = '3f0c8a52-6a0e-4c4b-9d0e-1f2a3b4c5d6e';

function jsonResponse(body: unknown, status = 202, contentType = 'application/json') {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

function fakeClient(
	respond: () => Response | Promise<Response> = () => jsonResponse(acceptedRetry),
	operatorName?: string
) {
	const requests: Request[] = [];
	const client = createFactoryClient({
		baseUrl: BASE_URL,
		token: TOKEN,
		operatorName,
		fetch: async (request) => {
			requests.push(request);
			return respond();
		}
	});
	return { client, requests };
}

type Case = {
	name: string;
	call: (client: FactoryClient) => Promise<FactoryResult<unknown>>;
	path: string;
	body: unknown;
};

const cases: Case[] = [
	{
		name: 'start (ref)',
		call: (c) => start(c, INTENT, { ref: 'dpaez/factory-dashboard#28' }),
		path: '/v1/tickets',
		body: { ref: 'dpaez/factory-dashboard#28' }
	},
	{
		name: 'start (text)',
		call: (c) => start(c, INTENT, { id: 'note-1', text: '# Do it' }),
		path: '/v1/tickets',
		body: { id: 'note-1', text: '# Do it' }
	},
	{
		name: 'reply',
		call: (c) => reply(c, INTENT, KEY, { answer: 'Use option B.' }),
		path: `/v1/tickets/${KEY}/replies`,
		body: { answer: 'Use option B.' }
	},
	{
		name: 'retry',
		call: (c) => retry(c, INTENT, KEY),
		path: `/v1/tickets/${KEY}/retries`,
		body: undefined
	},
	{
		name: 'complete',
		call: (c) => complete(c, INTENT, KEY),
		path: `/v1/tickets/${KEY}/complete`,
		body: undefined
	},
	{
		name: 'cancel (no reason)',
		call: (c) => cancel(c, INTENT, KEY),
		path: `/v1/tickets/${KEY}/cancel`,
		body: undefined
	},
	{
		name: 'cancel (reason)',
		call: (c) => cancel(c, INTENT, KEY, { reason: 'Duplicate.' }),
		path: `/v1/tickets/${KEY}/cancel`,
		body: { reason: 'Duplicate.' }
	},
	{
		name: 'rerun',
		call: (c) => rerun(c, INTENT, KEY),
		path: `/v1/tickets/${KEY}/reruns`,
		body: undefined
	},
	{
		name: 'stop',
		call: (c) => stop(c, INTENT, 'run_01'),
		path: '/v1/runs/run_01/stop',
		body: undefined
	}
];

describe('factory commands', () => {
	it.each(cases)(
		'$name sends POST $path with the bearer and idempotency key',
		async ({ call, path, body }) => {
			const { client, requests } = fakeClient();
			const result = await call(client);
			expect(result).toEqual({ ok: true, data: acceptedRetry });
			expect(requests).toHaveLength(1);
			const request = requests[0]!;
			const url = new URL(request.url);
			expect(request.method).toBe('POST');
			expect(url.origin).toBe(BASE_URL);
			expect(url.pathname).toBe(path);
			expect(url.search).toBe('');
			expect(request.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
			expect(request.headers.get('idempotency-key')).toBe(INTENT);
			const text = await request.text();
			if (body === undefined) {
				expect(text).toBe('');
			} else {
				expect(request.headers.get('content-type')).toContain('application/json');
				expect(JSON.parse(text)).toEqual(body);
			}
		}
	);

	it('sends x-factory-on-behalf-of when the operator name is configured', async () => {
		const { client, requests } = fakeClient(undefined, 'Diego');
		await retry(client, INTENT, KEY);
		expect(requests[0]!.headers.get('x-factory-on-behalf-of')).toBe('Diego');
	});

	it('omits x-factory-on-behalf-of when no operator name is configured', async () => {
		for (const name of [undefined, '', '   ']) {
			const { client, requests } = fakeClient(undefined, name);
			await retry(client, INTENT, KEY);
			expect(requests[0]!.headers.has('x-factory-on-behalf-of')).toBe(false);
		}
	});

	it('drops undocumented fields from a valid 202 body', async () => {
		const { client } = fakeClient(() => jsonResponse({ ...acceptedRetry, extra: 'x' }));
		expect(await retry(client, INTENT, KEY)).toEqual({ ok: true, data: acceptedRetry });
	});

	it.each([
		['no body', () => new Response(null, { status: 202 })],
		['a missing ticket', () => jsonResponse({ message: 'ok', revision: 1 })],
		['a negative revision', () => jsonResponse({ ...acceptedRetry, revision: -1 })],
		['a fractional revision', () => jsonResponse({ ...acceptedRetry, revision: 1.5 })],
		['a string revision', () => jsonResponse({ ...acceptedRetry, revision: '42' })],
		['an array', () => jsonResponse([acceptedRetry])],
		['a 200 instead of 202', () => jsonResponse(acceptedRetry, 200)],
		[
			'HTML',
			() =>
				new Response('<html>oops</html>', { status: 202, headers: { 'content-type': 'text/html' } })
		]
	])('a 202 with %s is a contract_error', async (_label, respond) => {
		const { client } = fakeClient(respond);
		const result = await retry(client, INTENT, KEY);
		expect(result).toMatchObject({
			ok: false,
			failure: { status: 502, type: 'contract_error', retryable: false }
		});
	});

	it.each([
		[
			problemReplyValidationError,
			{
				status: 400,
				type: 'validation_error',
				retryable: false,
				fieldErrors: [{ path: 'body.answer', message: 'Must not be empty.' }]
			}
		],
		[problemInvalidState, { status: 409, type: 'invalid_state', retryable: false }],
		[problemNotWaitingForReply, { status: 409, type: 'not_waiting_for_reply', retryable: false }],
		[problemInsufficientScope, { status: 403, type: 'insufficient_scope', retryable: false }],
		[problemUnauthorized, { status: 401, type: 'unauthorized', retryable: false }],
		[problemInternalError, { status: 500, type: 'internal_error', retryable: true }]
	])('normalizes a $type problem', async (problem, expected) => {
		const { client } = fakeClient(() =>
			jsonResponse(problem, problem.status, 'application/problem+json')
		);
		const result = await reply(client, INTENT, KEY, { answer: 'x' });
		expect(result).toEqual({
			ok: false,
			failure: {
				...expected,
				title: problem.title,
				...('detail' in problem && { detail: problem.detail })
			}
		});
	});

	it('normalizes a network rejection to network_error without throwing', async () => {
		const { client } = fakeClient(() => Promise.reject(new TypeError('fetch failed')));
		const result = await stop(client, INTENT, 'run_01');
		expect(result).toMatchObject({
			ok: false,
			failure: { status: 502, type: 'network_error', retryable: true }
		});
	});
});
