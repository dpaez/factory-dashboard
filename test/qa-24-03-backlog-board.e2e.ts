import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	backlogBlockedIssue,
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

// QA for ticket #24, task 03: the Backlog lane on /, Refresh/Retry, and the shared selection region.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const READY = backlogIssues.filter((issue) => !issue.blocked && !issue.umbrella).length;
const onBoard = openTickets.filter(
	(t) => !['complete', 'cancelled'].includes(t.status) && t.stage !== 'done'
);
const lanes = (page: Page) => page.getByRole('region', { name: 'Flow board lanes' });
const backlog = (page: Page) => page.getByRole('group', { name: /^Backlog\b/ });
const issueButton = (page: Page, title: string) =>
	backlog(page).getByRole('button').filter({ hasText: title });
/** Issue cards are the lane's buttons other than Refresh and Retry. */
const issueButtons = (page: Page) =>
	backlog(page)
		.getByRole('button')
		.filter({ hasNotText: /^\s*(Refresh|Refreshing…|Retry)\s*$/ });
const summary = (page: Page) => page.getByRole('list', { name: 'Board summary' });
const readyItem = (page: Page) =>
	summary(page).getByRole('listitem').filter({ hasText: 'ready to start' });
const updated = (page: Page) => backlog(page).getByText(/^Updated /);

type Recorded = { method: string; path: string };
const fakeRequests = async (base = FAKE_FACTORY_URL): Promise<Recorded[]> =>
	(await fetch(`${base}/__fake/requests`)).json();
const backlogReads = (list: Recorded[], refresh: boolean) =>
	list.filter(
		(r) => r.path.startsWith('/v1/backlog') && r.path.includes('refresh=true') === refresh
	);

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

test('AC1: the Backlog lane is first, lists every page and shows when the tracker was asked', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/');
	await expect(lanes(page).getByRole('group').first()).toHaveAccessibleName(/^Backlog\b/);
	for (const issue of backlogIssues) {
		await expect.soft(issueButton(page, issue.title)).toHaveCount(1);
	}
	await expect(issueButtons(page)).toHaveCount(backlogIssues.length);
	await expect(updated(page)).toHaveText('Updated 2026-10-13 11:00 UTC');
	await shot(page, 'ac1-backlog-lane-first');
});

test('AC5: ready to start counts non-blocked, non-umbrella backlog issues', async ({ page }) => {
	await page.goto('/');
	await expect(readyItem(page)).toHaveText(new RegExp(`^\\s*${READY}\\s+ready to start\\s*$`));
});

test.describe('AC2: Refresh', () => {
	const base = scenario(7851, 4251, { backlogRefreshedAt: '2026-10-15T09:45:00Z' });

	test('AC2: Refresh re-reads with refresh=true and updates the timestamp without a reload', async ({
		page
	}) => {
		await page.goto(`${base.app}/`, { waitUntil: 'networkidle' });
		await expect(updated(page)).toHaveText('Updated 2026-10-13 11:00 UTC');
		let navigations = 0;
		page.on('framenavigated', (frame) => {
			if (frame === page.mainFrame()) navigations++;
		});
		const before = (await fakeRequests(base.fake)).length;
		await backlog(page).getByRole('button', { name: 'Refresh' }).click();
		await expect(updated(page)).toHaveText('Updated 2026-10-15 09:45 UTC');
		expect(backlogReads((await fakeRequests(base.fake)).slice(before), true).length).toBe(1);
		await expect(issueButtons(page)).toHaveCount(backlogIssues.length);
		expect(navigations).toBe(0);
		await shot(page, 'ac2-after-refresh');
	});
});

test.describe('AC3: the backlog read fails', () => {
	const base = scenario(7852, 4252, { failBacklog: problemTrackerUnavailable });

	test('AC3: stage lanes and counts render; the lane shows the failure with Retry', async ({
		page
	}) => {
		await page.goto(`${base.app}/`, { waitUntil: 'networkidle' });
		const alert = backlog(page).getByRole('alert');
		await expect(alert).toContainText('Backlog unavailable.');
		await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
		for (const ticket of onBoard) {
			await expect
				.soft(lanes(page).getByRole('button').filter({ hasText: ticket.title }).first())
				.toBeVisible();
		}
		await expect(
			summary(page).getByRole('listitem').filter({ hasText: 'in progress' })
		).toContainText(`${onBoard.length} in progress`);
		await expect(
			summary(page).getByRole('listitem').filter({ hasText: 'agents running' })
		).toContainText(`${agentList.items.length} agents running`);
		await shot(page, 'ac3-backlog-failed');

		const before = (await fakeRequests(base.fake)).length;
		await alert.getByRole('button', { name: 'Retry' }).click();
		await expect
			.poll(async () => backlogReads((await fakeRequests(base.fake)).slice(before), false).length)
			.toBeGreaterThan(0);
	});

	test('AC5: ready to start reads Unavailable when the backlog could not be read', async ({
		page
	}) => {
		await page.goto(`${base.app}/`);
		await expect(readyItem(page)).toHaveText(/^\s*Unavailable\s+ready to start\s*$/);
	});

	test('AC9: a failed /api/factory/backlog answer carries no token, URL or upstream body', async ({
		request
	}) => {
		const response = await request.get(`${base.app}/api/factory/backlog`);
		expect(response.ok()).toBe(false);
		const text = await response.text();
		expect(text).not.toContain(FAKE_FACTORY_TOKEN);
		expect(text).not.toContain(base.fake);
		expect(text).not.toContain('127.0.0.1');
		expect(text).not.toContain(JSON.stringify(problemTrackerUnavailable));
	});
});

