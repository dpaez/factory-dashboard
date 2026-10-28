import type { Page } from '@playwright/test';

import {
	runHistoryReviewChanges,
	runHistoryWorkInitial,
	runPageHistory
} from '../src/lib/factory/fixtures/runs.ts';
import {
	ticketDetailActiveInWork,
	ticketDetailMultiExecution
} from '../src/lib/factory/fixtures/tickets.ts';
import { expect, test, type FakeFixture } from './fixtures.ts';

// The Inspector's Activity and Evidence tabs, with `run` in the URL: runs
// grouped by task and stage, the latest activity, a selected run's validation
// and review evidence, when runs are read, and a failing run read.

const KEY = ticketDetailActiveInWork.key;
const MULTI = ticketDetailMultiExecution.key;
const REVIEW = runHistoryReviewChanges.id;
const FAILED = runHistoryWorkInitial.id;
const latest = runPageHistory.items.reduce((a, b) => (b.sequence > a.sequence ? b : a));

const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const card = (page: Page, key: string) =>
	page.locator(`[data-slot="ticket-card"][data-ticket-key="${key}"]`);
const evidence = (page: Page) => inspector(page).locator('[data-slot="evidence-panel"]');
const runRow = (page: Page, id: string) => inspector(page).locator(`button[data-run="${id}"]`);
const tab = (page: Page, name: string) => inspector(page).getByRole('tab', { name });
const board = (key: string, query = '') => `/?ticket=${encodeURIComponent(key)}${query}`;
const ticketPage = (key: string, query = '') => `/tickets/${encodeURIComponent(key)}${query}`;
const runPath = (id: string) => `/v1/runs/${encodeURIComponent(id)}`;
/** How many times the fake factory was asked for this run. */
const runReads = (fake: FakeFixture, id: string) =>
	fake.requests().filter((request) => request.path === runPath(id)).length;

test('board: Activity groups runs by task and stage with the latest activity; a selected run goes in the URL; Back clears it', async ({
	page,
	fake,
	shot
}) => {
	await page.goto('/');
	await card(page, KEY).click();
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
	await tab(page, 'Activity').click();
	await expect(page).toHaveURL(board(KEY, '&tab=activity'));

	await expect(inspector(page).locator('[data-run-group]')).toHaveCount(3);
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
	// No selection, no evidence.
	await expect(evidence(page)).toHaveCount(0);
	await shot('run-evidence-board-activity');

	await runRow(page, REVIEW).click();
	await expect(page).toHaveURL(board(KEY, `&tab=activity&run=${encodeURIComponent(REVIEW)}`));
	await expect(runRow(page, REVIEW)).toHaveAttribute('aria-pressed', 'true');
	await expect(runRow(page, REVIEW)).toBeFocused();
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	await expect(evidence(page).getByTestId('evidence-review')).toContainText('Changes requested');
	await expect(evidence(page).locator('[data-finding]')).toHaveCount(3);
	await expect(evidence(page).locator('a')).toHaveCount(0);
	expect(runReads(fake, REVIEW)).toBe(1);
	await shot('run-evidence-board-selected-run');

	// Changing the tab keeps the run, and the cached run is not read again.
	await tab(page, 'Evidence').click();
	await expect(page).toHaveURL(board(KEY, `&tab=evidence&run=${encodeURIComponent(REVIEW)}`));
	await expect(evidence(page).getByTestId('evidence-review')).toContainText('Changes requested');
	await expect(evidence(page).getByTestId('evidence-caption')).toHaveCount(0);
	expect(runReads(fake, REVIEW)).toBe(1);

	// "Open ticket" carries the run.
	await expect(inspector(page).getByRole('link', { name: 'Open ticket' })).toHaveAttribute(
		'href',
		ticketPage(KEY, `?tab=evidence&run=${encodeURIComponent(REVIEW)}`)
	);
	await tab(page, 'Tasks').click();
	await expect(page).toHaveURL(board(KEY, `&run=${encodeURIComponent(REVIEW)}`));

	await page.goBack();
	await page.goBack();
	await page.goBack();
	await expect(page).toHaveURL(board(KEY, '&tab=activity'));
	await expect(evidence(page)).toHaveCount(0);
	await expect(inspector(page).locator('button[data-run][aria-pressed="true"]')).toHaveCount(0);
});

