import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	runPage,
	runPageHistory,
	ticketDetailActiveInQa,
	ticketDetailActiveInWork,
	ticketDetailComplete,
	ticketDetailMultiExecution,
	ticketDetailMultiExecutionFirst
} from '$lib/factory/fixtures';
import type { TicketResult } from '$lib/factory/inspector';

import {
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	ticketDetails,
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

const FACTORY_HOST = 'factory.ticket-handler-test.internal';
const FACTORY_URL = `http://${FACTORY_HOST}:7731`;
const UPSTREAM = 'upstream-secret-body-marker';
const MULTI = ticketDetailMultiExecution.key;

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
});

async function get(key: string, search = '', options: FakeFactoryOptions = {}) {
	const fake = createFakeFactory(options);
	const url = new URL(
		`http://dashboard.test/api/factory/tickets/${encodeURIComponent(key)}${search}`
	);
	const event = { fetch: fake.handle, params: { key }, url } as unknown as Parameters<
		typeof handlers.GET
	>[0];
	const response = await handlers.GET(event);
	const text = await response.text();
	return {
		status: response.status,
		cacheControl: response.headers.get('cache-control'),
		text,
		body: JSON.parse(text) as TicketResult,
		requests: fake.requests
	};
}

function expectSafe(text: string) {
	expect(text).not.toContain(FAKE_FACTORY_TOKEN);
	expect(text).not.toContain(FACTORY_URL);
	expect(text).not.toContain(FACTORY_HOST);
	expect(text).not.toContain(UPSTREAM);
}

function detailOf(body: TicketResult) {
	if (!body.ok) throw new Error(`expected a detail, got ${body.failure.type}`);
	return body;
}

