import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	backlogBlockedIssue,
	backlogIssueBare,
	backlogIssuePlain,
	backlogIssueManyLabels,
	backlogIssueWithDetails,
	backlogIssues
} from '../src/lib/factory/fixtures/backlog.ts';
import { problemTrackerUnavailable } from '../src/lib/factory/fixtures/problems.ts';
import {
	FAKE_FACTORY_TOKEN,
	FAKE_FACTORY_URL,
	agentList,
	openTickets,
	startFakeFactory,
	type FakeFactoryOptions
} from './fake-factory';
import { gotoLive } from './live';

// Ticket #24, task 03: the Backlog lane on /, Refresh/Retry, and the shared selection region.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const READY = backlogIssues.filter((issue) => !issue.blocked && !issue.umbrella).length;
const onBoard = openTickets.filter(
	(ticket) => !['complete', 'cancelled'].includes(ticket.status) && ticket.stage !== 'done'
);
const backlogLane = (page: Page) => page.locator('[data-slot="backlog-lane"]');
const issueCard = (page: Page, id: string) => page.locator(`[data-issue-id="${id}"]`).first();
const ready = (page: Page) => page.locator('[data-summary="ready-to-start"]');
const region = (page: Page) => page.getByTestId('selection');

type Recorded = { method: string; path: string };
async function fakeRequests(base = FAKE_FACTORY_URL): Promise<Recorded[]> {
	return (await fetch(`${base}/__fake/requests`)).json();
}

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions) {
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, options));
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
	return { app: `http://localhost:${appPort}`, fake: `http://127.0.0.1:${fakePort}` };
}

test('the Backlog lane is the first lane and lists every backlog page', async ({ page }) => {
	await page.goto('/');
	const board = page.locator('[data-slot="flow-board"]');
	await expect(board.locator(':scope > *').first()).toHaveAttribute(
		'data-slot',
		'flow-board-backlog'
	);
	await expect(backlogLane(page).locator('[data-slot="backlog-card-button"]')).toHaveCount(
		backlogIssues.length
	);
	await expect(backlogLane(page).locator('[data-slot="backlog-fetched-at"]')).toHaveText(
		'Updated 2026-10-13 11:00 UTC'
	);
	await expect(ready(page)).toHaveText(new RegExp(`^\\s*${READY}\\s+ready to start\\s*$`));
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect(page.locator('[data-slot="flow-board-backlog"]')).toHaveCSS(
		'border-right-style',
		'solid'
	);
	await shot(page, 'backlog-lane-lg');
});

test('Refresh asks the tracker with refresh=true without reloading the page', async ({ page }) => {
	await gotoLive(page, '/');
	await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));
	const before = (await fakeRequests()).length;
	await backlogLane(page).getByRole('button', { name: 'Refresh' }).click();
	await expect
		.poll(async () =>
			(await fakeRequests())
				.slice(before)
				.some((r) => r.path.startsWith('/v1/backlog') && r.path.includes('refresh=true'))
		)
		.toBe(true);
	await expect(backlogLane(page).getByRole('button', { name: 'Refresh' })).toBeEnabled();
	await expect(backlogLane(page).locator('[data-slot="backlog-card-button"]')).toHaveCount(
		backlogIssues.length
	);
	expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
});

