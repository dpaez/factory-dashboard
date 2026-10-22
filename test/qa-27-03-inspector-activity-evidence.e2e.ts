import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	runHistoryReviewChanges,
	runHistoryWorkInitial,
	runPageHistory
} from '../src/lib/factory/fixtures/runs.ts';
import {
	ticketDetailActiveInWork,
	ticketDetailMultiExecution
} from '../src/lib/factory/fixtures/tickets.ts';
import { FAKE_FACTORY_TOKEN, FAKE_FACTORY_URL, startFakeFactory } from './fake-factory';

// QA for ticket #27, task 03: the Inspector's Activity and Evidence tabs, with `run` in the URL.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const KEY = ticketDetailActiveInWork.key;
const REVIEW = runHistoryReviewChanges.id;
const FAILED = runHistoryWorkInitial.id;
const latest = runPageHistory.items.reduce((a, b) => (b.sequence > a.sequence ? b : a));
const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const evidence = (page: Page) => inspector(page).locator('[data-slot="evidence-panel"]');
const runButton = (page: Page, id: string) => inspector(page).locator(`button[data-run="${id}"]`);
const tab = (page: Page, name: string) => inspector(page).getByRole('tab', { name });

/** Count the browser's run reads, per run id, through the app's run endpoint. */
const watchRunReads = (page: Page) => {
	const reads: string[] = [];
	page.on('request', (request) => {
		const path = new URL(request.url()).pathname;
		if (path.startsWith('/api/factory/runs/'))
			reads.push(decodeURIComponent(path.split('/').pop()!));
	});
	return (id?: string) => (id ? reads.filter((r) => r === id).length : reads.length);
};

test('AC1: the board Activity tab groups runs by task and stage and shows the latest activity', async ({
	page
}) => {
	await page.goto(`/?ticket=${encodeURIComponent(KEY)}`);
	await tab(page, 'Activity').click();
	await expect(page).toHaveURL(/tab=activity/);
	await expect(inspector(page).getByRole('heading', { level: 4 })).toHaveText([
		'Ticket',
		'Task 01',
		'Task 02'
	]);
	const task01 = inspector(page)
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Task 01' }) });
	await expect(task01.getByRole('heading', { level: 5 })).toHaveText([/work/i, /review/i]);
	const message = inspector(page).getByTestId('latest-activity');
	await expect(message).toContainText('Latest activity');
	await expect(message).toContainText(latest.activity!);
	await shot(page, 'ac1-board-activity');
});

test('AC2: selecting a run puts run=<id> in the URL and shows its evidence; Back removes it', async ({
	page
}) => {
	await page.goto(`/?ticket=${encodeURIComponent(KEY)}&tab=activity`);
	await expect(evidence(page)).toHaveCount(0);
	await runButton(page, REVIEW).click();
	await expect(page).toHaveURL(new RegExp(`[?&]run=${REVIEW}(&|$)`));
	await expect(evidence(page).getByTestId('evidence-review')).toContainText('Changes requested');
	await shot(page, 'ac2-activity-selected-run');
	await page.goBack();
	await expect(page).not.toHaveURL(/[?&]run=/);
	await expect(evidence(page)).toHaveCount(0);
});

test('AC3: the ticket page Evidence shows the selected run checks, or the latest run labelled', async ({
	page
}) => {
	await page.goto(`/tickets/${encodeURIComponent(KEY)}?tab=evidence&run=${FAILED}`);
	const validation = evidence(page).getByTestId('evidence-validation');
	await expect(validation).toContainText('Failed');
	const checks = validation.getByRole('group', { name: 'Validation checks' }).getByRole('row');
	// Header row plus one row per check.
	await expect(checks).toHaveCount(runHistoryWorkInitial.validation.checks.length + 1);
	for (const check of runHistoryWorkInitial.validation.checks) {
		await expect(validation).toContainText(check.name);
	}
	await shot(page, 'ac3-ticket-evidence-selected');

	await page.goto(`/tickets/${encodeURIComponent(KEY)}?tab=evidence`);
	await expect(evidence(page).getByTestId('evidence-caption')).toHaveText('Latest run');
	await expect(evidence(page)).toContainText(`#${latest.sequence}`);
	await shot(page, 'ac3-ticket-evidence-latest');
});

test('AC4: changes_requested findings show number, severity and location as text', async ({
	page
}) => {
	await page.goto(`/?ticket=${encodeURIComponent(KEY)}&tab=evidence&run=${REVIEW}`);
	const review = evidence(page).getByTestId('evidence-review');
	await expect(review).toContainText('Changes requested');
	const findings = runHistoryReviewChanges.review.findings;
	await expect(review.locator('[data-finding]')).toHaveCount(findings.length);
	for (const finding of findings) {
		const item = review.locator(`[data-finding="${finding.id}"]`);
		await expect.soft(item).toContainText(`${finding.number}. ${finding.id}`);
		await expect.soft(item).toContainText(new RegExp(finding.severity, 'i'));
		if (finding.location) await expect.soft(item).toContainText(finding.location);
	}
	await shot(page, 'ac4-evidence-findings');
});

