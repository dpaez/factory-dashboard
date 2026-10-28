import type { Page } from '@playwright/test';

import { toAttention } from '../src/lib/factory/attention.ts';
import { agentList, openTickets, ticketDetails } from './fake-factory.ts';
import { expect, test } from './fixtures.ts';

// The attention strip on /: headline and reason groups from the needsUser
// read, Open next wired to `?ticket=` selection, and its empty and error states.

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
const selected = (page: Page) => page.getByTestId('ticket-inspector');
const allCards = (page: Page) => page.locator('[data-slot="ticket-card"]');
const lanes = (page: Page) => page.getByRole('region', { name: 'Flow board lanes' });
const selectedUrl = (key: string) => `/?ticket=${encodeURIComponent(key)}`;

test.describe('the default fixtures', () => {
	const model = modelFor(openTickets);

	test('the strip sits above the lanes with the headline and reason groups; the load asks needsUser=true', async ({
		page,
		fake,
		shot
	}) => {
		await page.goto('/');
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
		await shot('attention-strip');
	});

	test('Open next selects the first queue ticket, then advances', async ({ page, shot }) => {
		await page.goto('/');
		const [first, second] = model.queue;
		await expect(openNext(page)).toContainText(first!.displayRef);
		await openNext(page).click();
		await expect(page).toHaveURL(selectedUrl(first!.key));
		await expect(selected(page)).toContainText(first!.displayRef);
		await expect(selected(page)).toContainText(first!.title);
		await shot('attention-open-next-first');

		await expect(openNext(page)).toContainText(second!.displayRef);
		await openNext(page).click();
		await expect(page).toHaveURL(selectedUrl(second!.key));
		await expect(selected(page)).toContainText(second!.title);
	});

	test('after selecting a card, Open next skips that ticket', async ({ page }) => {
		await page.goto('/');
		const [first, second] = model.queue;
		await allCards(page).filter({ hasText: first!.title }).click();
		await expect(page).toHaveURL(selectedUrl(first!.key));
		await expect(openNext(page)).toContainText(second!.displayRef);
		await openNext(page).click();
		await expect(page).toHaveURL(selectedUrl(second!.key));
		await expect(selected(page)).toContainText(second!.title);
	});
});

test.describe('nothing needs attention', () => {
	test.use({ fakeOptions: { tickets: openTickets.filter((t) => !t.needsUser) } });

	test('the strip reads "No attention needed." with no Open next button', async ({
		page,
		shot
	}) => {
		await page.goto('/');
		await expect(strip(page)).toContainText('No attention needed.');
		await expect(openNext(page)).toHaveCount(0);
		await expect(allCards(page).first()).toBeVisible();
		await shot('attention-none');
	});
});

test.describe('the attention read fails', () => {
	const upstream = 'attention-upstream-problem-detail';
	test.use({
		fakeOptions: {
			failAttention: {
				status: 500,
				title: 'Internal error',
				type: 'internal_error',
				detail: upstream
			}
		}
	});

	test('the strip shows its error; the lanes, summary and card selection keep working', async ({
		page,
		shot
	}) => {
		const response = await page.goto('/');
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
		await expect(page).toHaveURL(selectedUrl(target.key));
		await expect(selected(page)).toContainText(target.title);
		await shot('attention-error');
	});
});
