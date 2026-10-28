import type { Page } from '@playwright/test';

import { backlogIssuePlain } from '../src/lib/factory/fixtures/backlog.ts';
import {
	problemInternalError,
	problemTrackerUnavailable,
	problemUmbrellaIssue
} from '../src/lib/factory/fixtures/problems.ts';
import { START_FAILURES } from '../src/lib/factory/start.ts';
import { expect, gotoLive, test, type FakeFixture } from './fixtures.ts';

// Start from the backlog on /: one start per action, the handoff to the new
// ticket's inspector, rejected, read-only and unconfirmed starts, and the
// issue never showing as both a backlog card and a board ticket.

const ISSUE = backlogIssuePlain;
const READ_ONLY = "Action access required: this dashboard's token cannot send commands.";

/** The start commands the fake received in this test. */
const starts = (fake: FakeFixture) => fake.commands().filter((c) => c.command === 'start');

/**
 * Every browser request stays on the app's origin, no request names the
 * token, and neither the page HTML nor any answer the browser reads names the
 * token or the factory's address.
 */
function guard(page: Page, origin: string, token: string) {
	const leaks = [token, '127.0.0.1:', 'Bearer '];
	const problems: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.origin !== origin) problems.push(`off-origin ${request.url()}`);
		if (JSON.stringify(request.headers()).includes(token)) {
			problems.push(`token in request ${url.pathname}`);
		}
	});
	page.on('response', async (response) => {
		const url = new URL(response.url());
		if (url.pathname.startsWith('/api/factory/events')) return; // never ends
		const text = await response.text().catch(() => '');
		for (const leak of leaks) {
			if (text.includes(leak)) problems.push(`${url.pathname} answer leaks ${leak}`);
		}
	});
	return {
		problems,
		async html() {
			const html = await page.content();
			for (const leak of leaks) {
				if (html.includes(leak)) problems.push(`page HTML leaks ${leak}`);
			}
		}
	};
}

const card = (page: Page) =>
	page.locator('[data-lane="backlog"] [data-slot="backlog-card"]').filter({
		has: page.locator(`[data-issue-id="${ISSUE.id}"]`)
	});
const cardStart = (page: Page) => card(page).locator('[data-slot="start-button"]');
const preview = (page: Page) => page.getByRole('region', { name: 'Selected issue' });
const previewStart = (page: Page) => preview(page).locator('[data-slot="start-button"]');
const plan = (page: Page) => page.getByRole('group', { name: /^Plan\b/ });
/** Any ticket card for the issue's display reference. */
const ticketCards = (page: Page) =>
	page.locator('[data-slot="ticket-card"]').filter({ hasText: ISSUE.displayRef });
const SELECT_ISSUE = `/?issue=${encodeURIComponent(ISSUE.id)}`;

test.describe('one start per action', () => {
	test.use({ fakeOptions: { startAddsTicket: true, commandDelayMs: 1_500 } });

	test('a double-click and repeated Enter on Start send one start with one intent id', async ({
		page,
		app,
		fake
	}) => {
		const { problems, html } = guard(page, app.url, fake.token);
		await gotoLive(page, SELECT_ISSUE);
		const start = cardStart(page);
		await expect(start).toBeEnabled();
		await start.dblclick();
		await expect(start).toHaveText('Starting…');
		await expect(previewStart(page)).toHaveText('Starting…');
		for (let i = 0; i < 5; i++) await start.press('Enter');
		for (let i = 0; i < 3; i++) await previewStart(page).press('Enter');
		await previewStart(page)
			.click({ timeout: 1_000 })
			.catch(() => {});
		await expect(page).toHaveURL(/\?ticket=fake-started-/, { timeout: 15_000 });

		const sent = starts(fake);
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ ref: ISSUE.displayRef });
		expect(sent[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
		await html();
		expect(problems).toEqual([]);
	});
});

test.describe('the handoff', () => {
	test.use({ fakeOptions: { startAddsTicket: true, commandDelayMs: 1_500 } });

	test('Starting…, then Start accepted, then the new ticket’s inspector, replacing history', async ({
		page,
		app,
		fake,
		shot
	}) => {
		const { problems, html } = guard(page, app.url, fake.token);
		await page.goto('/');
		await gotoLive(page, SELECT_ISSUE);
		// Hold the board's reread so the accepted state, before a read lists the ticket, is observable.
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route('**/__data.json*', async (route) => {
			await held;
			await route.continue();
		});
		await previewStart(page).click();
		await expect(previewStart(page)).toHaveText('Starting…');
		await expect(cardStart(page)).toHaveText('Starting…');
		await expect(ticketCards(page)).toHaveCount(0);
		await shot('backlog-start-starting');

		// Accepted is not running: no Plan card until a read lists the ticket.
		await expect(previewStart(page)).toHaveText('Start accepted', { timeout: 10_000 });
		await expect(cardStart(page)).toHaveText('Start accepted');
		await expect(preview(page)).toContainText('Waiting for the factory to show the ticket.');
		await expect(ticketCards(page)).toHaveCount(0);
		await expect(page).toHaveURL(/\?issue=/);
		await shot('backlog-start-accepted');

		release();
		await expect(page).toHaveURL(/\?ticket=fake-started-\d{8}$/, { timeout: 15_000 });
		const key = new URL(page.url()).searchParams.get('ticket')!;
		await expect(page.locator('#board-inspector-heading')).toBeVisible();
		await expect(page.getByRole('region', { name: 'Selected ticket' })).toContainText(key);
		await expect(page.getByTestId('ticket-inspector')).toContainText(key);
		await expect(preview(page)).toHaveCount(0);
		await expect(plan(page).locator(`[data-ticket-key="${key}"]`)).toHaveCount(1);
		await expect(card(page)).toHaveCount(0);
		await shot('backlog-start-handoff');
		await page.unroute('**/__data.json*');

		// The handoff replaced the preview's history entry: Back goes to the bare board.
		await page.goBack();
		await expect(page).toHaveURL(`${app.url}/`);
		expect(starts(fake)).toHaveLength(1);
		await html();
		expect(problems).toEqual([]);
	});
});

