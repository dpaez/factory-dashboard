import type { Page } from '@playwright/test';

import {
	backlogBlockedIssue,
	backlogIssueBare,
	backlogIssueManyLabels,
	backlogIssuePlain,
	backlogIssueWithDetails,
	backlogIssues
} from '../src/lib/factory/fixtures/backlog.ts';
import { problemTrackerUnavailable } from '../src/lib/factory/fixtures/problems.ts';
import { agentList, openTickets } from './fake-factory.ts';
import { expect, gotoLive, test, type FakeFixture } from './fixtures.ts';

// The Backlog lane on /: every page, Refresh and Retry, the label filter, the
// issue preview, the selection region it shares with ticket cards, and what
// the lane does when the tracker read fails.

/** Backlog issues neither blocked nor umbrella: the summary's ready to start. */
const READY = backlogIssues.filter((issue) => !issue.blocked && !issue.umbrella).length;
const WITH_UI = backlogIssues.filter((issue) => issue.labels.includes('ui'));
const onBoard = openTickets.filter(
	(ticket) => !['complete', 'cancelled'].includes(ticket.status) && ticket.stage !== 'done'
);
const lanes = (page: Page) => page.getByRole('region', { name: 'Flow board lanes' });
const backlog = (page: Page) => page.getByRole('group', { name: /^Backlog\b/ });
const issueCards = (page: Page) => backlog(page).locator('[data-slot="backlog-card-button"]');
const issueCard = (page: Page, id: string) => page.locator(`[data-issue-id="${id}"]`).first();
const refresh = (page: Page) => backlog(page).getByRole('button', { name: 'Refresh' });
const updated = (page: Page) => backlog(page).locator('[data-slot="backlog-fetched-at"]');
const failure = (page: Page) => backlog(page).locator('[data-slot="backlog-failure"]');
const summaryItem = (page: Page, name: string) => page.locator(`[data-summary="${name}"]`);
const preview = (page: Page) => page.getByRole('region', { name: 'Selected issue' });
const ticketCard = (page: Page, key: string) =>
	page.locator(`[data-slot="ticket-card"][data-ticket-key="${key}"]`);

/** The backlog reads the fake received since `from`, with or without `refresh=true`. */
const backlogReads = (fake: FakeFixture, refreshed: boolean, from = 0) =>
	fake
		.requests()
		.slice(from)
		.filter(
			(r) => r.path.startsWith('/v1/backlog') && r.path.includes('refresh=true') === refreshed
		);

test('the Backlog lane is the first lane, lists every page and shows when the tracker was asked', async ({
	page,
	shot
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/');
	await expect(lanes(page).getByRole('group').first()).toHaveAccessibleName(/^Backlog\b/);
	await expect(page.locator('[data-slot="flow-board"] > *').first()).toHaveAttribute(
		'data-slot',
		'flow-board-backlog'
	);
	await expect(issueCards(page)).toHaveCount(backlogIssues.length);
	for (const issue of backlogIssues) {
		await expect.soft(backlog(page).locator(`[data-issue-id="${issue.id}"]`)).toHaveCount(1);
	}
	await expect(updated(page)).toHaveText('Updated 2026-10-13 11:00 UTC');
	await expect(summaryItem(page, 'ready-to-start')).toHaveText(
		new RegExp(`^\\s*${READY}\\s+ready to start\\s*$`)
	);
	await expect(page.locator('[data-slot="flow-board-backlog"]')).toHaveCSS(
		'border-right-style',
		'solid'
	);
	await shot('backlog-lane');
});

test.describe('a refresh updates the timestamp', () => {
	test.use({ fakeOptions: { backlogRefreshedAt: '2026-10-15T09:45:00Z' } });

	test('Refresh re-reads with refresh=true and updates the timestamp without a page reload', async ({
		page,
		fake,
		shot
	}) => {
		await gotoLive(page, '/');
		await expect(updated(page)).toHaveText('Updated 2026-10-13 11:00 UTC');
		await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));
		let navigations = 0;
		page.on('framenavigated', (frame) => {
			if (frame === page.mainFrame()) navigations++;
		});
		const before = fake.requests().length;
		await refresh(page).click();
		await expect(updated(page)).toHaveText('Updated 2026-10-15 09:45 UTC');
		await expect(refresh(page)).toBeEnabled();
		expect(backlogReads(fake, true, before)).toHaveLength(1);
		await expect(issueCards(page)).toHaveCount(backlogIssues.length);
		expect(navigations).toBe(0);
		expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(
			1
		);
		await shot('backlog-refreshed');
	});
});

