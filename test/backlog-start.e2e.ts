import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import { backlogIssuePlain } from '../src/lib/factory/fixtures/backlog.ts';
import {
	problemInternalError,
	problemTrackerUnavailable,
	problemUmbrellaIssue
} from '../src/lib/factory/fixtures/problems.ts';
import { START_FAILURES } from '../src/lib/factory/start.ts';
import {
	FAKE_FACTORY_TOKEN,
	startFakeFactory,
	type FakeCommandRequest,
	type FakeFactoryOptions
} from './fake-factory';
import { gotoLive } from './live';

// Ticket #30, task 03: Start on the board, against the built app and its own
// fake factory per scenario.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const ISSUE = backlogIssuePlain;
const READ_ONLY = "Action access required: this dashboard's token cannot send commands.";

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions = {}) {
	let fake: Server;
	let app: ChildProcess;
	const base = `http://localhost:${appPort}`;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, options));
		app = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(appPort),
				FACTORY_API_URL: `http://127.0.0.1:${fakePort}`,
				FACTORY_API_TOKEN: FAKE_FACTORY_TOKEN,
				ORIGIN: base
			},
			stdio: 'ignore'
		});
		await expect
			.poll(
				async () => {
					try {
						return (await fetch(`${base}/robots.txt`)).status > 0;
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
	return {
		base,
		starts: async (): Promise<FakeCommandRequest[]> =>
			(
				(await (
					await fetch(`http://127.0.0.1:${fakePort}/__fake/commands`)
				).json()) as FakeCommandRequest[]
			).filter((command) => command.command === 'start')
	};
}

/**
 * Every browser request stays on the app's origin, no request names the
 * token, and neither the page HTML nor any answer the browser reads names the
 * token or the factory's address.
 */
function guard(page: Page, base: string) {
	const problems: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.origin !== base) problems.push(`off-origin ${request.url()}`);
		if (JSON.stringify(request.headers()).includes(FAKE_FACTORY_TOKEN)) {
			problems.push(`token in request ${url.pathname}`);
		}
	});
	page.on('response', async (response) => {
		const url = new URL(response.url());
		if (url.pathname.startsWith('/api/factory/events')) return; // never ends
		const text = await response.text().catch(() => '');
		for (const leak of [FAKE_FACTORY_TOKEN, '127.0.0.1:', 'Bearer ']) {
			if (text.includes(leak)) problems.push(`${url.pathname} answer leaks ${leak}`);
		}
	});
	return {
		problems,
		async html() {
			const html = await page.content();
			for (const leak of [FAKE_FACTORY_TOKEN, '127.0.0.1:', 'Bearer ']) {
				if (html.includes(leak)) problems.push(`page HTML leaks ${leak}`);
			}
		}
	};
}

const card = (page: Page, id: string) =>
	page.locator('[data-lane="backlog"] [data-slot="backlog-card"]').filter({
		has: page.locator(`[data-issue-id="${id}"]`)
	});
const cardStart = (page: Page, id: string) => card(page, id).locator('[data-slot="start-button"]');
const preview = (page: Page) => page.getByTestId('selected-issue');
const previewStart = (page: Page) => preview(page).locator('[data-slot="start-button"]');
const ticketCard = (page: Page, key: string) =>
	page.locator(`[data-slot="ticket-card"][data-ticket-key="${key}"]`);
/** Any ticket card for the issue's display reference. */
const ticketCardFor = (page: Page, displayRef: string) =>
	page.locator('[data-slot="ticket-card"]').filter({ hasText: displayRef });

const selectIssue = (base: string, id: string) => `${base}/?issue=${encodeURIComponent(id)}`;

