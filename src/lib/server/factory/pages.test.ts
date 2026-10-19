import { isHttpError } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	problemTicketNotFound,
	problemTrackerUnavailable,
	problemUnauthorized,
	problemValidationError,
	ticketActiveInQa,
	ticketActiveInWork,
	ticketCompleteInDone,
	ticketQueuedInPlan
} from '$lib/factory/fixtures';

import { createFactoryClient, factoryClientFromEnv } from './client';
import { normalizeFactoryFailure } from './errors';
import { listAllTickets, throwPageError } from './pages';

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

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
});

const BASE_URL = 'http://factory.test-host.internal:7731';
const TOKEN = 'secret-token-abc123';

function json(body: unknown, status = 200, contentType = 'application/json') {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

function problem(body: unknown, status: number) {
	return json(body, status, 'application/problem+json');
}

/** A client answering each request with the next response in order. */
function scriptedClient(responses: Array<() => Response>) {
	const requests: Request[] = [];
	const client = createFactoryClient({
		baseUrl: BASE_URL,
		token: TOKEN,
		fetch: async (request) => {
			requests.push(request);
			const next = responses[requests.length - 1];
			if (!next) throw new Error('unexpected request');
			return next();
		}
	});
	return { client, requests };
}

describe('listAllTickets', () => {
	it('follows nextCursor across three pages and reports complete', async () => {
		const { client, requests } = scriptedClient([
			() => json({ items: [ticketQueuedInPlan], nextCursor: 'c2' }),
			() => json({ items: [ticketActiveInWork], nextCursor: 'c3' }),
			() => json({ items: [ticketActiveInQa, ticketCompleteInDone], nextCursor: null })
		]);

		const result = await listAllTickets(client, { status: 'all' });

		expect(result).toEqual({
			ok: true,
			data: {
				items: [ticketQueuedInPlan, ticketActiveInWork, ticketActiveInQa, ticketCompleteInDone],
				complete: true
			}
		});
		const searches = requests.map((request) => new URL(request.url).searchParams);
		expect(searches.map((s) => s.get('cursor'))).toEqual([null, 'c2', 'c3']);
		expect(searches.every((s) => s.get('status') === 'all')).toBe(true);
		expect(searches.every((s) => s.get('limit') === '100')).toBe(true);
	});

	it('reports incomplete when the page bound is hit', async () => {
		const { client, requests } = scriptedClient([
			() => json({ items: [ticketQueuedInPlan], nextCursor: 'c2' }),
			() => json({ items: [ticketActiveInWork], nextCursor: 'c3' })
		]);

		const result = await listAllTickets(client, {}, { pages: 2, limit: 1 });

		expect(result).toEqual({
			ok: true,
			data: { items: [ticketQueuedInPlan, ticketActiveInWork], complete: false }
		});
		expect(requests).toHaveLength(2);
		expect(new URL(requests[0]!.url).searchParams.get('limit')).toBe('1');
	});

	it('returns the failure on page 2, not page 1 alone', async () => {
		const { client } = scriptedClient([
			() => json({ items: [ticketQueuedInPlan], nextCursor: 'c2' }),
			() => problem(problemTrackerUnavailable, 503)
		]);

		const result = await listAllTickets(client);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.failure.type).toBe('tracker_unavailable');
		expect(result).not.toHaveProperty('data');
	});
});

function caught(run: () => unknown): unknown {
	try {
		run();
	} catch (cause) {
		return cause;
	}
	throw new Error('expected a throw');
}

async function failureFor(response: Response) {
	const { client } = scriptedClient([() => response]);
	const result = await listAllTickets(client);
	if (result.ok) throw new Error('expected a failure');
	return result.failure;
}

function expectSafe(thrown: unknown) {
	const serialized = JSON.stringify(thrown) + String((thrown as { body?: unknown }).body);
	expect(serialized).not.toContain(TOKEN);
	expect(serialized).not.toContain(BASE_URL);
	expect(serialized).not.toContain('test-host');
}