test.describe('the backlog read fails', () => {
	test.use({ fakeOptions: { failBacklog: problemTrackerUnavailable } });

	test('the lane shows the failure with Retry; the stage lanes and counts render', async ({
		page,
		fake,
		shot
	}) => {
		await gotoLive(page, '/');
		await expect(failure(page)).toContainText('Backlog unavailable.');
		await expect(failure(page)).toContainText(problemTrackerUnavailable.title);
		await expect(backlog(page).getByRole('alert')).toBeVisible();
		await expect(page.locator('[data-slot="ticket-card"]')).toHaveCount(onBoard.length);
		await expect(summaryItem(page, 'in-progress')).toContainText(`${onBoard.length} in progress`);
		await expect(summaryItem(page, 'agents-running')).toContainText(
			`${agentList.items.length} agents running`
		);
		await expect(summaryItem(page, 'ready-to-start')).toHaveText(
			/^\s*Unavailable\s+ready to start\s*$/
		);
		await shot('backlog-lane-failed');

		const before = fake.requests().length;
		await failure(page).getByRole('button', { name: 'Retry' }).click();
		await expect.poll(() => backlogReads(fake, false, before).length).toBeGreaterThan(0);
		await expect(failure(page)).toBeVisible();
	});
});

test.describe('a refresh fails after a successful read', () => {
	test.use({ fakeOptions: { failBacklogOnRefresh: problemTrackerUnavailable } });

	test('the previous issues stay with their timestamp, and Retry re-reads', async ({
		page,
		fake,
		shot
	}) => {
		await gotoLive(page, '/');
		await expect(issueCards(page)).toHaveCount(backlogIssues.length);
		await refresh(page).click();
		await expect(failure(page)).toContainText('Backlog unavailable.');
		await expect(failure(page)).toContainText('Showing issues from 2026-10-13 11:00 UTC');
		await expect(updated(page)).toHaveText('Updated 2026-10-13 11:00 UTC');
		await expect(issueCards(page)).toHaveCount(backlogIssues.length);
		await expect(summaryItem(page, 'ready-to-start')).toHaveText(
			/^\s*Unavailable\s+ready to start\s*$/
		);
		await shot('backlog-lane-stale');

		const before = fake.requests().length;
		await failure(page).getByRole('button', { name: 'Retry' }).click();
		await expect.poll(() => backlogReads(fake, true, before).length).toBe(1);
	});
});

test.describe('a refresh drops the selected label', () => {
	test.use({ fakeOptions: { backlogOnRefresh: [backlogIssuePlain, backlogIssueBare] } });

	test('a label filter narrows the lane, and a refresh resets it to All labels', async ({
		page,
		shot
	}) => {
		await gotoLive(page, '/');
		const filter = backlog(page).getByLabel('Filter by label');
		await filter.selectOption('ui');
		await expect(issueCards(page)).toHaveCount(WITH_UI.length);
		for (const issue of WITH_UI) await expect(issueCard(page, issue.id)).toBeVisible();
		await expect(issueCard(page, backlogIssueManyLabels.id)).toBeVisible();
		await expect(issueCard(page, backlogBlockedIssue.id)).toHaveCount(0);
		// The summary ignores the filter.
		await expect(summaryItem(page, 'ready-to-start')).toHaveText(
			new RegExp(`^\\s*${READY}\\s+ready to start\\s*$`)
		);
		await shot('backlog-label-filter');

		await refresh(page).click();
		await expect(issueCards(page)).toHaveCount(2);
		await expect(filter).toHaveValue('');
		await expect(backlog(page).locator('[data-slot="backlog-no-match"]')).toHaveCount(0);
		await expect(issueCard(page, backlogIssueBare.id)).toBeVisible();
	});
});

