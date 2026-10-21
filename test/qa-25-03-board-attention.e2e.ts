import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import { toAttention } from '../src/lib/factory/attention.ts';
import {
	FAKE_FACTORY_TOKEN,
	agentList,
	openTickets,
	startFakeFactory,
	ticketDetails,
	type FakeFactoryOptions
} from './fake-factory';

// QA for ticket #25, task 03: the AttentionStrip on / wired to ?ticket= selection.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const onBoard = openTickets.filter((t) => t.status !== 'complete' && t.status !== 'cancelled');

/** What the strip should show for a needs-attention list, by the same projection. */
const modelFor = (tickets: typeof openTickets) => {
	const needs = tickets.filter((t) => t.needsUser);
	return toAttention({
		tickets: needs,
		complete: true,
		details: needs.map((t) => ticketDetails.get(t.key) ?? null)
	});
};

const strip = (page: Page) => page.locator('[data-slot="attention-strip"]');
const openNext = (page: Page) => strip(page).getByRole('button', { name: /^Open next/ });
const selected = (page: Page) => page.getByTestId('selected-ticket');
const allCards = (page: Page) => page.locator('[data-slot="ticket-card"]');
const lanes = (page: Page) => page.getByRole('region', { name: 'Flow board lanes' });

type Fake = { base: string; requests: () => { method: string; path: string }[] };

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions): Fake {
	let fake: Server;
	let requests: { method: string; path: string }[] = [];
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake, requests } = await startFakeFactory(fakePort, options));
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
	return { base: `http://localhost:${appPort}`, requests: () => requests };
}

test.describe('the default fixtures', () => {
	const fake = scenario(7841, 4241, {});
	const model = modelFor(openTickets);

	test('AC1, AC2: the strip sits above the lanes with the headline and reason groups; the load asks needsUser=true', async ({
		page
	}) => {
		await page.goto(`${fake.base}/`);
		await expect(strip(page)).toBeVisible();
		const stripBox = await strip(page).boundingBox();
		const lanesBox = await lanes(page).boundingBox();
		const summaryBox = await page.getByRole('list', { name: 'Board summary' }).boundingBox();
		expect(stripBox!.y).toBeGreaterThan(summaryBox!.y);
		expect(stripBox!.y + stripBox!.height).toBeLessThanOrEqual(lanesBox!.y);

		expect(model.headline.count).toBeGreaterThan(1);
		// Independent of the projection: the distinct needsUser tickets the fake serves.
		expect(model.headline.count).toBe(
			new Set(openTickets.filter((t) => t.needsUser).map((t) => t.key)).size
		);
		await expect(strip(page).getByRole('heading')).toHaveText(
			new RegExp(`^\\s*${model.headline.count}\\s+tickets need attention\\s*$`)
		);
		const groups = strip(page).locator('[data-slot="attention-group"]');
		await expect(groups).toHaveCount(model.groups.length);
		for (const [index, group] of model.groups.entries()) {
			await expect(groups.nth(index)).toHaveAttribute('data-reason', group.reason);
			await expect(groups.nth(index)).toContainText(group.label);
			await expect(groups.nth(index)).toContainText(String(group.count));
		}

		const attentionReads = fake
			.requests()
			.filter((r) => r.path.startsWith('/v1/tickets?') && r.path.includes('needsUser=true'));
		expect(attentionReads.length).toBeGreaterThan(0);
		expect(fake.requests().every((r) => r.method === 'GET')).toBe(true);
		await shot(page, 'ac1-attention-strip');
	});

	test('AC3: Open next selects the first queue ticket, then advances', async ({ page }) => {
		await page.goto(`${fake.base}/`);
		const [first, second] = model.queue;
		await expect(openNext(page)).toContainText(first!.displayRef);
		await openNext(page).click();
		await expect(page).toHaveURL(`${fake.base}/?ticket=${encodeURIComponent(first!.key)}`);
		await expect(selected(page)).toContainText(first!.displayRef);
		await expect(selected(page)).toContainText(first!.title);
		await shot(page, 'ac3-open-next-first');

		await expect(openNext(page)).toContainText(second!.displayRef);
		await openNext(page).click();
		await expect(page).toHaveURL(`${fake.base}/?ticket=${encodeURIComponent(second!.key)}`);
		await expect(selected(page)).toContainText(second!.title);
	});

	test('AC4: after selecting a card, Open next skips that ticket', async ({ page }) => {
		await page.goto(`${fake.base}/`);
		const [first, second] = model.queue;
		const card = allCards(page).filter({ hasText: first!.title });
		await card.click();
		await expect(page).toHaveURL(`${fake.base}/?ticket=${encodeURIComponent(first!.key)}`);
		await expect(openNext(page)).toContainText(second!.displayRef);
		await openNext(page).click();
		await expect(page).toHaveURL(`${fake.base}/?ticket=${encodeURIComponent(second!.key)}`);
		await expect(selected(page)).toContainText(second!.title);
	});

	test('AC7: the serialized page has no token or factory URL', async ({ page }) => {
		const response = await page.goto(`${fake.base}/`);
		const html = (await response?.text()) ?? '';
		const data = await (await page.request.get(`${fake.base}/__data.json`)).text();
		for (const text of [html, data]) {
			expect(text).not.toContain(FAKE_FACTORY_TOKEN);
			expect(text).not.toContain('127.0.0.1:7841');
		}
	});
});

test.describe('nothing needs attention', () => {
	const fake = scenario(7842, 4242, { tickets: openTickets.filter((t) => !t.needsUser) });

	test('AC5: the strip reads "No attention needed." with no Open next button', async ({ page }) => {
		await page.goto(`${fake.base}/`);
		await expect(strip(page)).toContainText('No attention needed.');
		await expect(openNext(page)).toHaveCount(0);
		await expect(allCards(page).first()).toBeVisible();
		await shot(page, 'ac5-no-attention');
	});
});

test.describe('the attention read fails', () => {
	const upstream = 'qa-25-03-upstream-body';
	const fake = scenario(7843, 4243, {
		failAttention: {
			status: 500,
			title: 'Internal error',
			type: 'internal_error',
			detail: upstream
		}
	});

	test('AC6: the strip shows its error; the lanes, summary and card selection keep working', async ({
		page
	}) => {
		const response = await page.goto(`${fake.base}/`);
		expect(response?.status()).toBe(200);
		await expect(strip(page).getByRole('alert')).toContainText('Attention unavailable.');
		await expect(openNext(page)).toHaveCount(0);
		await expect(page.getByText(upstream)).toHaveCount(0);

		await expect(allCards(page)).toHaveCount(onBoard.length);
		const summary = page.getByRole('list', { name: 'Board summary' });
		await expect(summary.getByRole('listitem').filter({ hasText: 'in progress' })).toContainText(
			String(onBoard.length)
		);
		await expect(summary.getByRole('listitem').filter({ hasText: 'agents running' })).toContainText(
			String(agentList.items.length)
		);

		const target = onBoard[0]!;
		await allCards(page).filter({ hasText: target.title }).click();
		await expect(page).toHaveURL(`${fake.base}/?ticket=${encodeURIComponent(target.key)}`);
		await expect(selected(page)).toContainText(target.title);
		await shot(page, 'ac6-attention-error');
	});
});