test('runs are read only for an Activity selection or Evidence, and once per run', async ({
	page,
	fake
}) => {
	// Tasks and Usage never read the run in the URL.
	await page.goto(board(KEY, `&tab=usage&run=${encodeURIComponent(FAILED)}`));
	await expect(inspector(page).getByTestId('usage-total')).toBeVisible();
	await tab(page, 'Tasks').click();
	await expect(page).toHaveURL(board(KEY, `&run=${encodeURIComponent(FAILED)}`));
	await expect(inspector(page).getByTestId('tasks')).toBeVisible();
	// Nor does Activity without a selection.
	await page.goto(board(KEY, '&tab=activity'));
	await expect(inspector(page).getByTestId('latest-activity')).toBeVisible();
	await page.waitForTimeout(300);
	expect(fake.requests().filter((request) => request.path.startsWith('/v1/runs/'))).toEqual([]);

	await runRow(page, REVIEW).click();
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	expect(runReads(fake, REVIEW)).toBe(1);

	// Another run, then back to the first: no second read.
	await runRow(page, FAILED).click();
	await expect(evidence(page).getByTestId('evidence-validation')).toContainText('Failed');
	await runRow(page, REVIEW).click();
	await tab(page, 'Evidence').click();
	await expect(evidence(page).getByTestId('evidence-review')).toContainText('Changes requested');
	await page.waitForTimeout(300);
	expect(runReads(fake, REVIEW)).toBe(1);
	expect(runReads(fake, FAILED)).toBe(1);
});

test('a run not in the execution is noted and never read', async ({ page, fake }) => {
	await page.goto(board(KEY, '&tab=evidence&run=run_elsewhere'));
	await expect(inspector(page).getByTestId('run-unknown')).toContainText(
		'Run run_elsewhere is not in this execution'
	);
	await page.waitForTimeout(250);
	expect(runReads(fake, 'run_elsewhere')).toBe(0);
});

test('ticket page Evidence shows the selected run: failed validation checks, or review findings', async ({
	page,
	shot
}) => {
	const response = await page.goto(
		ticketPage(KEY, `?tab=evidence&run=${encodeURIComponent(FAILED)}`)
	);
	expect(response?.status()).toBe(200);
	const validation = evidence(page).getByTestId('evidence-validation');
	await expect(validation).toContainText('Failed');
	await expect(validation.locator('[data-check]')).toHaveCount(
		runHistoryWorkInitial.validation.checks.length
	);
	const rows = validation.getByRole('group', { name: 'Validation checks' }).getByRole('row');
	// Header row plus one row per check.
	await expect(rows).toHaveCount(runHistoryWorkInitial.validation.checks.length + 1);
	for (const check of runHistoryWorkInitial.validation.checks) {
		await expect(validation).toContainText(check.name);
	}
	await expect(validation.locator('[data-check="test"]')).toContainText('pnpm test');
	await expect(evidence(page).locator('a')).toHaveCount(0);
	await shot('run-evidence-ticket-page-failed-checks');

	// Selecting another run on the ticket page pushes a history entry.
	await tab(page, 'Activity').click();
	await runRow(page, REVIEW).click();
	await expect(page).toHaveURL(ticketPage(KEY, `?tab=activity&run=${encodeURIComponent(REVIEW)}`));
	await tab(page, 'Evidence').click();
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
	await expect(evidence(page).locator('a')).toHaveCount(0);
	await shot('run-evidence-findings');

	await page.goBack();
	await page.goBack();
	await expect(page).toHaveURL(ticketPage(KEY, `?tab=activity&run=${encodeURIComponent(FAILED)}`));
});

test('Evidence without a run shows the latest run, labelled', async ({ page }) => {
	for (const path of [board(KEY, '&tab=evidence'), ticketPage(KEY, '?tab=evidence')]) {
		await page.goto(path);
		await expect(evidence(page).getByTestId('evidence-caption')).toHaveText('Latest run');
		await expect(evidence(page)).toContainText(`#${latest.sequence}`);
	}
});

