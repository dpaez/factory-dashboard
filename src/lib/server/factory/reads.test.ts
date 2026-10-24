import { describe, expect, it } from 'vitest';

import {
	agentList,
	backlogPage,
	executionList,
	meWithOperator,
	problemTicketNotFound,
	problemValidationError,
	runPage,
	runReviewChangesRequested,
	statsConfigurations,
	statsStages,
	statsSummary,
	statsTickets,
	ticketDetailAgentQuestion,
	ticketPage
} from '$lib/factory/fixtures';

import { createFactoryClient, type FactoryClient } from './client';
import { CONTRACT_ERROR, NETWORK_ERROR } from './errors';
import {
	getBacklog,
	getMe,
	getRun,
	getStatsConfigurations,
	getStatsStages,
	getStatsSummary,
	getStatsTickets,
	getTicket,
	listAgents,
	listExecutions,
	listRuns,
	listTickets,
	type FactoryResult
} from './reads';

const BASE_URL = 'http://127.0.0.1:7731';
const TOKEN = 'secret-token-abc123';

function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

/** A client whose fake `fetch` records each request and answers with `respond`. */
function fakeClient(respond: () => Response | Promise<Response>) {
	const requests: Request[] = [];
	const client = createFactoryClient({
		baseUrl: BASE_URL,
		token: TOKEN,
		fetch: async (request) => {
			requests.push(request);
			return respond();
		}
	});
	return { client, requests };
}

function only(requests: Request[]): { method: string; path: string; search: URLSearchParams } {
	expect(requests).toHaveLength(1);
	const request = requests[0];
	if (!request) throw new Error('no request');
	const url = new URL(request.url);
	expect(url.origin).toBe(BASE_URL);
	expect(request.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
	return { method: request.method, path: url.pathname, search: url.searchParams };
}

type ReadCase = {
	name: string;
	call: (client: FactoryClient) => Promise<FactoryResult<unknown>>;
	path: string;
	query: Array<[string, string]>;
	fixture: unknown;
};

const KEY = 'dpaez-factory-dashboard-17-e32797ab';

const cases: ReadCase[] = [
	{ name: 'getMe', call: (c) => getMe(c), path: '/v1/me', query: [], fixture: meWithOperator },
	{
		name: 'listTickets without params',
		call: (c) => listTickets(c),
		path: '/v1/tickets',
		query: [],
		fixture: ticketPage
	},
	{
		name: 'listTickets with every param and repeated stage/state',
		call: (c) =>
			listTickets(c, {
				cursor: 'cursor-page-2',
				limit: 25,
				needsUser: 'true',
				ref: 'dpaez/factory-dashboard#17',
				stage: ['qa', 'review'],
				state: ['waiting_for_user', 'paused'],
				status: 'all'
			}),
		path: '/v1/tickets',
		query: [
			['cursor', 'cursor-page-2'],
			['limit', '25'],
			['needsUser', 'true'],
			['ref', 'dpaez/factory-dashboard#17'],
			['stage', 'qa'],
			['stage', 'review'],
			['state', 'waiting_for_user'],
			['state', 'paused'],
			['status', 'all']
		],
		fixture: ticketPage
	},
	{
		name: 'listTickets with a single stage and state',
		call: (c) => listTickets(c, { stage: 'work', state: 'active', needsUser: 'false' }),
		path: '/v1/tickets',
		query: [
			['stage', 'work'],
			['state', 'active'],
			['needsUser', 'false']
		],
		fixture: ticketPage
	},
	{
		name: 'getTicket',
		call: (c) => getTicket(c, KEY),
		path: `/v1/tickets/${KEY}`,
		query: [],
		fixture: ticketDetailAgentQuestion
	},
	{
		name: 'getTicket with an execution and an encoded key',
		call: (c) => getTicket(c, 'a/b#1 c', { execution: 2 }),
		path: '/v1/tickets/a%2Fb%231%20c',
		query: [['execution', '2']],
		fixture: ticketDetailAgentQuestion
	},
	{
		name: 'listExecutions',
		call: (c) => listExecutions(c, 'a/b'),
		path: '/v1/tickets/a%2Fb/executions',
		query: [],
		fixture: executionList
	},
	{
		name: 'listRuns',
		call: (c) => listRuns(c, KEY, { cursor: 'r2', limit: 10, execution: 1 }),
		path: `/v1/tickets/${KEY}/runs`,
		query: [
			['cursor', 'r2'],
			['limit', '10'],
			['execution', '1']
		],
		fixture: runPage
	},
	{
		name: 'getRun',
		call: (c) => getRun(c, 'run/1?x'),
		path: '/v1/runs/run%2F1%3Fx',
		query: [],
		fixture: runReviewChangesRequested
	},
	{
		name: 'listAgents',
		call: (c) => listAgents(c),
		path: '/v1/agents',
		query: [],
		fixture: agentList
	},
	{
		name: 'getBacklog',
		call: (c) => getBacklog(c, { cursor: 'b2', limit: 50, refresh: 'true' }),
		path: '/v1/backlog',
		query: [
			['cursor', 'b2'],
			['limit', '50'],
			['refresh', 'true']
		],
		fixture: backlogPage
	},
	{
		name: 'getStatsSummary',
		call: (c) => getStatsSummary(c, { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }),
		path: '/v1/stats/summary',
		query: [
			['from', '2026-10-01T00:00:00Z'],
			['to', '2026-11-01T00:00:00Z']
		],
		fixture: statsSummary
	},
	{
		name: 'getStatsStages',
		call: (c) => getStatsStages(c, { from: '2026-10-01', groupBy: 'setup' }),
		path: '/v1/stats/stages',
		query: [
			['from', '2026-10-01'],
			['groupBy', 'setup']
		],
		fixture: statsStages
	},
	{
		name: 'getStatsConfigurations',
		call: (c) => getStatsConfigurations(c, { to: '2026-11-01' }),
		path: '/v1/stats/configurations',
		query: [['to', '2026-11-01']],
		fixture: statsConfigurations
	},
	{
		name: 'getStatsTickets',
		call: (c) => getStatsTickets(c, { from: '2026-10-01', cursor: 's2', limit: 100 }),
		path: '/v1/stats/tickets',
		query: [
			['from', '2026-10-01'],
			['cursor', 's2'],
			['limit', '100']
		],
		fixture: statsTickets
	}
];

describe('read operations', () => {
	it.each(cases)('$name: GET $path and returns the fixture', async (c) => {
		const { client, requests } = fakeClient(() => jsonResponse(c.fixture));

		const result = await c.call(client);

		const { method, path, search } = only(requests);
		expect(method).toBe('GET');
		expect(path).toBe(c.path);
		expect([...search.entries()]).toEqual(c.query);
		expect(result).toEqual({ ok: true, data: c.fixture });
	});

	it('preserves null facts instead of coercing them to zero', async () => {
		const { client } = fakeClient(() => jsonResponse(statsSummary));

		const result = await getStatsSummary(client);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.medianMs.waiting).toBeNull();
		expect(result.data.externalReviewRounds.median).toBeNull();
	});
});

