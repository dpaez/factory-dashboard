import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import { runWrapupPrepared } from '../src/lib/factory/fixtures/runs.ts';
import {
	ticketDetailActiveInQa,
	ticketDetailMultiExecution,
	ticketDetailMultiExecutionFirst
} from '../src/lib/factory/fixtures/tickets.ts';
import { FAKE_FACTORY_TOKEN, startFakeFactory, type FakeFactoryOptions } from './fake-factory';

// QA for ticket #21, task 03: ticket detail at /tickets/[key] on the factory API.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const detail = (key: string) => `/tickets/${encodeURIComponent(key)}`;
const SB = 'http://localhost:6006';
const story = (id: string, theme: string) =>
	`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions, token?: string) {
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, options));
		app = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(appPort),
				FACTORY_API_URL: `http://127.0.0.1:${fakePort}`,
				FACTORY_API_TOKEN: token ?? FAKE_FACTORY_TOKEN
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

test('AC1: the detail page shows tasks, summaries, attention with replies, usage, runs and executions', async ({
	page
}) => {
	await page.goto(detail(ticketDetailActiveInQa.key));
	const tasks = page.getByTestId('tasks');
	await expect.soft(tasks).toContainText('blocked by 02');
	await expect
		.soft(tasks)
		.toContainText('review round 2 · changes requested · findings 3 · blocking 1');
	await expect.soft(tasks).toContainText('QA round 1 · passed · tested 4 · gaps 1');
	const attention = page.getByTestId('attention');
	await expect.soft(attention).toContainText('Approved as written.');
	await expect.soft(attention).toContainText('dashboard (Diego)');
	await expect.soft(page.getByTestId('executions')).toContainText('Execution 1');
	// Usage and runs live in the Inspector's Usage tab.
	await page.getByRole('tab', { name: 'Usage' }).click();
	await expect(page).toHaveURL(`${detail(ticketDetailActiveInQa.key)}?tab=usage`);
	await expect.soft(page.getByTestId('usage-total')).toContainText('$');
	await expect.soft(page.getByTestId('runs-table')).toBeVisible();
	await shot(page, 'ac1-ticket-detail');
});

test('AC2: a qa-stage ticket renders without errors and the timeline shows QA', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const response = await page.goto(detail(ticketDetailActiveInQa.key));
	expect(response?.status()).toBe(200);
	const timeline = page.getByTestId('timeline');
	await expect(timeline).toContainText('QA');
	await expect(timeline).toHaveAttribute('data-stage', 'qa');
	await expect(page.getByText(/unrecognized stage/i)).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('AC3: a run with null usage shows — for cost, not $0.00', async ({ page }) => {
	await page.goto(`${detail(ticketDetailActiveInQa.key)}?tab=usage`);
	const run = page.locator(`[data-run="${runWrapupPrepared.id}"]`);
	await expect(run.getByTestId('run-cost')).toHaveText('—');
	await expect(page.getByTestId('runs-table')).not.toContainText('$0.00');
	await run.scrollIntoViewIfNeeded();
	if (SHOTS)
		await page.getByTestId('runs-table').screenshot({ path: `${SHOTS}/ac3-null-usage-run.png` });
});

test('AC4: ?execution=1 shows execution 1 as a past execution with a link to the current one', async ({
	page
}) => {
	const key = ticketDetailMultiExecution.key;
	await page.goto(`${detail(key)}?execution=1`);
	const banner = page.getByTestId('past-execution');
	await expect(banner).toContainText('Past execution 1');
	await expect(page.getByTestId('tasks')).toContainText(
		ticketDetailMultiExecutionFirst.tasks[0]!.title
	);
	await shot(page, 'ac4-past-execution');
	await banner.getByRole('link', { name: /current execution/i }).click();
	await expect(page).toHaveURL(detail(key));
	await expect(page.getByTestId('past-execution')).toHaveCount(0);
});

test('AC5: an unknown ticket key and an unknown execution both render 404', async ({ page }) => {
	const ticket = await page.goto(detail('qa-no-such-ticket'));
	expect(ticket?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'No such ticket' })).toBeVisible();
	await shot(page, 'ac5-unknown-ticket');
	const execution = await page.goto(`${detail(ticketDetailMultiExecution.key)}?execution=42`);
	expect(execution?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'No such execution' })).toBeVisible();
	await shot(page, 'ac5-unknown-execution');
});

test.describe('AC6: the factory answers 401', () => {
	const base = scenario(7821, 4221, {}, 'qa-wrong-token');
	test('AC6: 401 renders the configuration error page on the detail route', async ({ page }) => {
		const response = await page.goto(`${base}${detail(ticketDetailActiveInQa.key)}`);
		expect(response?.status()).toBe(503);
		await expect(
			page.getByRole('heading', { name: /cannot reach the factory with its configuration/ })
		).toBeVisible();
		await expect(page.getByTestId('tasks')).toHaveCount(0);
		await shot(page, 'ac6-config-error-401');
	});
});

test.describe('AC6: the factory answers 403', () => {
	const base = scenario(7822, 4222, {
		failDetail: {
			keys: [ticketDetailActiveInQa.key],
			problem: { status: 403, title: 'Insufficient scope', type: 'insufficient_scope' }
		}
	});
	test('AC6: 403 renders the configuration error page on the detail route', async ({ page }) => {
		const response = await page.goto(`${base}${detail(ticketDetailActiveInQa.key)}`);
		expect(response?.status()).toBe(503);
		await expect(
			page.getByRole('heading', { name: /cannot reach the factory with its configuration/ })
		).toBeVisible();
		await expect(page.getByTestId('tasks')).toHaveCount(0);
	});
});

const STORIES: [string, string[]][] = [
	['components-factory-tasklist', ['blockers', 'every-task-status', 'no-tasks-after-plan']],
	[
		'components-ticketdetail-attention',
		['open-and-resolved-with-a-table-question', 'many-replies', 'no-attention']
	],
	[
		'components-ticketdetail-executions',
		['current-execution-shown', 'past-execution-shown', 'no-executions']
	],
	[
		'components-usagelist',
		['runs-across-stages', 'run-without-usage', 'past-execution', 'no-runs']
	],
	['components-taskstable-statuscell', ['done', 'active-review', 'unknown-value']]
];

for (const [component, ids] of STORIES) {
	test(`AC9: ${component} stories render in light and dark`, async ({ page }) => {
		test.setTimeout(120_000);
		for (const id of ids) {
			for (const theme of ['light', 'dark']) {
				const response = await page.goto(story(`${component}--${id}`, theme));
				expect.soft(response?.status(), `${id} ${theme}`).toBe(200);
				await expect
					.soft(page.locator('#storybook-root'), `${id} ${theme}`)
					.not.toBeEmpty({ timeout: 20_000 });
				await expect
					.poll(() => page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme))
					.toBe(theme);
			}
		}
	});
}

test('AC9: the null-usage runs story shows — and the empty stories say so, in dark', async ({
	page
}) => {
	await page.goto(story('components-usagelist--run-without-usage', 'dark'));
	await expect(page.getByText('—').first()).toBeVisible();
	await expect(page.getByText('$0.00')).toHaveCount(0);
	await shot(page, 'ac9-usage-list-null-usage-dark');
	await page.goto(story('components-factory-tasklist--no-tasks-after-plan', 'dark'));
	await expect(page.getByText('No tasks recorded for this execution.')).toBeVisible();
	await page.goto(story('components-usagelist--no-runs', 'light'));
	await expect(page.locator('#storybook-root')).not.toBeEmpty();
	await shot(page, 'ac9-usage-list-empty-light');
});
