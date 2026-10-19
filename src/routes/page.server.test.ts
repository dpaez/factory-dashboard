import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPEN_TICKETS_USAGE_LABEL } from '$lib/factory/adapters';
import { agentList, ticketActiveInWork } from '$lib/factory/fixtures';
import type { Overview } from '$lib/factory/models';

import {
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	openTickets,
	openTicketsCostUsd,
	type FakeFactoryOptions
} from '../../test/fake-factory';
import { load } from './+page.server';

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

const FACTORY_HOST = 'factory.overview-test.internal';
const FACTORY_URL = `http://${FACTORY_HOST}:7731`;

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
});

async function run(options: FakeFactoryOptions = {}) {
	const fake = createFakeFactory(options);
	const event = { fetch: fake.handle } as unknown as Parameters<typeof load>[0];
	const data = (await load(event)) as { overview: Overview };
	return { data, requests: fake.requests };
}

async function pageError(options: FakeFactoryOptions = {}) {
	try {
		await run(options);
	} catch (cause) {
		if (isHttpError(cause)) return cause;
		throw cause;
	}
	throw new Error('load did not throw');
}

describe('/ load', () => {
	it('reads open tickets, agents and each open ticket, and builds the overview', async () => {
		const { data, requests } = await run();
		const { overview } = data;

		expect(requests.every((request) => request.method === 'GET')).toBe(true);
		expect(
			requests.some((r) => r.path.startsWith('/v1/tickets?') && r.path.includes('status=open'))
		).toBe(true);
		expect(requests.some((r) => r.path === '/v1/agents')).toBe(true);
		for (const ticket of openTickets) {
			expect(requests.some((r) => r.path === `/v1/tickets/${ticket.key}`)).toBe(true);
		}

		expect(overview.complete).toBe(true);
		expect(overview.tickets.map((row) => row.key)).toEqual(openTickets.map((t) => t.key));
		expect(overview.needsAttention.count).toBe(openTickets.filter((t) => t.needsUser).length);
		expect(overview.activeAgents).toBe(agentList.items.length);
		expect(overview.stageCounts.qa).toBe(openTickets.filter((t) => t.stage === 'qa').length);
		expect(overview.stageCounts.qa).toBeGreaterThan(0);
		expect(overview.usage).toMatchObject({ available: true, label: OPEN_TICKETS_USAGE_LABEL });
		if (!overview.usage.available) throw new Error('usage unavailable');
		expect(overview.usage.usage.costUsd).toBeCloseTo(openTicketsCostUsd);
		expect(overview.tickets.every((row) => row.costUsd !== null)).toBe(true);
	});

	it('shows $0.00 with "no open tickets" when nothing is open', async () => {
		const { data } = await run({ tickets: [] });
		expect(data.overview.tickets).toEqual([]);
		expect(data.overview.usage).toMatchObject({
			available: true,
			label: 'no open tickets',
			usage: { costUsd: 0 }
		});
	});

	it.each([
		['401', { status: 401, title: 'Unauthorized', type: 'unauthorized' }],
		['403', { status: 403, title: 'Forbidden', type: 'insufficient_scope' }]
	] as const)('a %s on the ticket read is the configuration error', async (_, problem) => {
		const error = await pageError({ failTickets: problem });
		expect(error.status).toBe(503);
		expect(error.body.kind).toBe('configuration');
	});

	it('a wrong token is the configuration error, not an empty overview', async () => {
		process.env.FACTORY_API_TOKEN = 'not-the-token';
		const error = await pageError();
		expect(error.status).toBe(503);
		expect(error.body.kind).toBe('configuration');
	});

	it('a 401 on a detail read is still the configuration error', async () => {
		const error = await pageError({
			failDetail: {
				keys: [ticketActiveInWork.key],
				problem: { status: 401, title: 'Unauthorized', type: 'unauthorized' }
			}
		});
		expect(error.body.kind).toBe('configuration');
	});

	it.each([['FACTORY_API_URL'], ['FACTORY_API_TOKEN']])(
		'missing %s is the configuration error naming it',
		async (name) => {
			delete process.env[name];
			const error = await pageError();
			expect(error.status).toBe(503);
			expect(error.body.kind).toBe('configuration');
			expect(error.body.detail).toContain(name);
		}
	);

	it('a failing agents read makes only that card unavailable', async () => {
		const { data } = await run({
			failAgents: { status: 500, title: 'Internal error', type: 'internal_error' }
		});
		expect(data.overview.activeAgents).toBeNull();
		expect(data.overview.usage.available).toBe(true);
		expect(data.overview.tickets).toHaveLength(openTickets.length);
	});

	it('one failing detail read makes the usage card unavailable, not a partial sum', async () => {
		const { data } = await run({
			failDetail: {
				keys: [ticketActiveInWork.key],
				problem: { status: 500, title: 'Internal error', type: 'internal_error' }
			}
		});
		expect(data.overview.usage).toEqual({ available: false, label: OPEN_TICKETS_USAGE_LABEL });
		expect(data.overview.activeAgents).toBe(agentList.items.length);
		expect(data.overview.tickets).toHaveLength(openTickets.length);
	});

	it('serialized page data has no token, factory URL or host', async () => {
		const { data } = await run();
		const serialized = JSON.stringify(data);
		expect(serialized).not.toContain(FAKE_FACTORY_TOKEN);
		expect(serialized).not.toContain(FACTORY_URL);
		expect(serialized).not.toContain(FACTORY_HOST);
	});

	it('the configuration error body has no token, factory URL or host', async () => {
		const error = await pageError({
			failTickets: { status: 401, title: 'Unauthorized', type: 'unauthorized' }
		});
		const serialized = JSON.stringify(error.body);
		expect(serialized).not.toContain(FAKE_FACTORY_TOKEN);
		expect(serialized).not.toContain(FACTORY_HOST);
	});
});