describe('read operations: failures', () => {
	it('returns the normalized failure for a Problem response', async () => {
		const { client } = fakeClient(() =>
			jsonResponse(problemTicketNotFound, 404, 'application/problem+json')
		);

		const result = await getTicket(client, 'missing-ticket-00000000');

		expect(result).toEqual({
			ok: false,
			failure: {
				status: 404,
				type: 'ticket_not_found',
				title: problemTicketNotFound.title,
				detail: problemTicketNotFound.detail,
				retryable: false
			}
		});
	});

	it('maps validation_error field errors through a read', async () => {
		const { client } = fakeClient(() =>
			jsonResponse(problemValidationError, 400, 'application/problem+json')
		);

		const result = await listTickets(client, { stage: 'qa' });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.type).toBe('validation_error');
		expect(result.failure.fieldErrors).toEqual(problemValidationError.errors);
	});

	it('returns a contract failure for an HTML error page', async () => {
		const { client } = fakeClient(
			() =>
				new Response('<html>Bad gateway</html>', {
					status: 502,
					headers: { 'content-type': 'text/html' }
				})
		);

		const result = await listAgents(client);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.type).toBe(CONTRACT_ERROR);
		expect(JSON.stringify(result.failure)).not.toContain('Bad gateway');
	});

	it('returns a contract failure for invalid success JSON', async () => {
		const { client } = fakeClient(
			() =>
				new Response('{not json', { status: 200, headers: { 'content-type': 'application/json' } })
		);

		const result = await getMe(client);

		expect(result).toMatchObject({ ok: false, failure: { type: CONTRACT_ERROR } });
	});

	it('returns a network failure when fetch rejects, without the URL or token', async () => {
		const { client } = fakeClient(() => {
			throw new TypeError(`fetch failed: ${BASE_URL} ${TOKEN}`);
		});

		const result = await getBacklog(client, { refresh: 'true' });

		expect(result).toMatchObject({ ok: false, failure: { type: NETWORK_ERROR, retryable: true } });
		expect(JSON.stringify(result)).not.toContain(TOKEN);
		expect(JSON.stringify(result)).not.toContain('127.0.0.1');
	});
});
