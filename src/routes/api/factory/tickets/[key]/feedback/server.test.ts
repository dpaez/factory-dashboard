import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingFeedbackResult } from '$lib/factory/feedback';
import {
	pendingFeedback,
	pendingFeedbackMany,
	pendingFeedbackSkippedTruncated,
	problemCodeHostUnavailable,
	ticketDetailReadyForHandoff
} from '$lib/factory/fixtures';

import {
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	type FakeFactoryOptions
} from '../../../../../../../test/fake-factory';
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

const FACTORY_HOST = 'factory.feedback-handler-test.internal';
const FACTORY_URL = `http://${FACTORY_HOST}:7731`;
const UPSTREAM = 'upstream-secret-body-marker';
const KEY = ticketDetailReadyForHandoff.key;

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
});

async function get(key: string, options: FakeFactoryOptions = {}) {
	const fake = createFakeFactory(options);
	const url = new URL(
		`http://dashboard.test/api/factory/tickets/${encodeURIComponent(key)}/feedback`
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
		body: JSON.parse(text) as PendingFeedbackResult,
		requests: fake.requests
	};
}

function expectSafe(text: string) {
	expect(text).not.toContain(FAKE_FACTORY_TOKEN);
	expect(text).not.toContain(FACTORY_URL);
	expect(text).not.toContain(FACTORY_HOST);
	expect(text).not.toContain(UPSTREAM);
}

/** A failure body has only the safe envelope and failure fields: no raw upstream problem. */
function expectSafeFailure(body: unknown) {
	expect(Object.keys(body as object).sort()).toEqual(['failure', 'ok']);
	const { failure } = body as { failure: object };
	for (const key of Object.keys(failure)) {
		expect(['type', 'title', 'detail', 'retryable']).toContain(key);
	}
}

const problemNoOpenPullRequest = {
	status: 409,
	title: 'Invalid state',
	type: 'invalid_state',
	detail: `${ticketDetailReadyForHandoff.displayRef} has no open pull request.`
} as const;

describe('GET /api/factory/tickets/[key]/feedback', () => {
	it("answers the ticket's pending comments, skipped comments, pull request and truncation", async () => {
		const { status, body, text, cacheControl, requests } = await get(KEY);
		expect(status).toBe(200);
		expect(cacheControl).toBe('no-store');
		expect(body).toEqual({
			ok: true,
			candidates: pendingFeedback.candidates,
			pullRequestUrl: ticketDetailReadyForHandoff.pullRequest.url,
			skipped: [],
			ticket: KEY,
			truncated: false
		});
		expect(requests).toEqual([{ method: 'GET', path: `/v1/tickets/${KEY}/feedback` }]);
		expectSafe(text);
	});

	it('keeps every candidate field: ref, kind, author, location, summary and url', async () => {
		const { body } = await get(KEY);
		if (!body.ok) throw new Error('expected pending feedback');
		expect(body.candidates.map((c) => c.kind)).toEqual(['thread', 'review', 'comment']);
		expect(body.candidates[0]).toEqual({
			author: 'coderabbitai',
			kind: 'thread',
			location: 'src/lib/factory/ticket-actions.ts:42',
			ref: 'r2841017733',
			summary: 'Consider guarding the action when the pull request is closed.',
			url: 'https://github.com/dpaez/factory-dashboard/pull/42#discussion_r2841017733'
		});
	});

	it('answers skipped authors and truncation as the factory sends them', async () => {
		const { status, body } = await get(KEY, { pendingFeedbackCohort: 'skippedTruncated' });
		expect(status).toBe(200);
		expect(body).toMatchObject({
			ok: true,
			skipped: pendingFeedbackSkippedTruncated.skipped,
			truncated: true
		});
	});

	it('answers every one of many candidates', async () => {
		const { body } = await get(KEY, { pendingFeedbackCohort: 'many' });
		expect(body).toMatchObject({ ok: true, candidates: pendingFeedbackMany.candidates });
	});

	it('answers an empty list when nothing is pending', async () => {
		const { status, body } = await get(KEY, { pendingFeedbackCohort: 'none' });
		expect(status).toBe(200);
		expect(body).toMatchObject({ ok: true, candidates: [] });
	});

	it.each([
		[problemNoOpenPullRequest, 409, false],
		[problemCodeHostUnavailable, 502, true]
	] as const)(
		'a factory $type refusal keeps its status, title and detail',
		async (problem, status, retryable) => {
			const {
				status: answered,
				body,
				text,
				cacheControl
			} = await get(KEY, {
				failPendingFeedback: problem
			});
			expect(answered).toBe(status);
			expect(cacheControl).toBe('no-store');
			expect(body).toEqual({
				ok: false,
				failure: { type: problem.type, title: problem.title, detail: problem.detail, retryable }
			});
			expectSafeFailure(body);
			expectSafe(text);
		}
	);

	it('an unknown key is a 404 ticket_not_found with its detail', async () => {
		const { status, body, text } = await get('no-such-ticket-00000000');
		expect(status).toBe(404);
		expect(body).toEqual({
			ok: false,
			failure: {
				type: 'ticket_not_found',
				title: 'Ticket not found',
				detail: 'No ticket has the key no-such-ticket-00000000.',
				retryable: false
			}
		});
		expectSafe(text);
	});

	it('never echoes an upstream body that breaks the contract', async () => {
		const { status, body, text } = await get(KEY, {
			failPendingFeedback: { status: 500, title: UPSTREAM, type: 'nonsense' } as never
		});
		expect(status).toBe(502);
		expect(body).toMatchObject({ ok: false, failure: { type: 'contract_error' } });
		expectSafeFailure(body);
		expectSafe(text);
	});

	it('contains a wrong token as a safe failure', async () => {
		process.env.FACTORY_API_TOKEN = 'not-the-token';
		const { status, body, text } = await get(KEY);
		expect(status).toBe(401);
		expect(body).toMatchObject({ ok: false, failure: { type: 'unauthorized' } });
		expect(text).not.toContain('not-the-token');
		expectSafe(text);
	});

	it('contains missing configuration as a safe failure naming the variable', async () => {
		delete process.env.FACTORY_API_URL;
		const { status, body, text, requests } = await get(KEY);
		expect(status).toBe(500);
		expect(body).toMatchObject({ ok: false, failure: { type: 'configuration_error' } });
		expect(text).toContain('FACTORY_API_URL');
		expect(requests).toHaveLength(0);
	});

	it('contains an unreachable factory as a retryable network failure', async () => {
		const url = new URL(`http://dashboard.test/api/factory/tickets/${KEY}/feedback`);
		const fetch = () => Promise.reject(new TypeError(`connect ECONNREFUSED ${FACTORY_URL}`));
		const event = { fetch, params: { key: KEY }, url } as unknown as Parameters<
			typeof handlers.GET
		>[0];
		const response = await handlers.GET(event);
		const text = await response.text();
		expect(response.status).toBe(502);
		expect(JSON.parse(text)).toMatchObject({
			ok: false,
			failure: { type: 'network_error', retryable: true }
		});
		expectSafe(text);
	});

	it('exports GET only', () => {
		expect(Object.keys(handlers)).toEqual(['GET']);
	});
});