describe('GET /api/factory/tickets/[key]', () => {
	it("answers the current execution's title, tasks and runs", async () => {
		const { status, body, text, cacheControl, requests } = await get(ticketDetailActiveInQa.key);
		expect(status).toBe(200);
		expect(cacheControl).toBe('no-store');
		const { detail, runsComplete } = detailOf(body);
		expect(detail.header).toMatchObject({
			key: ticketDetailActiveInQa.key,
			title: ticketDetailActiveInQa.title,
			execution: 1,
			current: true
		});
		expect(detail.tasks.map((t) => t.id)).toEqual(ticketDetailActiveInQa.tasks.map((t) => t.id));
		expect(detail.runs.map((r) => r.id)).toEqual(runPage.items.map((r) => r.id));
		expect(detail.usage).toEqual(ticketDetails.get(ticketDetailActiveInQa.key)?.usage);
		expect(runsComplete).toBe(true);
		expect(requests.every((r) => r.method === 'GET')).toBe(true);
		expectSafe(text);
	});

	it('lists the multi-task history with purpose, round, terminal kind, validation and review', async () => {
		const { status, body, text } = await get(ticketDetailActiveInWork.key);
		expect(status).toBe(200);
		const { detail } = detailOf(body);
		expect(detail.runs.map((r) => r.id)).toEqual(runPageHistory.items.map((r) => r.id));
		const byId = new Map(detail.runs.map((r) => [r.id, r]));
		expect(byId.get('run_hist_01_work_initial')).toMatchObject({
			purpose: 'initial',
			round: 1,
			terminalKind: 'subagent_done',
			validationStatus: 'failed',
			review: null
		});
		expect(byId.get('run_hist_01_work_correction')).toMatchObject({
			purpose: 'validation_correction',
			validationStatus: 'passed'
		});
		expect(byId.get('run_hist_01_review_changes')?.review).toEqual({
			verdict: 'changes_requested',
			round: 1,
			findings: { total: 3, blocking: 2 }
		});
		expect(byId.get('run_hist_01_work_return')).toMatchObject({
			purpose: 'return_to_work',
			round: 2
		});
		expect(byId.get('run_hist_01_review_reentry')).toMatchObject({
			purpose: 'reentry',
			review: { verdict: 'approve', round: 2, findings: { total: 0, blocking: 0 } }
		});
		expect(byId.get('run_hist_02_work_crashed')).toMatchObject({
			terminalKind: 'crashed',
			outcome: 'retrying',
			usage: null
		});
		expect(byId.get('run_hist_02_work_retry')).toMatchObject({
			purpose: 'infrastructure_retry',
			status: 'running',
			validationStatus: 'running'
		});
		expect(byId.get('run_hist_nudge')?.purpose).toBe('operator_nudge');
		expectSafe(text);
	});

	it('answers a finished ticket that is not on the board', async () => {
		const { status, body } = await get(ticketDetailComplete.key);
		expect(status).toBe(200);
		expect(detailOf(body).detail.header).toMatchObject({
			status: 'complete',
			pullRequest: ticketDetailComplete.pullRequest
		});
	});

	it('?execution=1 answers the past execution, not current', async () => {
		const { status, body, text, requests } = await get(MULTI, '?execution=1');
		expect(status).toBe(200);
		const { detail } = detailOf(body);
		expect(detail.header).toMatchObject({ execution: 1, current: false, stage: 'done' });
		expect(detail.tasks.map((t) => t.title)).toEqual(
			ticketDetailMultiExecutionFirst.tasks.map((t) => t.title)
		);
		expect(detail.executions.find((e) => e.selected)?.generation).toBe(1);
		const reads = requests.filter((r) => r.path.startsWith(`/v1/tickets/${MULTI}?`));
		expect(new URL(`http://x${reads[0]!.path}`).searchParams.get('execution')).toBe('1');
		expectSafe(text);
	});

	it('an unknown key is a 404 ticket_not_found', async () => {
		const { status, body, text } = await get('no-such-ticket-00000000');
		expect(status).toBe(404);
		expect(body).toMatchObject({ ok: false, failure: { type: 'ticket_not_found' } });
		expectSafe(text);
	});

	it('an unknown execution is a 404 not_found', async () => {
		const { status, body, text } = await get(MULTI, '?execution=9');
		expect(status).toBe(404);
		expect(body).toMatchObject({ ok: false, failure: { type: 'not_found', retryable: false } });
		expectSafe(text);
	});

	it.each([['0'], ['-1'], ['1.5'], ['abc'], [''], ['01'], ['99999999999999999999']])(
		'?execution=%s is a 400 invalid and reads nothing',
		async (value) => {
			const { status, body, cacheControl, requests } = await get(MULTI, `?execution=${value}`);
			expect(status).toBe(400);
			expect(cacheControl).toBe('no-store');
			expect(body).toEqual({
				ok: false,
				failure: {
					type: 'invalid',
					title: 'Invalid execution',
					detail: 'The execution must be a positive whole number.',
					retryable: false
				}
			});
			expect(requests).toHaveLength(0);
		}
	);

	it('ignores ?tab', async () => {
		const { status } = await get(MULTI, '?tab=nonsense');
		expect(status).toBe(200);
	});

	it('a runs failure is a failure, not a ticket with no runs', async () => {
		const { status, body, text } = await get(MULTI, '', {
			failRuns: { status: 500, title: 'Internal error', type: 'internal_error' }
		});
		expect(status).toBe(500);
		expect(body).toMatchObject({ ok: false, failure: { type: 'internal_error', retryable: true } });
		expectSafe(text);
	});

	it('the ticket read decides first', async () => {
		const { status, body } = await get('no-such-ticket-00000000', '', {
			failRuns: { status: 500, title: 'Internal error', type: 'internal_error' },
			failExecutions: { status: 500, title: 'Internal error', type: 'internal_error' }
		});
		expect(status).toBe(404);
		expect(body).toMatchObject({ ok: false, failure: { type: 'ticket_not_found' } });
	});

	it('never echoes an upstream body that breaks the contract', async () => {
		const { status, body, text } = await get(MULTI, '', {
			failDetail: {
				keys: [MULTI],
				problem: { status: 500, title: UPSTREAM, type: 'nonsense' } as never
			}
		});
		expect(status).toBe(502);
		expect(body).toMatchObject({ ok: false, failure: { type: 'contract_error' } });
		expectSafe(text);
	});

	it('contains a wrong token as a safe failure', async () => {
		process.env.FACTORY_API_TOKEN = 'not-the-token';
		const { status, body, text } = await get(MULTI);
		expect(status).toBe(401);
		expect(body).toMatchObject({ ok: false, failure: { type: 'unauthorized' } });
		expect(text).not.toContain('not-the-token');
		expectSafe(text);
	});

	it('contains missing configuration as a safe failure naming the variable', async () => {
		delete process.env.FACTORY_API_URL;
		const { status, body, text, requests } = await get(MULTI);
		expect(status).toBe(500);
		expect(body).toMatchObject({ ok: false, failure: { type: 'configuration_error' } });
		expect(text).toContain('FACTORY_API_URL');
		expect(text).not.toContain(FAKE_FACTORY_TOKEN);
		expect(requests).toHaveLength(0);
	});

	it('serialized success bodies have no token, factory URL or host', async () => {
		for (const search of ['', '?execution=1']) {
			const { text } = await get(MULTI, search);
			expectSafe(text);
		}
	});

	it('exports GET only', () => {
		expect(Object.keys(handlers)).toEqual(['GET']);
	});
});