describe('throwPageError', () => {
	it.each([
		['401 unauthorized', () => problem(problemUnauthorized, 401)],
		[
			'403 insufficient_scope',
			() => problem({ status: 403, title: 'Insufficient scope', type: 'insufficient_scope' }, 403)
		]
	])('maps %s to a configuration page error', async (_label, respond) => {
		const failure = await failureFor(respond());
		const error = caught(() => throwPageError(failure));
		expect(isHttpError(error)).toBe(true);
		if (isHttpError(error)) {
			expect(error.status).toBe(503);
			expect(error.body.kind).toBe('configuration');
		}
		expectSafe(error);
	});

	it('maps a missing-env configuration_error thrown by factoryClientFromEnv', () => {
		process.env.FACTORY_API_URL = BASE_URL;
		const thrown = caught(() => factoryClientFromEnv(fetch));
		const error = caught(() => throwPageError(thrown));
		expect(isHttpError(error)).toBe(true);
		if (isHttpError(error)) {
			expect(error.status).toBe(503);
			expect(error.body.kind).toBe('configuration');
			expect(error.body.detail).toBe('Missing FACTORY_API_TOKEN.');
		}
		expectSafe(error);
	});

	it('never leaks the token from a configured client failure', async () => {
		process.env.FACTORY_API_URL = BASE_URL;
		process.env.FACTORY_API_TOKEN = TOKEN;
		const client = factoryClientFromEnv(async () => problem(problemUnauthorized, 401));
		const result = await listAllTickets(client);
		if (result.ok) throw new Error('expected a failure');
		const error = caught(() => throwPageError(result.failure));
		expectSafe(error);
	});

	it.each([
		['ticket_not_found', problemTicketNotFound, 'No such ticket'],
		['not_found', { status: 404, title: 'Not found', type: 'not_found' }, 'No such execution']
	])('maps %s to 404', async (_type, body, message) => {
		const failure = await failureFor(problem(body, 404));
		const error = caught(() => throwPageError(failure));
		expect(isHttpError(error)).toBe(true);
		if (isHttpError(error)) {
			expect(error.status).toBe(404);
			expect(error.body).toMatchObject({ kind: 'not_found', message });
		}
	});

	it('maps validation_error to 400', async () => {
		const failure = await failureFor(problem(problemValidationError, 400));
		const error = caught(() => throwPageError(failure));
		expect(isHttpError(error) && error.status).toBe(400);
		expect(isHttpError(error) && error.body.kind).toBe('invalid');
	});

	it.each([
		['tracker_unavailable', () => problem(problemTrackerUnavailable, 503), 503],
		[
			'internal_error',
			() => problem({ status: 500, title: 'Internal error', type: 'internal_error' }, 500),
			502
		],
		['contract_error', () => new Response('<html>oops</html>', { status: 502 }), 502]
	])('maps %s to unavailable', async (_type, respond, status) => {
		const failure = await failureFor(respond());
		const error = caught(() => throwPageError(failure));
		expect(isHttpError(error)).toBe(true);
		if (isHttpError(error)) {
			expect(error.status).toBe(status);
			expect(error.body.kind).toBe('unavailable');
		}
		expectSafe(error);
	});

	it('maps a thrown network failure to unavailable', () => {
		const error = caught(() => throwPageError(new TypeError(`fetch failed ${BASE_URL}`)));
		expect(isHttpError(error) && error.body.kind).toBe('unavailable');
		expect(isHttpError(error) && error.status).toBe(502);
		expectSafe(error);
	});

	it('accepts a normalized failure as is', () => {
		const failure = normalizeFactoryFailure(new TypeError('x'));
		const error = caught(() => throwPageError(failure));
		expect(isHttpError(error) && error.body).toEqual({
			kind: 'unavailable',
			message: 'Factory API is unreachable',
			detail: 'The request to the factory API did not complete.'
		});
	});
});
