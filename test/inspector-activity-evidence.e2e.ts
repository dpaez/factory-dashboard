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

// Ticket #27, task 03: the Inspector's Activity and Evidence tabs, with `run` in the URL.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const KEY = ticketDetailActiveInWork.key;
const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const card = (page: Page, key: string) =>
	page.locator(`[data-slot="ticket-card"][data-ticket-key="${key}"]`);
const evidence = (page: Page) => inspector(page).locator('[data-slot="evidence-panel"]');
const runRow = (page: Page, id: string) => inspector(page).locator(`button[data-run="${id}"]`);
const board = (key: string, query = '') => `/?ticket=${encodeURIComponent(key)}${query}`;
const ticketPage = (key: string, query = '') => `/tickets/${encodeURIComponent(key)}${query}`;
const runPath = (id: string) => `/v1/runs/${encodeURIComponent(id)}`;
const latest = runPageHistory.items.reduce((a, b) => (b.sequence > a.sequence ? b : a));

async function factoryRequests(
	base = FAKE_FACTORY_URL
): Promise<{ method: string; path: string }[]> {
	return (await fetch(`${base}/__fake/requests`)).json();
}
const runReads = async (id: string) =>
	(await factoryRequests()).filter((request) => request.path === runPath(id)).length;

test('board: Activity shows grouped runs and the latest activity; a selected run goes in the URL; Back clears it', async ({
	page
}) => {
	await page.goto('/');
	await card(page, KEY).click();
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
	await inspector(page).getByRole('tab', { name: 'Activity' }).click();
	await expect(page).toHaveURL(board(KEY, '&tab=activity'));

	const groups = inspector(page).locator('[data-run-group]');
	await expect(groups).toHaveCount(3);
	await expect(inspector(page).getByRole('heading', { level: 4 })).toHaveText([
		'Ticket',
		'Task 01',
		'Task 02'
	]);
	const message = inspector(page).getByTestId('latest-activity');
	await expect(message).toContainText('Latest activity');
	await expect(message).toContainText(latest.activity!);
	// No selection, no evidence.
	await expect(evidence(page)).toHaveCount(0);

	const before = await runReads(runHistoryReviewChanges.id);
	await runRow(page, runHistoryReviewChanges.id).click();
	await expect(page).toHaveURL(
		board(KEY, `&tab=activity&run=${encodeURIComponent(runHistoryReviewChanges.id)}`)
	);
	await expect(runRow(page, runHistoryReviewChanges.id)).toHaveAttribute('aria-pressed', 'true');
	await expect(runRow(page, runHistoryReviewChanges.id)).toBeFocused();
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	await expect(evidence(page).locator('[data-finding]')).toHaveCount(3);
	await expect(evidence(page).locator('a')).toHaveCount(0);
	expect(await runReads(runHistoryReviewChanges.id)).toBe(before + 1);
	await shot(page, 'board-activity-selected-run');

	// Changing the tab keeps the run, and the cached run is not read again.
	await inspector(page).getByRole('tab', { name: 'Evidence' }).click();
	await expect(page).toHaveURL(
		board(KEY, `&tab=evidence&run=${encodeURIComponent(runHistoryReviewChanges.id)}`)
	);
	await expect(evidence(page).getByTestId('evidence-review')).toContainText('Changes requested');
	await expect(evidence(page).getByTestId('evidence-caption')).toHaveCount(0);
	expect(await runReads(runHistoryReviewChanges.id)).toBe(before + 1);

	// "Open ticket" carries the run.
	await expect(inspector(page).getByRole('link', { name: 'Open ticket' })).toHaveAttribute(
		'href',
		ticketPage(KEY, `?tab=evidence&run=${encodeURIComponent(runHistoryReviewChanges.id)}`)
	);

	await page.goBack();
	await page.goBack();
	await expect(page).toHaveURL(board(KEY, '&tab=activity'));
	await expect(evidence(page)).toHaveCount(0);
	await expect(inspector(page).locator('button[data-run][aria-pressed="true"]')).toHaveCount(0);
});

test('Tasks and Usage never read a run; Evidence without run shows the latest run', async ({
	page
}) => {
	const id = runHistoryWorkInitial.id;
	const before = await runReads(id);
	await page.goto(board(KEY, `&tab=usage&run=${encodeURIComponent(id)}`));
	await expect(inspector(page).getByTestId('usage-total')).toBeVisible();
	await inspector(page).getByRole('tab', { name: 'Tasks' }).click();
	await expect(page).toHaveURL(board(KEY, `&run=${encodeURIComponent(id)}`));
	await expect(inspector(page).getByTestId('tasks')).toBeVisible();
	await page.waitForTimeout(250);
	expect(await runReads(id)).toBe(before);

	await page.goto(board(KEY, '&tab=evidence'));
	await expect(evidence(page).getByTestId('evidence-caption')).toHaveText('Latest run');
	await expect(evidence(page)).toContainText(`#${latest.sequence}`);
});

