import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type APIResponse } from '@playwright/test';

import {
	runHistoryReviewChanges,
	runHistoryWorkInitial,
	runPageHistory
} from '../src/lib/factory/fixtures/runs.ts';
import { ticketDetailActiveInWork } from '../src/lib/factory/fixtures/tickets.ts';
import { FAKE_FACTORY_TOKEN, startFakeFactory, type FakeFactoryOptions } from './fake-factory';

// QA for ticket #27, task 01: the safe run endpoint and the widened ticket runs.
const SHOTS = process.env.QA_SCREENSHOTS;
const run = (id: string) => `/api/factory/runs/${encodeURIComponent(id)}`;
const SAFE_KEYS = ['type', 'title', 'detail', 'retryable'];

/** Asserts a body leaks no factory token, URL, host or raw upstream body. */
async function expectSafe(response: APIResponse, fakePort: number, token: string) {
	const text = await response.text();
	for (const secret of [token, `127.0.0.1:${fakePort}`, '127.0.0.1', 'localhost', 'Bearer']) {
		expect.soft(text).not.toContain(secret);
	}
	expect.soft(text).not.toContain('/v1/');
	const body = JSON.parse(text);
	if (body.ok === false) {
		// No raw upstream problem body: only the safe envelope and failure keys.
		expect.soft(Object.keys(body)).toEqual(['ok', 'failure']);
		expect.soft(Object.keys(body.failure).every((key) => SAFE_KEYS.includes(key))).toBe(true);
	}
	return body;
}

test('AC1: a run answers 200 with its validation checks and a review run with its findings', async ({
	request
}) => {
	const work = await request.get(run(runHistoryWorkInitial.id));
	expect(work.status()).toBe(200);
	const workBody = await work.json();
	expect(workBody.ok).toBe(true);
	expect(workBody.run.validation.checks.map((c: { name: string }) => c.name)).toEqual(
		runHistoryWorkInitial.validation.checks.map((c) => c.name)
	);
	expect(workBody.run.validation.checks.length).toBeGreaterThan(0);

	const review = await request.get(run(runHistoryReviewChanges.id));
	expect(review.status()).toBe(200);
	const reviewBody = await review.json();
	expect(reviewBody.run.review.findings.map((f: { id: string }) => f.id)).toEqual(
		runHistoryReviewChanges.review.findings.map((f) => f.id)
	);
	expect(reviewBody.run.review.findings.length).toBeGreaterThan(0);
});

test('AC2: an unknown run id answers 404 with a safe failure body', async ({ request }) => {
	const response = await request.get(run('run_qa_unknown_0000'));
	expect(response.status()).toBe(404);
	const body = await expectSafe(response, 7799, FAKE_FACTORY_TOKEN);
	expect(body).toMatchObject({ ok: false, failure: { type: 'not_found', retryable: false } });
	expect(Object.keys(body.failure).every((key) => SAFE_KEYS.includes(key))).toBe(true);
	expect(body.failure.detail ?? '').not.toContain('run_qa_unknown_0000/');
});

test('AC3: success and 404 run responses on the default fake leak no token, URL or host', async ({
	request
}) => {
	for (const id of [runHistoryWorkInitial.id, runHistoryReviewChanges.id, 'run_qa_unknown_0000']) {
		await expectSafe(await request.get(run(id)), 7799, FAKE_FACTORY_TOKEN);
	}
});

test('AC4: the history ticket lists runs with purpose, round, terminal kind, validation and review', async ({
	request
}) => {
	const response = await request.get(
		`/api/factory/tickets/${encodeURIComponent(ticketDetailActiveInWork.key)}`
	);
	expect(response.status()).toBe(200);
	const runs = (await response.json()).detail.runs as Record<string, unknown>[];
	expect(runs.map((r) => r.id)).toEqual(runPageHistory.items.map((r) => r.id));
	for (const r of runs) {
		expect
			.soft(Object.keys(r), String(r.id))
			.toEqual(
				expect.arrayContaining(['purpose', 'round', 'terminalKind', 'validationStatus', 'review'])
			);
	}
	expect(runs.map((r) => r.purpose)).toEqual(runPageHistory.items.map((r) => r.purpose));
	expect(runs.find((r) => r.id === 'run_hist_02_work_crashed')).toMatchObject({
		terminalKind: 'crashed'
	});
	expect(runs.find((r) => r.id === runHistoryWorkInitial.id)).toMatchObject({
		validationStatus: 'failed'
	});
	expect(runs.find((r) => r.id === runHistoryReviewChanges.id)).toMatchObject({
		round: 1,
		review: { verdict: 'changes_requested', findings: { total: 3, blocking: 2 } }
	});
});

test('AC8: /tickets/<key> still renders the history ticket and its runs', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const response = await page.goto(`/tickets/${encodeURIComponent(ticketDetailActiveInWork.key)}`);
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(ticketDetailActiveInWork.title);
	await expect(page.getByTestId('tasks')).toBeVisible();
	expect(errors).toEqual([]);
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/ac8-ticket-history.png`, fullPage: true });
});

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions, token: string) {
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, options));
		app = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(appPort),
				FACTORY_API_URL: `http://127.0.0.1:${fakePort}`,
				FACTORY_API_TOKEN: token
			},
			stdio: 'ignore'
		});
		await expect
			.poll(
				async () => {
					try {
						return (await fetch(`http://localhost:${appPort}/robots.txt`)).status > 0;
					} catch {
						return false;
					}
				},
				{ timeout: 30_000 }
			)
			.toBe(true);
	});
	test.afterAll(async () => {
		app?.kill();
		await new Promise((resolve) => fake?.close(resolve));
	});
	return `http://localhost:${appPort}`;
}

test.describe('AC2: the factory fails the run read', () => {
	const base = scenario(
		7891,
		4291,
		{
			failRun: {
				status: 503,
				title: 'Tracker unavailable',
				type: 'tracker_unavailable',
				detail: 'upstream-raw-marker'
			}
		},
		FAKE_FACTORY_TOKEN
	);
	test('AC2: an upstream failure answers its normalized status with a safe body', async ({
		request
	}) => {
		const response = await request.get(`${base}${run(runHistoryWorkInitial.id)}`);
		expect(response.status()).toBe(503);
		const body = await expectSafe(response, 7891, FAKE_FACTORY_TOKEN);
		expect(body).toMatchObject({
			ok: false,
			failure: { type: 'tracker_unavailable', retryable: true }
		});
		expect(body.run).toBeUndefined();
		expect(Object.keys(body.failure).every((key) => SAFE_KEYS.includes(key))).toBe(true);
	});
});

test.describe('AC3: the factory rejects the token', () => {
	const token = 'qa-27-01-wrong-token-secret';
	const base = scenario(7892, 4292, {}, token);
	test('AC3: a factory 401 on a run read leaks no token, URL or host', async ({ request }) => {
		const response = await request.get(`${base}${run(runHistoryWorkInitial.id)}`);
		expect(response.status()).toBeGreaterThanOrEqual(400);
		const body = await expectSafe(response, 7892, token);
		expect(body.ok).toBe(false);
		expect(Object.keys(body.failure).every((key) => SAFE_KEYS.includes(key))).toBe(true);
	});
});