test('AC5: runs are read only for an Activity selection or Evidence, and once per run', async ({
	page
}) => {
	const reads = watchRunReads(page);
	await page.goto(`/?ticket=${encodeURIComponent(KEY)}&tab=activity`);
	await expect(inspector(page).getByTestId('latest-activity')).toBeVisible();
	await tab(page, 'Tasks').click();
	await tab(page, 'Usage').click();
	await expect(inspector(page).getByTestId('usage-total')).toBeVisible();
	await page.waitForTimeout(300);
	expect(reads()).toBe(0);

	await tab(page, 'Activity').click();
	await runButton(page, REVIEW).click();
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	expect(reads(REVIEW)).toBe(1);

	// Another run, then back to the first: no second read.
	await runButton(page, FAILED).click();
	await expect(evidence(page).getByTestId('evidence-validation')).toContainText('Failed');
	await runButton(page, REVIEW).click();
	await tab(page, 'Evidence').click();
	await expect(evidence(page).getByTestId('evidence-review')).toContainText('Changes requested');
	await page.waitForTimeout(300);
	expect(reads(REVIEW)).toBe(1);
	expect(reads(FAILED)).toBe(1);
});

test('AC7: changing the tab keeps run; changing the execution or the ticket clears it', async ({
	page
}) => {
	await page.goto(`/?ticket=${encodeURIComponent(KEY)}&tab=activity&run=${REVIEW}`);
	await tab(page, 'Evidence').click();
	await expect(page).toHaveURL(
		new RegExp(`tab=evidence.*run=${REVIEW}|run=${REVIEW}.*tab=evidence`)
	);
	await tab(page, 'Tasks').click();
	await expect(page).toHaveURL(new RegExp(`run=${REVIEW}`));

	// Selecting another ticket on the board clears run.
	await page.locator(`[data-ticket-key="${ticketDetailMultiExecution.key}"]`).first().click();
	await expect(page).toHaveURL(
		new RegExp(`ticket=${encodeURIComponent(ticketDetailMultiExecution.key)}`)
	);
	await expect(page).not.toHaveURL(/[?&]run=/);

	// Changing the execution clears run.
	await page.goto(
		`/?ticket=${encodeURIComponent(ticketDetailMultiExecution.key)}&tab=evidence&run=run_plan_passed`
	);
	await inspector(page)
		.getByTestId('executions')
		.getByRole('link', { name: 'Execution 1' })
		.click();
	await expect(page).toHaveURL(/execution=1/);
	await expect(page).not.toHaveURL(/[?&]run=/);
});

test('AC8: no token, URL or host reaches the browser; the factory sees only GETs', async ({
	page
}) => {
	const bodies: string[] = [];
	page.on('response', async (response) => {
		const type = response.headers()['content-type'] ?? '';
		if (/json|html|javascript|text/.test(type)) bodies.push(await response.text().catch(() => ''));
	});
	const first = await page.goto(`/tickets/${encodeURIComponent(KEY)}?tab=evidence&run=${REVIEW}`);
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	await page.goto(`/?ticket=${encodeURIComponent(KEY)}&tab=activity&run=${FAILED}`);
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	bodies.push((await first?.text()) ?? '');
	expect(bodies.length).toBeGreaterThan(2);
	for (const body of bodies) {
		expect(body).not.toContain(FAKE_FACTORY_TOKEN);
		expect(body).not.toContain(FAKE_FACTORY_URL);
		expect(body).not.toContain('127.0.0.1:7799');
	}
	const requests: { method: string }[] = await (
		await fetch(`${FAKE_FACTORY_URL}/__fake/requests`)
	).json();
	expect(requests.length).toBeGreaterThan(0);
	expect(requests.every((request) => request.method === 'GET')).toBe(true);
});

test.describe('AC6: the run read fails', () => {
	const fakePort = 7873;
	const appPort = 4273;
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, {
			failRun: { status: 500, title: 'Internal error', type: 'internal_error', detail: 'qa-ac6' }
		}));
		app = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(appPort),
				FACTORY_API_URL: `http://127.0.0.1:${fakePort}`,
				FACTORY_API_TOKEN: FAKE_FACTORY_TOKEN
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

	test('AC6: Evidence shows the error and Retry; header, tabs, Tasks and Usage still render', async ({
		page
	}) => {
		await page.goto(
			`http://localhost:${appPort}/tickets/${encodeURIComponent(KEY)}?tab=evidence&run=${FAILED}`
		);
		await expect(evidence(page).getByRole('button', { name: 'Retry' })).toBeVisible();
		await expect(evidence(page)).toHaveAttribute('data-state', 'error');
		await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(
			ticketDetailActiveInWork.title
		);
		await expect(inspector(page).getByRole('tab')).toHaveText([
			'Tasks',
			'Activity',
			'Evidence',
			'Usage'
		]);
		await shot(page, 'ac6-evidence-run-error');
		await tab(page, 'Tasks').click();
		await expect(inspector(page).getByTestId('tasks')).toBeVisible();
		await tab(page, 'Usage').click();
		await expect(inspector(page).getByTestId('usage-total')).toBeVisible();
	});
});