test('/?issue= opens the preview directly; an unknown id is not in the backlog', async ({
	page,
	shot
}) => {
	await page.goto(`/?issue=${encodeURIComponent(backlogIssueWithDetails.id)}`);
	await expect(preview(page)).toContainText(backlogIssueWithDetails.title);
	await expect(preview(page).locator('[data-field="author"]')).toHaveText('dpaez');
	await expect(preview(page).locator('script')).toHaveCount(0);
	await expect(issueCard(page, backlogIssueWithDetails.id)).toHaveAttribute('aria-pressed', 'true');

	const response = await page.goto(`/?issue=${encodeURIComponent('no/such issue')}`);
	expect(response?.status()).toBe(200);
	await expect(preview(page)).toContainText('no/such issue');
	await expect(preview(page)).toContainText('Not in the loaded backlog.');
	await expect(lanes(page)).toBeVisible();
	await shot('backlog-unknown-issue');
});

test('backlog and ticket cards share one selection region by click, Enter and Space', async ({
	page,
	shot
}) => {
	await gotoLive(page, '/');
	const inspector = page.getByTestId('ticket-inspector');
	const ticket = ticketCard(page, onBoard[0]!.key);

	await issueCard(page, backlogIssueWithDetails.id).click();
	await expect(page).toHaveURL(`/?issue=${encodeURIComponent(backlogIssueWithDetails.id)}`);
	await expect(preview(page)).toContainText(backlogIssueWithDetails.title);

	const blocked = issueCard(page, backlogBlockedIssue.id);
	await blocked.focus();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(`/?issue=${encodeURIComponent(backlogBlockedIssue.id)}`);
	await expect(blocked).toHaveAttribute('aria-pressed', 'true');
	await expect(blocked).toBeFocused();
	await expect(preview(page)).toContainText(backlogBlockedIssue.title);
	await expect(preview(page).getByRole('link', { name: /Open in tracker/ })).toHaveAttribute(
		'target',
		'_blank'
	);
	await shot('backlog-issue-selected');

	await ticket.focus();
	await page.keyboard.press('Space');
	await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(onBoard[0]!.key)}`);
	await expect(ticket).toHaveAttribute('aria-pressed', 'true');
	await expect(blocked).toHaveAttribute('aria-pressed', 'false');
	await expect(inspector).toContainText(onBoard[0]!.title);
	await expect(preview(page)).toHaveCount(0);

	await blocked.focus();
	await page.keyboard.press('Space');
	await expect(page).toHaveURL(`/?issue=${encodeURIComponent(backlogBlockedIssue.id)}`);
	await expect(ticket).toHaveAttribute('aria-pressed', 'false');
	await expect(inspector).toHaveCount(0);
});

test('the backlog page and /api/factory/backlog carry no token, factory URL or upstream body; the fake sees only GETs', async ({
	page,
	request,
	fake
}) => {
	const html = await (await request.get('/')).text();
	const data = await (await request.get('/__data.json')).text();
	const api = await request.get('/api/factory/backlog?refresh=true');
	expect(api.status()).toBe(200);
	const body = await api.text();
	for (const text of [html, data, body]) {
		expect(text).not.toContain(fake.token);
		expect(text).not.toContain(fake.url);
		expect(text).not.toContain('127.0.0.1');
		expect(text).not.toContain('nextCursor');
	}

	// What the browser receives while the lane loads and refreshes never names the factory.
	const seen: string[] = [];
	page.on('response', async (response) => {
		if (new URL(response.url()).pathname.startsWith('/api/factory/events')) return; // never ends
		seen.push(await response.text().catch(() => ''));
	});
	await gotoLive(page, '/');
	await refresh(page).click();
	await expect(refresh(page)).toBeEnabled();
	await expect(issueCards(page)).toHaveCount(backlogIssues.length);
	expect(seen.length).toBeGreaterThan(0);
	expect(seen.filter((t) => t.includes(fake.token) || t.includes('127.0.0.1'))).toEqual([]);

	const requests = fake.requests();
	expect(backlogReads(fake, true).length).toBeGreaterThan(0);
	expect(requests.filter((r) => r.method !== 'GET')).toEqual([]);
});