test.describe('AC4: a refresh fails after a successful read', () => {
	const base = scenario(7853, 4253, { failBacklogOnRefresh: problemTrackerUnavailable });

	test('AC4: previous issues stay with their timestamp, and Retry re-reads', async ({ page }) => {
		await page.goto(`${base.app}/`, { waitUntil: 'networkidle' });
		await expect(issueButtons(page)).toHaveCount(backlogIssues.length);
		await backlog(page).getByRole('button', { name: 'Refresh' }).click();
		const alert = backlog(page).getByRole('alert');
		await expect(alert).toContainText('Backlog unavailable.');
		await expect(alert).toContainText('Showing issues from 2026-10-13 11:00 UTC');
		await expect(updated(page)).toHaveText('Updated 2026-10-13 11:00 UTC');
		await expect(issueButtons(page)).toHaveCount(backlogIssues.length);
		await shot(page, 'ac4-stale-after-failed-refresh');

		const before = (await fakeRequests(base.fake)).length;
		await alert.getByRole('button', { name: 'Retry' }).click();
		await expect
			.poll(async () => backlogReads((await fakeRequests(base.fake)).slice(before), true).length)
			.toBe(1);
	});
});

test('AC6: backlog and ticket cards share the selection region by click, Enter and Space', async ({
	page
}) => {
	await page.goto('/', { waitUntil: 'networkidle' });
	const preview = page.getByRole('region', { name: 'Selected issue' });
	const selectedTicket = page.getByRole('region', { name: 'Selected ticket' });

	await issueButton(page, backlogIssueWithDetails.title).click();
	await expect(page).toHaveURL(`/?issue=${encodeURIComponent(backlogIssueWithDetails.id)}`);
	await expect(preview).toContainText(backlogIssueWithDetails.title);

	await issueButton(page, backlogBlockedIssue.title).focus();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(`/?issue=${encodeURIComponent(backlogBlockedIssue.id)}`);
	await expect(preview).toContainText(backlogBlockedIssue.title);
	await expect(issueButton(page, backlogBlockedIssue.title)).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await shot(page, 'ac6-issue-preview');

	const ticket = page.locator(`[data-ticket-key="${onBoard[0]!.key}"]`);
	await ticket.click();
	await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(onBoard[0]!.key)}`);
	await expect(selectedTicket).toContainText(onBoard[0]!.title);
	await expect(preview).toHaveCount(0);

	await issueButton(page, backlogIssueWithDetails.title).focus();
	await page.keyboard.press('Space');
	await expect(page).toHaveURL(`/?issue=${encodeURIComponent(backlogIssueWithDetails.id)}`);
	await expect(preview).toContainText(backlogIssueWithDetails.title);
	await expect(selectedTicket).toHaveCount(0);
});

test('AC7: /?issue= opens the preview directly; an unknown id is not in the backlog', async ({
	page
}) => {
	await page.goto(`/?issue=${encodeURIComponent(backlogIssueWithDetails.id)}`);
	const preview = page.getByRole('region', { name: 'Selected issue' });
	await expect(preview).toContainText(backlogIssueWithDetails.title);

	const response = await page.goto(`/?issue=${encodeURIComponent('issue_does_not_exist')}`);
	expect(response?.status()).toBe(200);
	await expect(preview).toContainText('Not in the loaded backlog.');
	await expect(lanes(page)).toBeVisible();
	await shot(page, 'ac7-unknown-issue');
});

test('AC8: choosing a label filters the Backlog lane', async ({ page }) => {
	await page.goto('/', { waitUntil: 'networkidle' });
	const withUi = backlogIssues.filter((issue) => issue.labels.includes('ui'));
	await backlog(page).getByLabel('Filter by label').selectOption('ui');
	await expect(issueButtons(page)).toHaveCount(withUi.length);
	for (const issue of withUi) await expect(issueButton(page, issue.title)).toHaveCount(1);
	await expect(issueButton(page, backlogBlockedIssue.title)).toHaveCount(0);
	await shot(page, 'ac8-label-filter');
});

test('AC9: the page and /api/factory/backlog carry no factory token, URL or upstream body', async ({
	page,
	request
}) => {
	const html = await (await request.get('/')).text();
	const api = await request.get('/api/factory/backlog?refresh=true');
	expect(api.status()).toBe(200);
	const body = await api.text();
	for (const text of [html, body]) {
		expect(text).not.toContain(FAKE_FACTORY_TOKEN);
		expect(text).not.toContain(FAKE_FACTORY_URL);
		expect(text).not.toContain('127.0.0.1');
		expect(text).not.toContain('nextCursor');
	}
	// The streamed backlog the browser received renders, and the client never sees the factory.
	const seen: string[] = [];
	page.on('response', async (r) => {
		try {
			seen.push(await r.text());
		} catch {
			/* redirects and the like have no body */
		}
	});
	await page.goto('/', { waitUntil: 'networkidle' });
	await backlog(page).getByRole('button', { name: 'Refresh' }).click();
	await expect(backlog(page).getByRole('button', { name: 'Refresh' })).toBeEnabled();
	await expect(issueButtons(page)).toHaveCount(backlogIssues.length);
	expect(seen.length).toBeGreaterThan(0);
	expect(seen.filter((t) => t.includes(FAKE_FACTORY_TOKEN) || t.includes('127.0.0.1'))).toEqual([]);
});