test('/tickets/<key>?tab=evidence&run=<id> shows the failed validation checks', async ({
	page
}) => {
	const response = await page.goto(
		ticketPage(KEY, `?tab=evidence&run=${encodeURIComponent(runHistoryWorkInitial.id)}`)
	);
	expect(response?.status()).toBe(200);
	const validation = evidence(page).getByTestId('evidence-validation');
	await expect(validation).toContainText('Failed');
	await expect(validation.locator('[data-check]')).toHaveCount(
		runHistoryWorkInitial.validation.checks.length
	);
	await expect(validation.locator('[data-check="test"]')).toContainText('pnpm test');
	await expect(evidence(page).locator('a')).toHaveCount(0);
	await shot(page, 'ticket-page-evidence-failed');

	// Selecting another run on the ticket page pushes a history entry.
	await inspector(page).getByRole('tab', { name: 'Activity' }).click();
	await runRow(page, runHistoryReviewChanges.id).click();
	await expect(page).toHaveURL(
		ticketPage(KEY, `?tab=activity&run=${encodeURIComponent(runHistoryReviewChanges.id)}`)
	);
	await page.goBack();
	await expect(page).toHaveURL(
		ticketPage(KEY, `?tab=activity&run=${encodeURIComponent(runHistoryWorkInitial.id)}`)
	);
});

test('a run not in the execution is noted and never read', async ({ page }) => {
	const before = await runReads('run_elsewhere');
	await page.goto(board(KEY, '&tab=evidence&run=run_elsewhere'));
	await expect(inspector(page).getByTestId('run-unknown')).toContainText(
		'Run run_elsewhere is not in this execution'
	);
	await page.waitForTimeout(250);
	expect(await runReads('run_elsewhere')).toBe(before);
});

test('changing the execution or the ticket clears run; Close clears it too', async ({ page }) => {
	const multiRun = 'run_plan_passed';
	await page.goto(board(ticketDetailMultiExecution.key, `&tab=evidence&run=${multiRun}`));
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
	const link = inspector(page).getByTestId('executions').getByRole('link', { name: 'Execution 1' });
	await expect(link).toHaveAttribute(
		'href',
		board(ticketDetailMultiExecution.key, '&tab=evidence&execution=1')
	);

	await card(page, KEY).click();
	await expect(page).toHaveURL(board(KEY));

	await page.goto(board(KEY, `&tab=evidence&run=${runHistoryWorkInitial.id}`));
	await inspector(page).getByRole('button', { name: 'Close inspector' }).click();
	await expect(page).toHaveURL('/');

	// The ticket page's execution links drop the run.
	await page.goto(ticketPage(ticketDetailMultiExecution.key, `?tab=evidence&run=${multiRun}`));
	await expect(
		inspector(page).getByTestId('executions').getByRole('link', { name: 'Execution 1' })
	).toHaveAttribute(
		'href',
		ticketPage(ticketDetailMultiExecution.key, '?execution=1&tab=evidence')
	);
});

test('no token, URL or host in page data or run reads; the factory sees only GETs', async ({
	page
}) => {
	const reads: string[] = [];
	page.on('response', async (response) => {
		const path = new URL(response.url()).pathname;
		// The event stream never ends; its frames carry no state (test/live-updates.e2e.ts).
		if (path.startsWith('/api/factory/') && path !== '/api/factory/events') {
			reads.push(await response.text());
		}
	});
	const query = `?tab=evidence&run=${encodeURIComponent(runHistoryReviewChanges.id)}`;
	const response = await page.goto(ticketPage(KEY, query));
	const html = (await response?.text()) ?? '';
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	await page.goto(board(KEY, `&tab=evidence&run=${encodeURIComponent(runHistoryWorkInitial.id)}`));
	await expect(evidence(page)).toHaveAttribute('data-state', 'loaded');
	const data = await (await page.request.get(`${ticketPage(KEY)}/__data.json${query}`)).text();
	expect(reads.some((text) => text.includes('"run"'))).toBe(true);
	for (const text of [html, data, ...reads]) {
		expect(text).not.toContain(FAKE_FACTORY_TOKEN);
		expect(text).not.toContain(FAKE_FACTORY_URL);
		expect(text).not.toContain('127.0.0.1');
	}
	expect((await factoryRequests()).every((request) => request.method === 'GET')).toBe(true);
});

test.describe('the run read fails', () => {
	const fakePort = 7872;
	const appPort = 4272;
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, {
			failRun: { status: 500, title: 'Internal error', type: 'internal_error', detail: 'qa-27-03' }
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

	test('Evidence shows the error and Retry; the header, tabs, Tasks and Usage still render', async ({
		page
	}) => {
		const base = `http://localhost:${appPort}`;
		const id = runHistoryWorkInitial.id;
		await page.goto(`${base}${board(KEY, `&tab=evidence&run=${encodeURIComponent(id)}`)}`);
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		await expect(evidence(page)).toHaveAttribute('data-state', 'error');
		await expect(page.getByText('qa-27-03')).toHaveCount(0);
		const retry = evidence(page).getByRole('button', { name: 'Retry' });
		await expect(retry).toBeVisible();
		await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(
			ticketDetailActiveInWork.title
		);
		await expect(inspector(page).getByRole('tab')).toHaveCount(4);
		await shot(page, 'evidence-run-error');

		const reads = async () =>
			(await factoryRequests(`http://127.0.0.1:${fakePort}`)).filter(
				(request) => request.path === runPath(id)
			).length;
		const before = await reads();
		await retry.click();
		await expect.poll(reads).toBeGreaterThan(before);
		await expect(evidence(page)).toHaveAttribute('data-state', 'error');

		await inspector(page).getByRole('tab', { name: 'Tasks' }).click();
		await expect(inspector(page).getByTestId('tasks')).toBeVisible();
		await inspector(page).getByRole('tab', { name: 'Usage' }).click();
		await expect(inspector(page).getByTestId('usage-total')).toBeVisible();
	});
});
