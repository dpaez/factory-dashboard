import { isHttpError } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	backlogBlockedIssue,
	backlogIssueBare,
	backlogIssuePlain,
	backlogIssues,
	backlogPageEmpty,
	backlogUmbrellaIssue,
	problemTicketNotFound,
	problemTrackerUnavailable,
	problemUnauthorized,
	problemValidationError,
	statsTicketsComplete,
	statsTicketsPageOne,
	statsTicketsPageTwo,
	ticketActiveInQa,
	ticketActiveInWork,
	ticketCompleteInDone,
	ticketQueuedInPlan
} from '$lib/factory/fixtures';

import {
	FAKE_BACKLOG_FETCHED_AT,
	FAKE_FACTORY_TOKEN,
	FAKE_PAGE_SIZE,
	createFakeFactory,
	openTickets,
	type FakeFactoryOptions
} from '../../../../test/fake-factory';

import { createFactoryClient, factoryClientFromEnv } from './client';
import { normalizeFactoryFailure } from './errors';
import { listAllBacklog, listAllStatsTickets, listAllTickets, throwPageError } from './pages';

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

describe('listAllStatsTickets', () => {
	const window = { from: '2026-10-01T00:00:00Z', to: '2026-10-31T00:00:00Z' };
	const [a, b, c] = statsTicketsComplete.items;
	const { items: _items, nextCursor: _cursor, ...envelope } = statsTicketsComplete;

	it('follows three pages with the same from/to and reports complete', async () => {
		const { client, requests } = scriptedClient([
			() => json({ ...envelope, items: [a], nextCursor: '1' }),
			() => json({ ...envelope, items: [b], nextCursor: '2' }),
			() => json({ ...envelope, items: [c], nextCursor: null })
		]);

		const result = await listAllStatsTickets(client, window);

		expect(result).toEqual({
			ok: true,
			data: { items: [a, b, c], envelope, complete: true, mismatch: false }
		});
		const urls = requests.map((request) => new URL(request.url));
		expect(urls.every((url) => url.pathname === '/v1/stats/tickets')).toBe(true);
		expect(urls.map((url) => url.searchParams.get('cursor'))).toEqual([null, '1', '2']);
		expect(urls.every((url) => url.searchParams.get('from') === window.from)).toBe(true);
		expect(urls.every((url) => url.searchParams.get('to') === window.to)).toBe(true);
		expect(urls.every((url) => url.searchParams.get('limit') === '200')).toBe(true);
	});

	it('loads the two-page fixture into the complete cohort', async () => {
		const { client } = scriptedClient([
			() => json(statsTicketsPageOne),
			() => json(statsTicketsPageTwo)
		]);

		const result = await listAllStatsTickets(client, window);

		expect(result.ok && result.data.items).toEqual(statsTicketsComplete.items);
		expect(result.ok && result.data.complete).toBe(true);
	});

	it('reports incomplete at the page bound', async () => {
		const { client, requests } = scriptedClient([
			() => json({ ...envelope, items: [a], nextCursor: '1' }),
			() => json({ ...envelope, items: [b], nextCursor: '2' })
		]);

		const result = await listAllStatsTickets(client, window, { pages: 2, limit: 1 });

		expect(result).toEqual({
			ok: true,
			data: { items: [a, b], envelope, complete: false, mismatch: false }
		});
		expect(requests).toHaveLength(2);
		expect(new URL(requests[0]!.url).searchParams.get('limit')).toBe('1');
	});

	it('returns the first failure as is, never the loaded pages', async () => {
		const { client } = scriptedClient([
			() => json({ ...envelope, items: [a], nextCursor: '1' }),
			() => problem(problemValidationError, 400),
			() => json({ ...envelope, items: [c], nextCursor: null })
		]);

		const result = await listAllStatsTickets(client, window);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.failure.type).toBe('validation_error');
		expect(result).not.toHaveProperty('data');
	});

	it('reports a mismatched envelope instead of merging its rows', async () => {
		const { client } = scriptedClient([
			() => json({ ...envelope, items: [a], nextCursor: '1' }),
			() => json({ ...envelope, factoryId: 'factory-other', items: [b], nextCursor: null })
		]);

		const result = await listAllStatsTickets(client, window);

		expect(result).toEqual({
			ok: true,
			data: { items: [a], envelope, complete: false, mismatch: true }
		});
	});
});

