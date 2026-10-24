import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import { backlogIssuePlain } from '../src/lib/factory/fixtures/backlog.ts';
import {
	problemInternalError,
	problemTrackerUnavailable,
	problemUmbrellaIssue
} from '../src/lib/factory/fixtures/problems.ts';
import {
	FAKE_FACTORY_TOKEN,
	startFakeFactory,
	type FakeCommandRequest,
	type FakeFactoryOptions
} from './fake-factory';
import { gotoLive } from './live';

// QA for ticket #30, task 03: the board start flow, against the built app.
const SHOTS =
	process.env.QA_DIR ??
	'/Users/deka/Projects/geut/factory-dashboard/.factory/tickets/dpaez-factory-dashboard-30-964882a5/qa/03/screenshots';
const shot = (page: Page, name: string) =>
	page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => undefined);

const ISSUE = backlogIssuePlain;

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
				() =>
					fetch(`${base}/robots.txt`).then(
						(r) => r.ok,
						() => false
					),
				{ timeout: 30_000 }
			)
			.toBe(true);
	});
	test.afterAll(async () => {
		app?.kill();
		await new Promise((resolve) => fake?.close(resolve));
	});
	const starts = async (): Promise<FakeCommandRequest[]> =>
		(
			(await (
				await fetch(`http://127.0.0.1:${fakePort}/__fake/commands`)
			).json()) as FakeCommandRequest[]
		).filter((c) => c.command === 'start');
	return { base, starts, open: (page: Page) => gotoLive(page, `${base}/?issue=${ISSUE.id}`) };
}

const backlog = (page: Page) => page.getByRole('group', { name: /^Backlog/ });
const plan = (page: Page) => page.getByRole('group', { name: /^Plan/ });
const card = (page: Page) =>
	backlog(page).locator('[data-slot="backlog-card"]').filter({ hasText: ISSUE.displayRef });
const preview = (page: Page) => page.getByRole('region', { name: 'Selected issue' });
/** Every ticket card on the board for the issue. */
const ticketCards = (page: Page) =>
	page.locator('[data-slot="ticket-card"]').filter({ hasText: ISSUE.displayRef });

test.describe('AC1', () => {
	const s = scenario(7991, 4391, { startAddsTicket: true, commandDelayMs: 1_500 });

	test('AC1: a double-click and repeated Enter on the card Start send one start', async ({
		page
	}) => {
		await s.open(page);
		const start = card(page).getByRole('button', { name: 'Start', exact: true });
		await start.dblclick();
		const busy = card(page).getByRole('button', { name: 'Starting…' });
		await expect(busy).toBeVisible();
		for (let i = 0; i < 4; i++) await busy.press('Enter');
		await preview(page)
			.getByRole('button', { name: 'Starting…' })
			.click({ timeout: 1_000 })
			.catch(() => {});
		await expect(page).toHaveURL(/\?ticket=/, { timeout: 15_000 });
		const sent = await s.starts();
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ ref: ISSUE.displayRef });
		expect(sent[0]!.idempotencyKey).toBeTruthy();
	});
});

test.describe('AC2', () => {
	const s = scenario(7992, 4392, { startAddsTicket: true, commandDelayMs: 1_500 });

	test('AC2: Starting…, then Start accepted, and not in Plan until a read lists the ticket', async ({
		page
	}) => {
		await s.open(page);
		// Hold the board's reread so the accepted state stays observable.
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route('**/__data.json*', async (route) => {
			await held;
			await route.continue();
		});
		await card(page).getByRole('button', { name: 'Start', exact: true }).click();
		await expect(card(page).getByRole('button', { name: 'Starting…' })).toBeVisible();
		await expect(preview(page).getByRole('button', { name: 'Starting…' })).toBeVisible();
		await expect(ticketCards(page)).toHaveCount(0);
		await shot(page, 'ac2-starting');

		await expect(card(page).getByRole('button', { name: 'Start accepted' })).toBeVisible({
			timeout: 10_000
		});
		await expect(preview(page).getByRole('button', { name: 'Start accepted' })).toBeVisible();
		await expect(
			plan(page).locator('[data-slot="ticket-card"]').filter({ hasText: ISSUE.displayRef })
		).toHaveCount(0);
		await expect(ticketCards(page)).toHaveCount(0);
		await expect(page).toHaveURL(/\?issue=/);
		await shot(page, 'ac2-start-accepted');

		release();
		await expect(page).toHaveURL(/\?ticket=/, { timeout: 15_000 });
		await expect(plan(page).locator('[data-slot="ticket-card"]')).not.toHaveCount(0);
		await page.unroute('**/__data.json*');
	});
});