test.describe('one start per action', () => {
	const { base, starts } = scenario(7981, 4381, { startAddsTicket: true, commandDelayMs: 1_500 });

	test('a double-click and repeated Enter send one start with one key', async ({ page }) => {
		const { problems, html } = guard(page, base);
		await gotoLive(page, selectIssue(base, ISSUE.id));
		const start = previewStart(page);
		await expect(start).toBeEnabled();
		await start.dblclick();
		await expect(start).toHaveText('Starting…');
		for (let i = 0; i < 5; i++) await start.press('Enter');
		await cardStart(page, ISSUE.id)
			.click({ timeout: 1_000 })
			.catch(() => {});
		await expect(page).toHaveURL(/\?ticket=fake-started-/, { timeout: 15_000 });

		const sent = await starts();
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ ref: ISSUE.displayRef });
		expect(sent[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
		await html();
		expect(problems).toEqual([]);
	});
});

test.describe('the handoff', () => {
	const { base, starts } = scenario(7982, 4382, { startAddsTicket: true, commandDelayMs: 2_000 });

	test('Starting…, then Start accepted, then the new ticket’s inspector', async ({ page }) => {
		const { problems, html } = guard(page, base);
		await gotoLive(page, selectIssue(base, ISSUE.id));
		await previewStart(page).click();
		await expect(previewStart(page)).toHaveText('Starting…');
		await expect(cardStart(page, ISSUE.id)).toHaveText('Starting…');
		// Accepted is not running: no Plan card until a read lists the ticket.
		await expect(ticketCardFor(page, ISSUE.displayRef)).toHaveCount(0);
		await shot(page, 'backlog-start-starting');

		await expect(page).toHaveURL(/\?ticket=fake-started-\d{8}$/, { timeout: 15_000 });
		const key = new URL(page.url()).searchParams.get('ticket')!;
		await expect(page.locator('#board-inspector-heading')).toBeVisible();
		await expect(page.getByTestId('ticket-inspector')).toContainText(key);
		await expect(ticketCard(page, key)).toHaveCount(1);
		await expect(page.locator('[data-lane="plan"]').locator(ticketCard(page, key))).toHaveCount(1);
		await expect(card(page, ISSUE.id)).toHaveCount(0);
		await shot(page, 'backlog-start-handoff');

		// The handoff replaced the preview's history entry.
		await page.goBack();
		await expect(page).not.toHaveURL(/\?issue=/);
		expect(await starts()).toHaveLength(1);
		await html();
		expect(problems).toEqual([]);
	});
});

test.describe('the accepted state', () => {
	const { base } = scenario(7983, 4383, { startAddsTicket: true });

	test('Start accepted shows while the factory has not been reread', async ({ page }) => {
		await gotoLive(page, selectIssue(base, ISSUE.id));
		// Hold the board's reread so the accepted state, before a read lists the ticket, is observable.
		await page.route('**/__data.json*', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 2_000));
			await route.continue();
		});
		await previewStart(page).click();
		await expect(previewStart(page)).toHaveText('Start accepted', { timeout: 10_000 });
		await expect(cardStart(page, ISSUE.id)).toHaveText('Start accepted');
		await expect(preview(page)).toContainText('Waiting for the factory to show the ticket.');
		await expect(ticketCardFor(page, ISSUE.displayRef)).toHaveCount(0);
		await shot(page, 'backlog-start-accepted');
		await expect(page).toHaveURL(/\?ticket=fake-started-/, { timeout: 15_000 });
		await page.unroute('**/__data.json*');
	});
});

for (const [name, fakePort, appPort, problem, message] of [
	['umbrella issue', 7984, 4384, problemUmbrellaIssue, START_FAILURES.umbrella],
	['tracker unavailable', 7985, 4385, problemTrackerUnavailable, START_FAILURES.tracker]
] as const) {
	test.describe(`a rejected start: ${name}`, () => {
		const { base, starts } = scenario(fakePort, appPort, {
			startAddsTicket: true,
			failCommand: { commands: ['start'], problem }
		});

		test('keeps the card and the preview, and shows the reason', async ({ page }) => {
			const { problems, html } = guard(page, base);
			await gotoLive(page, selectIssue(base, ISSUE.id));
			await previewStart(page).click();
			await expect(preview(page).locator('[data-slot="start-failure"]')).toHaveText(message);
			await expect(card(page, ISSUE.id).locator('[data-slot="start-failure"]')).toHaveText(message);
			await expect(page).toHaveURL(selectIssue(base, ISSUE.id));
			await expect(card(page, ISSUE.id)).toHaveCount(1);
			await expect(preview(page).locator('[data-slot="issue-preview"]')).toContainText(ISSUE.title);
			await expect(ticketCardFor(page, ISSUE.displayRef)).toHaveCount(0);
			await expect(previewStart(page)).toBeEnabled();
			expect(await starts()).toHaveLength(1);
			await shot(page, `backlog-start-rejected-${name.replace(' ', '-')}`);
			await html();
			expect(problems).toEqual([]);
		});
	});
}

