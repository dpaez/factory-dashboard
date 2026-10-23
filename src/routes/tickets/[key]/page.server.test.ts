import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	runPage,
	runWrapupPrepared,
	ticketDetailActiveInQa,
	ticketDetailMultiExecution,
	ticketDetailMultiExecutionFirst
} from '$lib/factory/fixtures';
import type { TicketDetailView } from '$lib/factory/models';

import {
	FAKE_FACTORY_TOKEN,
	FAKE_PAGE_SIZE,
	createFakeFactory,
	ticketDetails,
	type FakeFactoryOptions
} from '../../../../test/fake-factory';
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

const FACTORY_HOST = 'factory.detail-test.internal';
const FACTORY_URL = `http://${FACTORY_HOST}:7731`;
const MULTI = ticketDetailMultiExecution.key;

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
});

type Data = { detail: TicketDetailView; runsComplete: boolean };

async function run(key: string, search = '', options: FakeFactoryOptions = {}) {
	const fake = createFakeFactory(options);
	const dependencies: string[] = [];
	const event = {
		depends: (...keys: string[]) => void dependencies.push(...keys),
		fetch: fake.handle,
		params: { key },
		url: new URL(`http://dashboard.local/tickets/${encodeURIComponent(key)}${search}`)
	} as unknown as Parameters<typeof load>[0];
	const data = (await load(event)) as Data;
	return { data, requests: fake.requests, dependencies };
}

async function pageError(key: string, search = '', options: FakeFactoryOptions = {}) {
	try {
		await run(key, search, options);
	} catch (cause) {
		if (isHttpError(cause)) return cause;
		throw cause;
	}
	throw new Error('load did not throw');
}