test('changing the execution or the ticket clears run; Close clears it too', async ({ page }) => {
	// Another ticket on the board.
	await page.goto(board(KEY, `&tab=evidence&run=${encodeURIComponent(REVIEW)}`));
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	await card(page, MULTI).click();
	await expect(page).toHaveURL(board(MULTI));

	// The board's execution links drop the run, and following one clears it.
	await page.goto(board(MULTI, '&tab=evidence&run=run_plan_passed'));
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
	const link = inspector(page).getByTestId('executions').getByRole('link', { name: 'Execution 1' });
	await expect(link).toHaveAttribute('href', board(MULTI, '&tab=evidence&execution=1'));
	await link.click();
	await expect(page).toHaveURL(board(MULTI, '&tab=evidence&execution=1'));

	// Close.
	await page.goto(board(KEY, `&tab=evidence&run=${encodeURIComponent(FAILED)}`));
	await inspector(page).getByRole('button', { name: 'Close inspector' }).click();
	await expect(page).toHaveURL('/');

	// The ticket page's execution links drop the run.
	await page.goto(ticketPage(MULTI, '?tab=evidence&run=run_plan_passed'));
	await expect(
		inspector(page).getByTestId('executions').getByRole('link', { name: 'Execution 1' })
	).toHaveAttribute('href', ticketPage(MULTI, '?execution=1&tab=evidence'));
});

test('no token, factory URL or host in page data or run reads; the factory sees only GETs', async ({
	page,
	fake
}) => {
	const reads: string[] = [];
	page.on('response', async (response) => {
		const path = new URL(response.url()).pathname;
		// The event stream never ends; its frames carry no state (live-connection.e2e.ts).
		if (path.startsWith('/api/factory/') && path !== '/api/factory/events') {
			reads.push(await response.text());
		}
	});
	const query = `?tab=evidence&run=${encodeURIComponent(REVIEW)}`;
	const response = await page.goto(ticketPage(KEY, query));
	const html = (await response?.text()) ?? '';
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	await page.goto(board(KEY, `&tab=evidence&run=${encodeURIComponent(FAILED)}`));
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	const data = await (await page.request.get(`${ticketPage(KEY)}/__data.json${query}`)).text();
	expect(reads.some((text) => text.includes('"run"'))).toBe(true);
	for (const text of [html, data, ...reads]) {
		expect(text).not.toContain(fake.token);
		expect(text).not.toContain(fake.url);
		expect(text).not.toContain(new URL(fake.url).host);
	}
	expect(fake.requests().length).toBeGreaterThan(0);
	expect(fake.requests().every((request) => request.method === 'GET')).toBe(true);
});

test.describe('the run read fails', () => {
	test.use({
		fakeOptions: {
			failRun: {
				status: 500,
				title: 'Internal error',
				type: 'internal_error',
				detail: 'run-read-problem-detail'
			}
		}
	});

	for (const [placement, path] of [
		['board', board(KEY, `&tab=evidence&run=${encodeURIComponent(FAILED)}`)],
		['ticket page', ticketPage(KEY, `?tab=evidence&run=${encodeURIComponent(FAILED)}`)]
	] as const) {
		test(`${placement}: Evidence shows the error and Retry; the header, tabs, Tasks and Usage still render`, async ({
			page,
			fake,
			shot
		}) => {
			await page.goto(path);
			await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
			await expect(evidence(page)).toHaveAttribute('data-state', 'error');
			await expect(page.getByText('run-read-problem-detail')).toHaveCount(0);
			const retry = evidence(page).getByRole('button', { name: 'Retry' });
			await expect(retry).toBeVisible();
			await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(
				ticketDetailActiveInWork.title
			);
			await expect(inspector(page).getByRole('tab')).toHaveText([
				'Tasks',
				'Activity',
				'Evidence',
				'Usage'
			]);
			await shot(`run-evidence-error-${placement.replace(' ', '-')}`);

			const before = runReads(fake, FAILED);
			await retry.click();
			await expect.poll(() => runReads(fake, FAILED)).toBeGreaterThan(before);
			await expect(evidence(page)).toHaveAttribute('data-state', 'error');

			await tab(page, 'Tasks').click();
			await expect(inspector(page).getByTestId('tasks')).toBeVisible();
			await tab(page, 'Usage').click();
			await expect(inspector(page).getByTestId('usage-total')).toBeVisible();
		});
	}
});
