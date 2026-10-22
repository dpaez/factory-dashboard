import { expect, test, type APIResponse } from '@playwright/test';

import {
	runHistoryReviewChanges,
	runHistoryWorkInitial,
	runPageHistory
} from '../src/lib/factory/fixtures/runs.ts';
import { ticketDetailActiveInWork } from '../src/lib/factory/fixtures/tickets.ts';

// The safe run detail endpoint against the built app and the fake factory.
const FAKE_FACTORY_TOKEN = 'fake-factory-token-e2e';
const run = (id: string) => `/api/factory/runs/${encodeURIComponent(id)}`;

async function safeBody(response: APIResponse) {
	const text = await response.text();
	for (const secret of [FAKE_FACTORY_TOKEN, '127.0.0.1', 'localhost', 'Bearer', '/v1/']) {
		expect.soft(text).not.toContain(secret);
	}
	return JSON.parse(text);
}

test('a run answers 200 with its validation checks', async ({ request }) => {
	const response = await request.get(run(runHistoryWorkInitial.id));
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe('no-store');
	const body = await safeBody(response);
	expect(body.ok).toBe(true);
	expect(body.run.validation.status).toBe('failed');
	expect(body.run.validation.checks.map((c: { name: string }) => c.name)).toEqual(
		runHistoryWorkInitial.validation.checks.map((c) => c.name)
	);
});

test('a review run answers 200 with its findings', async ({ request }) => {
	const body = await safeBody(await request.get(run(runHistoryReviewChanges.id)));
	expect(body.run.review.verdict).toBe('changes_requested');
	expect(body.run.review.findings.map((f: { id: string }) => f.id)).toEqual(
		runHistoryReviewChanges.review.findings.map((f) => f.id)
	);
});

test('an unknown run id answers 404 with a safe failure body', async ({ request }) => {
	const response = await request.get(run('run_does_not_exist'));
	expect(response.status()).toBe(404);
	const body = await safeBody(response);
	expect(body).toMatchObject({ ok: false, failure: { type: 'not_found', retryable: false } });
});

test('the history ticket lists runs with purpose, round, terminal kind, validation and review', async ({
	request
}) => {
	const response = await request.get(
		`/api/factory/tickets/${encodeURIComponent(ticketDetailActiveInWork.key)}`
	);
	expect(response.status()).toBe(200);
	const body = await safeBody(response);
	const runs = body.detail.runs as Record<string, unknown>[];
	expect(runs.map((r) => r.id)).toEqual(runPageHistory.items.map((r) => r.id));
	expect(runs.map((r) => r.purpose)).toEqual(runPageHistory.items.map((r) => r.purpose));
	expect(runs.find((r) => r.id === 'run_hist_02_work_crashed')).toMatchObject({
		terminalKind: 'crashed',
		outcome: 'retrying',
		usage: null
	});
	expect(runs.find((r) => r.id === runHistoryReviewChanges.id)).toMatchObject({
		round: 1,
		review: { verdict: 'changes_requested', findings: { total: 3, blocking: 2 } }
	});
	expect(runs.find((r) => r.id === runHistoryWorkInitial.id)).toMatchObject({
		validationStatus: 'failed'
	});
});