test.describe('read-only access', () => {
	const { base, starts } = scenario(7986, 4386, { canAct: false });

	test('after the first refusal every Start is disabled with the access reason', async ({
		page
	}) => {
		await gotoLive(page, selectIssue(base, ISSUE.id));
		await previewStart(page).click();
		await expect(previewStart(page)).toBeDisabled();
		const buttons = page.locator('[data-lane="backlog"] [data-slot="start-button"]');
		const count = await buttons.count();
		expect(count).toBeGreaterThan(1);
		for (let i = 0; i < count; i++) await expect(buttons.nth(i)).toBeDisabled();
		const reasons = page.locator('[data-lane="backlog"] [data-slot="start-reason"]');
		await expect(reasons).toHaveCount(count);
		for (let i = 0; i < count; i++) await expect(reasons.nth(i)).toHaveText(READ_ONLY);
		expect(await starts()).toHaveLength(1);
		await shot(page, 'backlog-start-read-only');
	});
});

test.describe('deduplication', () => {
	const { base } = scenario(7987, 4387, { startAddsTicket: true, startKeepsBacklogIssue: true });

	test('the issue is never both a backlog card and a board ticket', async ({ page }) => {
		await gotoLive(page, selectIssue(base, ISSUE.id));
		// One DOM read: two locator counts could straddle a rerender and see both.
		const both = () =>
			page.evaluate(
				({ id, displayRef }) =>
					document.querySelector(
						`[data-lane="backlog"] [data-slot="backlog-card"] [data-issue-id="${CSS.escape(id)}"]`
					) !== null &&
					[...document.querySelectorAll('[data-slot="ticket-card"]')].some((el) =>
						el.textContent?.includes(displayRef)
					),
				{ id: ISSUE.id, displayRef: ISSUE.displayRef }
			);
		let seenBoth = false;
		const watch = (async () => {
			for (let i = 0; i < 60 && !seenBoth; i++) {
				if (await both()) seenBoth = true;
				await page.waitForTimeout(100);
			}
		})();
		await previewStart(page).click();
		await expect(page).toHaveURL(/\?ticket=fake-started-/, { timeout: 15_000 });
		await expect(ticketCardFor(page, ISSUE.displayRef)).toHaveCount(1);
		await expect(card(page, ISSUE.id)).toHaveCount(0);
		await watch;
		expect(seenBoth).toBe(false);
		await shot(page, 'backlog-start-dedup');
	});
});

test.describe('an unconfirmed start', () => {
	const { base, starts } = scenario(7988, 4388, {
		failCommand: { commands: ['start'], problem: problemInternalError }
	});

	test('offers Resend, which reuses the same intent id', async ({ page }) => {
		await gotoLive(page, selectIssue(base, ISSUE.id));
		await previewStart(page).click();
		const resend = preview(page).locator('[data-slot="start-resend"]');
		await expect(resend).toBeVisible();
		await expect(card(page, ISSUE.id).locator('[data-slot="start-resend"]')).toBeVisible();
		await shot(page, 'backlog-start-unconfirmed');
		await resend.click();
		await expect.poll(async () => (await starts()).length).toBe(2);
		const [first, second] = await starts();
		expect(second!.idempotencyKey).toBe(first!.idempotencyKey);
		expect(second!.body).toEqual({ ref: ISSUE.displayRef });
	});
});
