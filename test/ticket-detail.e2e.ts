import { expect, test, type Page } from '@playwright/test';

import {
	runWrapupPrepared,
	runPageFirstExecution,
	executionList
} from '../src/lib/factory/fixtures/runs.ts';
import {
	ticketDetailActiveInQa,
	ticketDetailMultiExecution,
	ticketDetailMultiExecutionFirst
} from '../src/lib/factory/fixtures/tickets.ts';
import { FAKE_FACTORY_URL, ticketDetails } from './fake-factory';

const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const detailPath = (key: string) => `/tickets/${encodeURIComponent(key)}`;

async function factoryRequests(): Promise<{ method: string; path: string }[]> {
	return (await fetch(`${FAKE_FACTORY_URL}/__fake/requests`)).json();
}

test('a qa-stage ticket renders tasks, summaries, attention, usage, runs and executions', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const response = await page.goto(detailPath(ticketDetailActiveInQa.key));
	expect(response?.status()).toBe(200);

	await expect(page.getByRole('heading', { level: 2 })).toHaveText(ticketDetailActiveInQa.title);
	await expect(page.getByTestId('ticket-key')).toHaveText(ticketDetailActiveInQa.key);
	await expect(page.getByText(ticketDetailActiveInQa.displayRef)).toBeVisible();
	await expect(page.getByTestId('pull-request')).toHaveAttribute(
		'href',
		ticketDetailActiveInQa.pullRequest!.url
	);

	// The timeline knows QA: no "unrecognized stage".
	await expect(page.getByTestId('timeline')).toHaveAttribute('data-stage', 'qa');
	await expect(page.getByTestId('timeline')).toContainText('QA');
	await expect(page.getByText(/Unrecognized stage/)).toHaveCount(0);
	await expect(page.getByTestId('status-reason')).toHaveText(ticketDetailActiveInQa.statusReason);

	// Tasks: blocked-by lists only blockers that are not done; summaries per stage.
	const tasks = page.getByTestId('tasks');
	await expect(tasks.locator('[data-task="01"] [data-summary="review"]')).toHaveText(
		'review round 2 · approve · findings 2 · blocking 0'
	);
	await expect(tasks.locator('[data-task="01"] [data-summary="qa"]')).toHaveText(
		'QA round 1 · passed · tested 4 · gaps 1'
	);
	await expect(tasks.locator('[data-task="02"] [data-summary="review"]')).toHaveText(
		'review round 2 · changes requested · findings 3 · blocking 1'
	);
	await expect(tasks.locator('[data-task="02"] [data-testid="blocked-by"]')).toHaveCount(0);
	await expect(tasks.locator('[data-task="03"] [data-testid="blocked-by"]')).toHaveText(
		'blocked by 02'
	);
	await expect(tasks.locator('[data-task="02"] [data-signal]')).toHaveText('Active · QA');

	// Attention: the open request first, then the resolved one with its replies.
	const attention = page.getByTestId('attention');
	await expect(attention.locator('[data-attention]')).toHaveCount(2);
	await expect(attention.locator('[data-attention]').first()).toHaveAttribute(
		'data-attention',
		'att_11'
	);
	const resolved = attention.locator('[data-attention="att_10"]');
	await expect(resolved).toContainText('| reconnect after 30s    | pending |');
	await expect(resolved.locator('li')).toHaveCount(2);
	await expect(resolved.locator('li[data-reply-current="true"]')).toContainText(
		'Approved as written.'
	);
	await expect(resolved.locator('li[data-reply-current="true"]')).toContainText('cli');
	await expect(resolved.locator('li').first()).toContainText('dashboard (Diego)');

	await expect(page.getByTestId('executions')).toContainText('Execution 1');
	await expect(page.getByTestId('past-execution')).toHaveCount(0);

	// Usage: in the Usage tab; the execution total from the ticket, never summed from runs.
	await page.getByRole('tab', { name: 'Usage' }).click();
	await expect(page).toHaveURL(`${detailPath(ticketDetailActiveInQa.key)}?tab=usage`);
	await expect(page.getByTestId('usage-total')).toBeVisible();
	const usage = ticketDetails.get(ticketDetailActiveInQa.key)!.usage;
	await expect(page.getByTestId('usage-total')).toContainText(`$${usage.costUsd.toFixed(2)}`);

	// Runs: a run with null usage shows "—" for cost, not $0.00.
	const wrapup = page.locator(`[data-run="${runWrapupPrepared.id}"]`);
	await expect(wrapup.getByTestId('run-cost')).toHaveText('—');
	await expect(page.getByTestId('runs-table')).not.toContainText('$0.00');
	await shot(page, 'ticket-detail-qa');

	expect(errors).toEqual([]);
	expect((await factoryRequests()).every((request) => request.method === 'GET')).toBe(true);
});

test('?execution=1 shows the past execution read-only with a link to the current one', async ({
	page
}) => {
	const key = ticketDetailMultiExecution.key;
	await page.goto(detailPath(key));
	await expect(page.getByTestId('past-execution')).toHaveCount(0);

	// Follow the executions list link to execution 1.
	const executions = page.getByTestId('executions');
	await expect(executions.locator('[data-execution]')).toHaveCount(executionList.items.length);
	await executions.getByRole('link', { name: 'Execution 1' }).click();
	await expect(page).toHaveURL(`${detailPath(key)}?execution=1`);

	const banner = page.getByTestId('past-execution');
	await expect(banner).toContainText('Past execution 1, read-only.');
	await expect(page.getByTestId('tasks')).toContainText(
		ticketDetailMultiExecutionFirst.tasks[0]!.title
	);
	await page.getByRole('tab', { name: 'Usage' }).click();
	await expect(page).toHaveURL(`${detailPath(key)}?execution=1&tab=usage`);
	await expect(page.locator('[data-run]')).toHaveCount(runPageFirstExecution.items.length);
	await expect(page.getByTestId('usage-total')).toBeVisible();
	await expect(page.getByTestId('usage-total')).toContainText(
		`$${ticketDetailMultiExecutionFirst.usage.costUsd.toFixed(2)}`
	);
	await expect(executions.locator('[data-execution="1"]')).toHaveAttribute('data-selected', 'true');
	await shot(page, 'ticket-detail-past-execution');

	// The current-execution link keeps the tab.
	await banner.getByRole('link', { name: 'Go to the current execution' }).click();
	await expect(page).toHaveURL(`${detailPath(key)}?tab=usage`);
	await expect(page.getByTestId('past-execution')).toHaveCount(0);
});

test('an unknown ticket key or execution renders a 404 page', async ({ page }) => {
	const missing = await page.goto(detailPath('no-such-ticket-00000000'));
	expect(missing?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'No such ticket' })).toBeVisible();
	await shot(page, 'ticket-detail-404');

	const execution = await page.goto(`${detailPath(ticketDetailMultiExecution.key)}?execution=9`);
	expect(execution?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'No such execution' })).toBeVisible();

	const invalid = await page.goto(`${detailPath(ticketDetailMultiExecution.key)}?execution=abc`);
	expect(invalid?.status()).toBe(400);
	await expect(page.getByRole('heading', { name: 'The request is not valid' })).toBeVisible();
});