test('by keyboard, backlog and ticket cards share one selection region', async ({ page }) => {
	await gotoLive(page, '/');
	const issue = issueCard(page, backlogBlockedIssue.id);
	await issue.focus();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(`/?issue=${encodeURIComponent(backlogBlockedIssue.id)}`);
	await expect(issue).toHaveAttribute('aria-pressed', 'true');
	await expect(issue).toBeFocused();
	const preview = region(page).locator('[data-slot="issue-preview"]');
	await expect(preview).toContainText(backlogBlockedIssue.title);
	await expect(preview.getByRole('link', { name: /Open in tracker/ })).toHaveAttribute(
		'target',
		'_blank'
	);
	await shot(page, 'backlog-issue-selected');

	const ticket = page.locator(`[data-slot="ticket-card"][data-ticket-key="${onBoard[0]!.key}"]`);
	await ticket.focus();
	await page.keyboard.press('Space');
	await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(onBoard[0]!.key)}`);
	await expect(ticket).toHaveAttribute('aria-pressed', 'true');
	await expect(issue).toHaveAttribute('aria-pressed', 'false');
	await expect(region(page).getByTestId('ticket-inspector')).toContainText(onBoard[0]!.title);
	await expect(preview).toHaveCount(0);

	await issue.focus();
	await page.keyboard.press('Space');
	await expect(page).toHaveURL(`/?issue=${encodeURIComponent(backlogBlockedIssue.id)}`);
	await expect(ticket).toHaveAttribute('aria-pressed', 'false');
	await expect(region(page).getByTestId('ticket-inspector')).toHaveCount(0);
});

test('/?issue= loads the preview directly; an unknown id is not in the backlog', async ({
	page
}) => {
	await page.goto(`/?issue=${encodeURIComponent(backlogIssueWithDetails.id)}`);
	const preview = region(page).locator('[data-slot="issue-preview"]');
	await expect(preview).toContainText(backlogIssueWithDetails.title);
	await expect(preview.locator('[data-field="author"]')).toHaveText('dpaez');
	await expect(preview.locator('script')).toHaveCount(0);
	await expect(issueCard(page, backlogIssueWithDetails.id)).toHaveAttribute('aria-pressed', 'true');

	await page.goto(`/?issue=${encodeURIComponent('no/such issue')}`);
	await expect(preview).toContainText('no/such issue');
	await expect(preview).toContainText('Not in the loaded backlog.');
});

test('choosing a label narrows the Backlog lane', async ({ page }) => {
	await gotoLive(page, '/');
	const withLabel = backlogIssues.filter((issue) => issue.labels.includes('ui'));
	await backlogLane(page).getByLabel('Filter by label').selectOption('ui');
	await expect(backlogLane(page).locator('[data-slot="backlog-card-button"]')).toHaveCount(
		withLabel.length
	);
	await expect(issueCard(page, backlogIssueManyLabels.id)).toBeVisible();
	await expect(issueCard(page, backlogBlockedIssue.id)).toHaveCount(0);
	// The summary ignores the filter.
	await expect(ready(page)).toHaveText(new RegExp(`^\\s*${READY}\\s+ready to start\\s*$`));
});

test('the dashboard API answers only GET and never leaks the factory', async ({ request }) => {
	const response = await request.get('/api/factory/backlog');
	expect(response.status()).toBe(200);
	const text = await response.text();
	expect(text).not.toContain(FAKE_FACTORY_TOKEN);
	expect(text).not.toContain('127.0.0.1');
	expect((await request.post('/api/factory/backlog')).status()).toBe(405);
});

test('no request other than GET reaches the fake', async ({ page }) => {
	await gotoLive(page, '/');
	await backlogLane(page).getByRole('button', { name: 'Refresh' }).click();
	await expect(backlogLane(page).getByRole('button', { name: 'Refresh' })).toBeEnabled();
	const requests = await fakeRequests();
	expect(requests.length).toBeGreaterThan(0);
	expect(requests.filter((r) => r.method !== 'GET')).toEqual([]);
});

test.describe('the backlog read fails', () => {
	const base = scenario(7841, 4241, { failBacklog: problemTrackerUnavailable });

	test('the lane shows the failure with Retry; the stage lanes and counts render', async ({
		page
	}) => {
		await gotoLive(page, `${base.app}/`);
		const failure = backlogLane(page).locator('[data-slot="backlog-failure"]');
		await expect(failure).toContainText('Backlog unavailable.');
		await expect(failure).toContainText(problemTrackerUnavailable.title);
		await expect(failure.getByRole('button', { name: 'Retry' })).toBeVisible();
		await expect(page.locator('[data-slot="ticket-card"]')).toHaveCount(onBoard.length);
		await expect(page.locator('[data-summary="in-progress"]')).toContainText(
			`${onBoard.length} in progress`
		);
		await expect(page.locator('[data-summary="agents-running"]')).toContainText(
			`${agentList.items.length} agents running`
		);
		await expect(ready(page)).toHaveText(/^\s*Unavailable\s+ready to start\s*$/);
		await shot(page, 'backlog-lane-failed');

		const before = (await fakeRequests(base.fake)).length;
		await failure.getByRole('button', { name: 'Retry' }).click();
		await expect
			.poll(async () =>
				(await fakeRequests(base.fake)).slice(before).some((r) => r.path.startsWith('/v1/backlog'))
			)
			.toBe(true);
		await expect(failure).toBeVisible();
	});
});

test.describe('a refresh fails after a successful read', () => {
	const base = scenario(7842, 4242, { failBacklogOnRefresh: problemTrackerUnavailable });

	test('the previous issues stay with their timestamp, and Retry re-reads', async ({ page }) => {
		await gotoLive(page, `${base.app}/`);
		const cards = backlogLane(page).locator('[data-slot="backlog-card-button"]');
		await expect(cards).toHaveCount(backlogIssues.length);
		await backlogLane(page).getByRole('button', { name: 'Refresh' }).click();
		const failure = backlogLane(page).locator('[data-slot="backlog-failure"]');
		await expect(failure).toContainText('Backlog unavailable.');
		await expect(failure).toContainText('Showing issues from 2026-10-13 11:00 UTC');
		await expect(cards).toHaveCount(backlogIssues.length);
		await expect(ready(page)).toHaveText(/^\s*Unavailable\s+ready to start\s*$/);
		await shot(page, 'backlog-lane-stale');

		const before = (await fakeRequests(base.fake)).length;
		await failure.getByRole('button', { name: 'Retry' }).click();
		await expect
			.poll(async () =>
				(await fakeRequests(base.fake))
					.slice(before)
					.some((r) => r.path.startsWith('/v1/backlog') && r.path.includes('refresh=true'))
			)
			.toBe(true);
	});
});

test.describe('a refresh updates the timestamp', () => {
	const base = scenario(7843, 4243, { backlogRefreshedAt: '2026-10-14T08:30:00Z' });

	test('the lane shows the new fetchedAt', async ({ page }) => {
		await gotoLive(page, `${base.app}/`);
		const fetched = backlogLane(page).locator('[data-slot="backlog-fetched-at"]');
		await expect(fetched).toHaveText('Updated 2026-10-13 11:00 UTC');
		await backlogLane(page).getByRole('button', { name: 'Refresh' }).click();
		await expect(fetched).toHaveText('Updated 2026-10-14 08:30 UTC');
	});
});

test.describe('a refresh drops the selected label', () => {
	const base = scenario(7844, 4244, { backlogOnRefresh: [backlogIssuePlain, backlogIssueBare] });

	test('the filter resets to All labels and the refreshed issues show', async ({ page }) => {
		await gotoLive(page, `${base.app}/`);
		const filter = backlogLane(page).getByLabel('Filter by label');
		const cards = backlogLane(page).locator('[data-slot="backlog-card-button"]');
		await filter.selectOption('ui');
		await expect(cards).toHaveCount(
			backlogIssues.filter((issue) => issue.labels.includes('ui')).length
		);
		await backlogLane(page).getByRole('button', { name: 'Refresh' }).click();
		await expect(cards).toHaveCount(2);
		await expect(filter).toHaveValue('');
		await expect(backlogLane(page).locator('[data-slot="backlog-no-match"]')).toHaveCount(0);
		await expect(issueCard(page, backlogIssueBare.id)).toBeVisible();
	});
});
