import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { components } from '$lib/factory/generated/factory-api';
import { ticketQueuedInPlan } from '$lib/factory/fixtures';
import type { TicketList } from '$lib/factory/models';
import { TICKET_PAGE_BOUND, TICKET_PAGE_LIMIT } from '$lib/server/factory/pages';

import {
	FAKE_FACTORY_TOKEN,
	FAKE_PAGE_SIZE,
	allTickets,
	createFakeFactory,
	type FakeFactoryOptions
} from '../../../test/fake-factory';
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

const FACTORY_HOST = 'factory.tickets-test.internal';
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
	const dependencies: string[] = [];
	const depends = (...keys: string[]) => void dependencies.push(...keys);
	const event = { depends, fetch: fake.handle } as unknown as Parameters<typeof load>[0];
	const data = (await load(event)) as { tickets: TicketList };
	return { data, requests: fake.requests, dependencies };
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

describe('/tickets load', () => {
	it('depends on the tickets key events invalidate', async () => {
		const { dependencies } = await run();
		expect(dependencies).toEqual(['factory:tickets']);
	});

	it('follows nextCursor over every page of status=all', async () => {
		const { data, requests } = await run();
		const pages = Math.ceil(allTickets.length / FAKE_PAGE_SIZE);
		expect(pages).toBeGreaterThan(1);
		expect(requests).toHaveLength(pages);
		for (const request of requests) {
			expect(request.method).toBe('GET');
			expect(request.path).toContain('status=all');
		}
		expect(requests.slice(1).every((request) => request.path.includes('cursor='))).toBe(true);
		expect(data.tickets.complete).toBe(true);
		expect(data.tickets.rows.map((row) => row.key)).toEqual(allTickets.map((t) => t.key));
		// Ticket summaries carry no cost: every row is unavailable, not $0.00.
		expect(data.tickets.rows.every((row) => row.costUsd === null)).toBe(true);
	});

	it('says the list is partial when the pager bound is hit', async () => {
		// More tickets than the bound reads (bound × the fake's page size).
		const many: components['schemas']['TicketSummary'][] = Array.from(
			{ length: TICKET_PAGE_BOUND * FAKE_PAGE_SIZE + 1 },
			(_, i) => ({ ...ticketQueuedInPlan, id: `tkt_${i}`, key: `bulk-${i}-00000000` })
		);
		const { data, requests } = await run({ tickets: many });
		expect(TICKET_PAGE_LIMIT).toBeGreaterThan(0);
		expect(requests).toHaveLength(TICKET_PAGE_BOUND);
		expect(data.tickets.complete).toBe(false);
		expect(data.tickets.rows).toHaveLength(TICKET_PAGE_BOUND * FAKE_PAGE_SIZE);
	});

	it('renders an empty list when the factory has no tickets', async () => {
		const { data } = await run({ tickets: [] });
		expect(data.tickets).toEqual({ rows: [], complete: true });
	});

	it.each([
		['401', { status: 401, title: 'Unauthorized', type: 'unauthorized' }],
		['403', { status: 403, title: 'Forbidden', type: 'insufficient_scope' }]
	] as const)('a %s is the configuration error, not an empty table', async (_, problem) => {
		const error = await pageError({ failTickets: problem });
		expect(error.status).toBe(503);
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

	it('an internal error is an unavailable page, not an empty list', async () => {
		const error = await pageError({
			failTickets: { status: 500, title: 'Internal error', type: 'internal_error' }
		});
		expect(error.status).toBe(502);
		expect(error.body.kind).toBe('unavailable');
	});

	it('serialized page data has no token, factory URL or host', async () => {
		const { data } = await run();
		const serialized = JSON.stringify(data);
		expect(serialized).not.toContain(FAKE_FACTORY_TOKEN);
		expect(serialized).not.toContain(FACTORY_URL);
		expect(serialized).not.toContain(FACTORY_HOST);
	});
});