describe('/tickets/[key] load', () => {
	it("depends on this ticket's detail and runs keys, encoded", async () => {
		const { dependencies } = await run(MULTI);
		expect(dependencies).toEqual([
			`factory:ticket:${encodeURIComponent(MULTI)}`,
			`factory:runs:${encodeURIComponent(MULTI)}`
		]);
	});

	it('reads the ticket, its executions and every run page, and maps them', async () => {
		const { data, requests } = await run(MULTI);
		const { detail } = data;

		expect(requests.every((request) => request.method === 'GET')).toBe(true);
		expect(requests.some((r) => r.path === `/v1/tickets/${MULTI}`)).toBe(true);
		expect(requests.some((r) => r.path === `/v1/tickets/${MULTI}/executions`)).toBe(true);
		const runRequests = requests.filter((r) => r.path.startsWith(`/v1/tickets/${MULTI}/runs`));
		expect(runRequests).toHaveLength(Math.ceil(runPage.items.length / FAKE_PAGE_SIZE));
		expect(runRequests.length).toBeGreaterThan(1);

		expect(detail.header).toMatchObject({ key: MULTI, execution: 2, current: true });
		expect(detail.runs.map((r) => r.id)).toEqual(runPage.items.map((r) => r.id));
		expect(data.runsComplete).toBe(true);
		expect(detail.executions.map((e) => [e.generation, e.current, e.selected])).toEqual([
			[1, false, false],
			[2, true, true]
		]);
		expect(detail.usage).toEqual(ticketDetails.get(MULTI)?.usage);
	});

	it('passes an encoded key through verbatim', async () => {
		const { requests } = await run(ticketDetailActiveInQa.key);
		expect(requests[0]?.path.startsWith(`/v1/tickets/${ticketDetailActiveInQa.key}`)).toBe(true);
	});

	it('?execution=1 asks the ticket and its runs for execution 1', async () => {
		const { data, requests } = await run(MULTI, '?execution=1');
		const ticketReads = requests.filter((r) => r.path.startsWith(`/v1/tickets/${MULTI}?`));
		const runReads = requests.filter((r) => r.path.startsWith(`/v1/tickets/${MULTI}/runs`));
		expect(ticketReads).toHaveLength(1);
		expect(new URL(`http://x${ticketReads[0]!.path}`).searchParams.get('execution')).toBe('1');
		expect(runReads.length).toBeGreaterThan(0);
		for (const read of runReads) {
			expect(new URL(`http://x${read.path}`).searchParams.get('execution')).toBe('1');
		}

		expect(data.detail.header).toMatchObject({ execution: 1, current: false, stage: 'done' });
		expect(data.detail.tasks.map((t) => t.title)).toEqual(
			ticketDetailMultiExecutionFirst.tasks.map((t) => t.title)
		);
		expect(data.detail.runs.map((r) => r.id)).toEqual(['run_gen1_plan', 'run_gen1_review']);
		expect(data.detail.executions.find((e) => e.selected)?.generation).toBe(1);
	});

	it.each([['0'], ['-1'], ['1.5'], ['abc'], [''], ['01'], ['99999999999999999999']])(
		'?execution=%s is a 400 and reads nothing',
		async (value) => {
			const fake = createFakeFactory();
			const event = {
				depends: () => {},
				fetch: fake.handle,
				params: { key: MULTI },
				url: new URL(`http://dashboard.local/tickets/${MULTI}?execution=${value}`)
			} as unknown as Parameters<typeof load>[0];
			let thrown: unknown;
			try {
				await load(event);
			} catch (cause) {
				thrown = cause;
			}
			expect(isHttpError(thrown)).toBe(true);
			if (isHttpError(thrown)) {
				expect(thrown.status).toBe(400);
				expect(thrown.body.kind).toBe('invalid');
			}
			expect(fake.requests).toHaveLength(0);
		}
	);

	it.each([
		['401', { status: 401, title: 'Unauthorized', type: 'unauthorized' }],
		['403', { status: 403, title: 'Forbidden', type: 'insufficient_scope' }]
	] as const)('a %s is the configuration error', async (_, problem) => {
		const error = await pageError(MULTI, '', {
			failDetail: { keys: [MULTI], problem },
			failRuns: problem,
			failExecutions: problem
		});
		expect(error.status).toBe(503);
		expect(error.body.kind).toBe('configuration');
	});

	it('a wrong token is the configuration error', async () => {
		const error = await pageError(MULTI, '', { token: 'another-token' });
		expect(error.status).toBe(503);
		expect(error.body.kind).toBe('configuration');
	});

	it('missing FACTORY_API_TOKEN is the configuration error naming it', async () => {
		delete process.env.FACTORY_API_TOKEN;
		const error = await pageError(MULTI);
		expect(error.status).toBe(503);
		expect(error.body.kind).toBe('configuration');
		expect(error.body.detail).toContain('FACTORY_API_TOKEN');
	});

	it('ticket_not_found is a 404', async () => {
		const error = await pageError('no-such-ticket-00000000');
		expect(error.status).toBe(404);
		expect(error.body).toMatchObject({ kind: 'not_found', message: 'No such ticket' });
	});

	it('an unknown execution (not_found) is a 404', async () => {
		const error = await pageError(MULTI, '?execution=9');
		expect(error.status).toBe(404);
		expect(error.body).toMatchObject({ kind: 'not_found', message: 'No such execution' });
	});

	it('a run with null usage has costUsd null, not 0', async () => {
		const { data } = await run(MULTI);
		const wrapup = data.detail.runs.find((r) => r.id === runWrapupPrepared.id);
		expect(runWrapupPrepared.usage).toBeNull();
		expect(wrapup?.usage).toBeNull();
		expect(wrapup?.costUsd).toBeNull();
	});

	it('a ticket at stage qa loads with its review and QA summaries', async () => {
		const { data } = await run(ticketDetailActiveInQa.key);
		expect(data.detail.header.stage).toBe('qa');
		const [first] = data.detail.tasks;
		expect(first?.summaries.map((s) => s.stage)).toEqual(['review', 'qa']);
		expect(data.detail.attention).toHaveLength(ticketDetailActiveInQa.attention.length);
	});

	it('a runs failure fails the page rather than showing no runs', async () => {
		const error = await pageError(MULTI, '', {
			failRuns: { status: 500, title: 'Internal error', type: 'internal_error' }
		});
		expect(error.status).toBe(502);
		expect(error.body.kind).toBe('unavailable');
	});

	it('serialized page data has no token, factory URL or host', async () => {
		for (const search of ['', '?execution=1']) {
			const { data } = await run(MULTI, search);
			const serialized = JSON.stringify(data);
			expect(serialized).not.toContain(FAKE_FACTORY_TOKEN);
			expect(serialized).not.toContain(FACTORY_URL);
			expect(serialized).not.toContain(FACTORY_HOST);
		}
	});
});