test.describe('AC3', () => {
	const s = scenario(7993, 4393, { startAddsTicket: true });

	test('AC3: the selection becomes the new ticket’s inspector, replacing history', async ({
		page
	}) => {
		await page.goto(`${s.base}/`);
		await s.open(page);
		await expect(preview(page)).toBeVisible();
		await preview(page).getByRole('button', { name: 'Start', exact: true }).click();
		await expect(page).toHaveURL(/\?ticket=fake-started-[^&]+$/, { timeout: 15_000 });
		const key = new URL(page.url()).searchParams.get('ticket')!;
		const selected = page.getByRole('region', { name: 'Selected ticket' });
		await expect(selected).toContainText(key);
		await expect(preview(page)).toHaveCount(0);
		await expect(card(page)).toHaveCount(0);
		await expect(plan(page).locator(`[data-ticket-key="${key}"]`)).toHaveCount(1);
		await shot(page, 'ac3-ticket-inspector');
		// The preview's history entry was replaced: Back goes to the bare board.
		await page.goBack();
		await expect(page).toHaveURL(`${s.base}/`);
	});
});

for (const [name, fakePort, appPort, problem] of [
	['umbrella', 7994, 4394, problemUmbrellaIssue],
	['tracker', 7995, 4395, problemTrackerUnavailable]
] as const) {
	test.describe(`AC4 ${name}`, () => {
		const s = scenario(fakePort, appPort, {
			startAddsTicket: true,
			failCommand: { commands: ['start'], problem }
		});

		test(`AC4: a rejected start (${name}) keeps the card and preview with the reason`, async ({
			page
		}) => {
			await s.open(page);
			await card(page).getByRole('button', { name: 'Start', exact: true }).click();
			const cardReason = card(page).getByRole('status');
			const previewReason = preview(page).getByRole('status');
			await expect(cardReason).not.toBeEmpty();
			await expect(previewReason).toHaveText((await cardReason.textContent())!.trim());
			await expect(page).toHaveURL(/\?issue=/);
			await expect(card(page)).toHaveCount(1);
			await expect(preview(page)).toContainText(ISSUE.title);
			await expect(ticketCards(page)).toHaveCount(0);
			await expect(card(page).getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
			await shot(page, `ac4-rejected-${name}`);
		});
	});
}

test.describe('AC5', () => {
	const s = scenario(7996, 4396, { startAddsTicket: true, startKeepsBacklogIssue: true });

	test('AC5: the issue is never both a backlog card and a board ticket card', async ({ page }) => {
		await s.open(page);
		let both = 0;
		let done = false;
		const watch = (async () => {
			while (!done) {
				const n = await page
					.evaluate((ref) => {
						const has = (sel: string) =>
							[...document.querySelectorAll(sel)].some((el) => el.textContent?.includes(ref));
						return has('[data-lane="backlog"] [data-slot="backlog-card"]') &&
							has('[data-slot="ticket-card"]')
							? 1
							: 0;
					}, ISSUE.displayRef)
					.catch(() => 0); // a reload destroys the context mid-probe
				both += n;
				await page.waitForTimeout(50);
			}
		})();
		await card(page).getByRole('button', { name: 'Start', exact: true }).click();
		await expect(page).toHaveURL(/\?ticket=/, { timeout: 15_000 });
		await expect(ticketCards(page)).toHaveCount(1);
		await expect(card(page)).toHaveCount(0);
		// A reread while the factory still lists the issue in its backlog.
		await page.reload();
		await expect(ticketCards(page)).toHaveCount(1);
		await expect(card(page)).toHaveCount(0);
		done = true;
		await watch;
		expect(both).toBe(0);
		await shot(page, 'ac5-dedup');
	});
});

test.describe('AC6', () => {
	const s = scenario(7997, 4397, {
		failCommand: { commands: ['start'], problem: problemInternalError }
	});

	test('AC6: an unconfirmed start offers Resend under the same intent id', async ({ page }) => {
		await s.open(page);
		await card(page).getByRole('button', { name: 'Start', exact: true }).click();
		const resend = card(page).getByRole('button', { name: 'Resend' });
		await expect(resend).toBeVisible();
		await expect(preview(page).getByRole('button', { name: 'Resend' })).toBeVisible();
		await shot(page, 'ac6-unconfirmed-resend');
		await resend.click();
		await expect.poll(async () => (await s.starts()).length).toBe(2);
		const [first, second] = await s.starts();
		expect(second!.idempotencyKey).toBe(first!.idempotencyKey);
		expect(second!.body).toEqual({ ref: ISSUE.displayRef });
	});
});