for (const [name, problem, message] of [
	['umbrella issue', problemUmbrellaIssue, START_FAILURES.umbrella],
	['tracker unavailable', problemTrackerUnavailable, START_FAILURES.tracker]
] as const) {
	test.describe(`a rejected start: ${name}`, () => {
		test.use({
			fakeOptions: { startAddsTicket: true, failCommand: { commands: ['start'], problem } }
		});

		test('keeps the card and the preview, and shows the reason', async ({
			page,
			app,
			fake,
			shot
		}) => {
			const { problems, html } = guard(page, app.url, fake.token);
			await gotoLive(page, SELECT_ISSUE);
			await previewStart(page).click();
			await expect(preview(page).locator('[data-slot="start-failure"]')).toHaveText(message);
			await expect(card(page).locator('[data-slot="start-failure"]')).toHaveText(message);
			await expect(card(page).getByRole('status')).toHaveText(message);
			await expect(page).toHaveURL(SELECT_ISSUE);
			await expect(card(page)).toHaveCount(1);
			await expect(preview(page).locator('[data-slot="issue-preview"]')).toContainText(ISSUE.title);
			await expect(ticketCards(page)).toHaveCount(0);
			await expect(previewStart(page)).toBeEnabled();
			await expect(cardStart(page)).toBeEnabled();
			expect(starts(fake)).toHaveLength(1);
			await shot(`backlog-start-rejected-${name.replace(' ', '-')}`);
			await html();
			expect(problems).toEqual([]);
		});
	});
}

test.describe('read-only access', () => {
	test.use({ fakeOptions: { canAct: false } });

	test('after the first refusal every Start is disabled with the access reason', async ({
		page,
		fake,
		shot
	}) => {
		await gotoLive(page, SELECT_ISSUE);
		await previewStart(page).click();
		await expect(previewStart(page)).toBeDisabled();
		const buttons = page.locator('[data-lane="backlog"] [data-slot="start-button"]');
		const count = await buttons.count();
		expect(count).toBeGreaterThan(1);
		for (let i = 0; i < count; i++) await expect(buttons.nth(i)).toBeDisabled();
		const reasons = page.locator('[data-lane="backlog"] [data-slot="start-reason"]');
		await expect(reasons).toHaveCount(count);
		for (let i = 0; i < count; i++) await expect(reasons.nth(i)).toHaveText(READ_ONLY);
		expect(starts(fake)).toHaveLength(1);
		await shot('backlog-start-read-only');
	});
});

test.describe('deduplication', () => {
	test.use({ fakeOptions: { startAddsTicket: true, startKeepsBacklogIssue: true } });

	test('the issue is never both a backlog card and a board ticket', async ({ page, shot }) => {
		await gotoLive(page, SELECT_ISSUE);
		// One DOM read: two locator counts could straddle a rerender and see both.
		const both = () =>
			page
				.evaluate(
					({ id, displayRef }) =>
						document.querySelector(
							`[data-lane="backlog"] [data-slot="backlog-card"] [data-issue-id="${CSS.escape(id)}"]`
						) !== null &&
						[...document.querySelectorAll('[data-slot="ticket-card"]')].some((el) =>
							el.textContent?.includes(displayRef)
						),
					{ id: ISSUE.id, displayRef: ISSUE.displayRef }
				)
				.catch(() => false); // a reload destroys the context mid-probe
		let seenBoth = false;
		let done = false;
		const watch = (async () => {
			while (!done) {
				if (await both()) seenBoth = true;
				await page.waitForTimeout(50);
			}
		})();
		await previewStart(page).click();
		await expect(page).toHaveURL(/\?ticket=fake-started-/, { timeout: 15_000 });
		await expect(ticketCards(page)).toHaveCount(1);
		await expect(card(page)).toHaveCount(0);
		// A reread while the factory still lists the issue in its backlog.
		await page.reload();
		await expect(ticketCards(page)).toHaveCount(1);
		await expect(card(page)).toHaveCount(0);
		done = true;
		await watch;
		expect(seenBoth).toBe(false);
		await shot('backlog-start-dedup');
	});
});

test.describe('an unconfirmed start', () => {
	test.use({
		fakeOptions: { failCommand: { commands: ['start'], problem: problemInternalError } }
	});

	test('offers Resend, which reuses the same intent id', async ({ page, fake, shot }) => {
		await gotoLive(page, SELECT_ISSUE);
		await cardStart(page).click();
		const resend = card(page).locator('[data-slot="start-resend"]');
		await expect(resend).toBeVisible();
		await expect(preview(page).locator('[data-slot="start-resend"]')).toBeVisible();
		await shot('backlog-start-unconfirmed');
		await resend.click();
		await expect.poll(() => starts(fake).length).toBe(2);
		const [first, second] = starts(fake);
		expect(second!.idempotencyKey).toBe(first!.idempotencyKey);
		expect(second!.body).toEqual({ ref: ISSUE.displayRef });
	});
});
