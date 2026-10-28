import {
	executionList,
	runPageFirstExecution,
	runWrapupPrepared
} from '../src/lib/factory/fixtures/runs.ts';
import {
	ticketDetailActiveInQa,
	ticketDetailActiveInWork,
	ticketDetailMultiExecution,
	ticketDetailMultiExecutionFirst
} from '../src/lib/factory/fixtures/tickets.ts';
import { ticketDetails } from './fake-factory.ts';
import { expect, test } from './fixtures.ts';

// The ticket page at /tickets/[key]: what it shows for the current and a past
// execution, its 404s, and the configuration error when the factory refuses
// the dashboard. The Inspector's tabs and URL behaviour are in inspector.e2e.ts,
// its runs and evidence in run-evidence.e2e.ts, and its commands in commands.e2e.ts.

const detailPath = (key: string) => `/tickets/${encodeURIComponent(key)}`;
const CONFIG_ERROR = /cannot reach the factory with its configuration/;

test('a qa-stage ticket shows tasks, summaries, attention, usage, runs and executions', async ({
	page,
	fake,
	shot
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
	await expect(page.getByText(/Unrecognized stage/i)).toHaveCount(0);
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
	const usage = ticketDetails.get(ticketDetailActiveInQa.key)!.usage;
	await expect(page.getByTestId('usage-total')).toContainText(`$${usage.costUsd.toFixed(2)}`);

	// Runs: a run with null usage shows "—" for cost, not $0.00.
	await expect(page.getByTestId('runs-table')).toBeVisible();
	const wrapup = page.locator(`[data-run="${runWrapupPrepared.id}"]`);
	await expect(wrapup.getByTestId('run-cost')).toHaveText('—');
	await expect(page.getByTestId('runs-table')).not.toContainText('$0.00');
	await shot('ticket-page-qa');

	expect(errors).toEqual([]);
	expect(fake.requests().every((request) => request.method === 'GET')).toBe(true);
});

test('?execution=1 shows the past execution read-only with a link to the current one', async ({
	page,
	shot
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
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(
		ticketDetailMultiExecutionFirst.title
	);
	await expect(page.getByTestId('timeline')).toHaveAttribute('data-stage', 'done');
	await expect(page.getByTestId('tasks')).toContainText(
		ticketDetailMultiExecutionFirst.tasks[0]!.title
	);
	await page.getByRole('tab', { name: 'Usage' }).click();
	await expect(page).toHaveURL(`${detailPath(key)}?execution=1&tab=usage`);
	await expect(page.locator('[data-run]')).toHaveCount(runPageFirstExecution.items.length);
	await expect(page.getByTestId('usage-total')).toContainText(
		`$${ticketDetailMultiExecutionFirst.usage.costUsd.toFixed(2)}`
	);
	await expect(executions.locator('[data-execution="1"]')).toHaveAttribute('data-selected', 'true');
	await shot('ticket-page-past-execution');

	// The current-execution link keeps the tab.
	await banner.getByRole('link', { name: 'Go to the current execution' }).click();
	await expect(page).toHaveURL(`${detailPath(key)}?tab=usage`);
	await expect(page.getByTestId('past-execution')).toHaveCount(0);
});

test('an unknown ticket key or execution renders a 404 page; an invalid execution a 400', async ({
	page,
	shot
}) => {
	const missing = await page.goto(detailPath('no-such-ticket-00000000'));
	expect(missing?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'No such ticket' })).toBeVisible();
	await shot('ticket-page-404');

	const execution = await page.goto(`${detailPath(ticketDetailMultiExecution.key)}?execution=9`);
	expect(execution?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'No such execution' })).toBeVisible();

	const invalid = await page.goto(`${detailPath(ticketDetailMultiExecution.key)}?execution=abc`);
	expect(invalid?.status()).toBe(400);
	await expect(page.getByRole('heading', { name: 'The request is not valid' })).toBeVisible();
});

// The fixture's tasks cover every API task status; the chip comes straight from `{status, stage}`.
const TASK_CHIPS: Record<string, [string, string]> = {
	'01': ['Done', 'clear'],
	'02': ['Active · review', 'run'],
	'03': ['Pending', 'standby'],
	'04': ['Blocked · QA', 'fault'],
	'05': ['Cancelled · work', 'standby']
};

test('the run-history ticket renders, with every API task status as a chip of the right tone', async ({
	page,
	shot
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const response = await page.goto(detailPath(ticketDetailActiveInWork.key));
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(ticketDetailActiveInWork.title);
	expect(ticketDetailActiveInWork.tasks.map((task) => task.id)).toEqual(Object.keys(TASK_CHIPS));
	for (const task of ticketDetailActiveInWork.tasks) {
		const [label, signal] = TASK_CHIPS[task.id]!;
		const chip = page.locator(`[data-task="${task.id}"] [data-signal]`);
		await expect.soft(chip, task.status).toHaveText(label);
		await expect.soft(chip, task.status).toHaveAttribute('data-signal', signal);
	}
	await shot('ticket-page-task-chips');
	expect(errors).toEqual([]);
});

test('the ticket page and its data carry no token, factory URL or host', async ({ page, fake }) => {
	for (const path of [
		detailPath(ticketDetailActiveInQa.key),
		`${detailPath(ticketDetailMultiExecution.key)}?execution=1&tab=usage`
	]) {
		const response = await page.goto(path);
		const html = (await response?.text()) ?? '';
		const [pathname, search = ''] = path.split('?');
		const data = await (
			await page.request.get(`${pathname}/__data.json${search && `?${search}`}`)
		).text();
		for (const text of [html, data]) {
			expect(text).not.toContain(fake.token);
			expect(text).not.toContain(fake.url);
			expect(text).not.toContain(new URL(fake.url).host);
		}
	}
	expect(fake.requests().every((request) => request.method === 'GET')).toBe(true);
});

test.describe('the factory refuses the token (401)', () => {
	test.use({ fakeOptions: { token: 'not-the-dashboard-token' } });

	test('the ticket page renders the configuration error, not an empty page', async ({
		page,
		shot
	}) => {
		const response = await page.goto(detailPath(ticketDetailActiveInQa.key));
		expect(response?.status()).toBe(503);
		await expect(page.getByRole('heading', { name: CONFIG_ERROR })).toBeVisible();
		await expect(page.locator('body')).toContainText('FACTORY_API_TOKEN');
		await expect(page.getByTestId('tasks')).toHaveCount(0);
		await shot('ticket-page-bad-token');
	});
});

test.describe('the factory refuses the scope (403)', () => {
	test.use({
		fakeOptions: {
			failDetail: {
				keys: [ticketDetailActiveInQa.key],
				problem: { status: 403, title: 'Insufficient scope', type: 'insufficient_scope' }
			}
		}
	});

	test('the ticket page renders the configuration error', async ({ page }) => {
		const response = await page.goto(detailPath(ticketDetailActiveInQa.key));
		expect(response?.status()).toBe(503);
		await expect(page.getByRole('heading', { name: CONFIG_ERROR })).toBeVisible();
		await expect(page.getByTestId('tasks')).toHaveCount(0);
	});
});