describe('listAllBacklog', () => {
	const firstAt = '2026-10-13T11:00:00Z';
	const laterAt = '2026-10-13T11:00:05Z';

	it('follows nextCursor to the end, keeps the first fetchedAt and reports complete', async () => {
		const { client, requests } = scriptedClient([
			() => json({ fetchedAt: firstAt, items: [backlogIssuePlain], nextCursor: 'b2' }),
			() => json({ fetchedAt: laterAt, items: [backlogUmbrellaIssue], nextCursor: 'b3' }),
			() => json({ fetchedAt: laterAt, items: [backlogBlockedIssue], nextCursor: null })
		]);

		const result = await listAllBacklog(client);

		expect(result).toEqual({
			ok: true,
			data: {
				items: [backlogIssuePlain, backlogUmbrellaIssue, backlogBlockedIssue],
				fetchedAt: firstAt,
				complete: true
			}
		});
		const searches = requests.map((request) => new URL(request.url));
		expect(searches.every((url) => url.pathname === '/v1/backlog')).toBe(true);
		expect(searches.map((url) => url.searchParams.get('cursor'))).toEqual([null, 'b2', 'b3']);
		expect(searches.every((url) => url.searchParams.get('limit') === '100')).toBe(true);
		expect(searches.every((url) => !url.searchParams.has('refresh'))).toBe(true);
	});

	it('sends refresh=true on the first request only', async () => {
		const { client, requests } = scriptedClient([
			() => json({ fetchedAt: firstAt, items: [backlogIssuePlain], nextCursor: 'b2' }),
			() => json({ fetchedAt: laterAt, items: [backlogIssueBare], nextCursor: null })
		]);

		const result = await listAllBacklog(client, { refresh: true });

		expect(result.ok && result.data.fetchedAt).toBe(firstAt);
		const refresh = requests.map((request) => new URL(request.url).searchParams.get('refresh'));
		expect(refresh).toEqual(['true', null]);
	});

	it('returns an empty complete backlog', async () => {
		const { client } = scriptedClient([() => json(backlogPageEmpty)]);
		expect(await listAllBacklog(client)).toEqual({
			ok: true,
			data: { items: [], fetchedAt: backlogPageEmpty.fetchedAt, complete: true }
		});
	});

	it('reports incomplete when the page bound is hit', async () => {
		const { client, requests } = scriptedClient([
			() => json({ fetchedAt: firstAt, items: [backlogIssuePlain], nextCursor: 'b2' }),
			() => json({ fetchedAt: laterAt, items: [backlogIssueBare], nextCursor: 'b3' })
		]);

		const result = await listAllBacklog(client, {}, { pages: 2, limit: 1 });

		expect(result).toEqual({
			ok: true,
			data: { items: [backlogIssuePlain, backlogIssueBare], fetchedAt: firstAt, complete: false }
		});
		expect(requests).toHaveLength(2);
		expect(new URL(requests[0]!.url).searchParams.get('limit')).toBe('1');
	});

	it('returns the first failure unchanged, never a partial list', async () => {
		const { client } = scriptedClient([
			() => json({ fetchedAt: firstAt, items: [backlogIssuePlain], nextCursor: 'b2' }),
			() => problem(problemTrackerUnavailable, 503),
			() => json({ fetchedAt: laterAt, items: [backlogIssueBare], nextCursor: null })
		]);
		const direct = scriptedClient([() => problem(problemTrackerUnavailable, 503)]);

		const result = await listAllBacklog(client);
		const failureAlone = await listAllBacklog(direct.client);

		expect(result.ok).toBe(false);
		expect(result).not.toHaveProperty('data');
		if (!result.ok && !failureAlone.ok) {
			expect(result.failure.type).toBe('tracker_unavailable');
			expect(result.failure).toEqual(failureAlone.failure);
		}
	});
});

describe('fake factory GET /v1/tickets?needsUser', () => {
	function fakeClient() {
		return createFactoryClient({
			baseUrl: BASE_URL,
			token: FAKE_FACTORY_TOKEN,
			fetch: createFakeFactory().handle
		});
	}

	it('lists only needs-attention tickets for needsUser=true', async () => {
		const result = await listAllTickets(fakeClient(), { status: 'open', needsUser: 'true' });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const expected = openTickets.filter((ticket) => ticket.needsUser);
		expect(expected.length).toBeGreaterThan(FAKE_PAGE_SIZE);
		expect(result.data.items).toEqual(expected);
	});

	it('lists only the others for needsUser=false, and both without the filter', async () => {
		const client = fakeClient();
		const others = await listAllTickets(client, { status: 'open', needsUser: 'false' });
		const all = await listAllTickets(client, { status: 'open' });

		expect(others.ok && others.data.items).toEqual(openTickets.filter((t) => !t.needsUser));
		expect(all.ok && all.data.items).toEqual(openTickets);
	});
});

describe('fake factory GET /v1/backlog', () => {
	function fakeClient(options: FakeFactoryOptions = {}) {
		const fake = createFakeFactory(options);
		const client = createFactoryClient({
			baseUrl: BASE_URL,
			token: FAKE_FACTORY_TOKEN,
			fetch: fake.handle
		});
		return { client, requests: fake.requests };
	}

	it('serves every backlog fixture in pages of FAKE_PAGE_SIZE', async () => {
		const { client, requests } = fakeClient();

		const result = await listAllBacklog(client, { refresh: true });

		expect(result).toEqual({
			ok: true,
			data: { items: backlogIssues, fetchedAt: FAKE_BACKLOG_FETCHED_AT, complete: true }
		});
		expect(backlogIssues.length).toBeGreaterThan(FAKE_PAGE_SIZE);
		expect(requests).toHaveLength(Math.ceil(backlogIssues.length / FAKE_PAGE_SIZE));
		expect(requests[0]).toEqual({ method: 'GET', path: '/v1/backlog?limit=100&refresh=true' });
		expect(requests[1]?.path).toBe(`/v1/backlog?limit=100&cursor=${FAKE_PAGE_SIZE}`);
	});

	it('serves the backlog option', async () => {
		const { client } = fakeClient({ backlog: [backlogBlockedIssue] });
		const result = await listAllBacklog(client);
		expect(result.ok && result.data.items).toEqual([backlogBlockedIssue]);
	});

	it('answers failBacklog with the problem', async () => {
		const { client } = fakeClient({ failBacklog: problemTrackerUnavailable });
		const result = await listAllBacklog(client);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.failure).toMatchObject({ status: 503, type: 'tracker_unavailable' });
		}
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
