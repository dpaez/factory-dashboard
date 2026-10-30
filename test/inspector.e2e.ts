import type { Page } from '@playwright/test';

import {
	ticketCompleteInDone,
	ticketDetailActiveInWork,
	ticketDetailMultiExecution,
	ticketDetailMultiExecutionFirst
} from '../src/lib/factory/fixtures/tickets.ts';
import { openTickets } from './fake-factory.ts';
import { expect, test } from './fixtures.ts';

// The Inspector on the Flow board (`/?ticket=`) and on the ticket page: where
// it opens, how tab, execution, Open ticket, Back and Close move the URL and
// focus, and what it does when the ticket is unknown or its read fails. The
// Activity and Evidence tabs are in run-evidence.e2e.ts, commands in commands.e2e.ts.

const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const card = (page: Page, key: string) =>
	page.locator(`[data-slot="ticket-card"][data-ticket-key="${key}"]`);
const board = (key: string, query = '') => `/?ticket=${encodeURIComponent(key)}${query}`;
const ticketPage = (key: string, query = '') => `/tickets/${encodeURIComponent(key)}${query}`;
const WORK = ticketDetailActiveInWork;
const MULTI = ticketDetailMultiExecution.key;

const drawer = (page: Page) => page.locator('[data-slot="board-drawer"]');

test.describe('opening from the board', () => {
	test('clicking a card opens the drawer over the board with ?ticket=<key>', async ({
		page,
		shot
	}) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		await card(page, WORK.key).click();
		await expect(page).toHaveURL(board(WORK.key));

		const region = inspector(page);
		await expect(region).toHaveAttribute('data-state', 'loaded');
		await expect(region.getByRole('heading', { level: 2 })).toHaveText(WORK.title);
		await expect(region.getByTestId('execution')).toContainText(String(WORK.execution));
		await expect(region.locator('[data-slot="ticket-header"] [data-signal]').first()).toHaveText(
			'Active'
		);
		await expect(region.getByRole('tab', { name: 'Tasks' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(region.getByTestId('tasks')).toBeVisible();

		// Over the lanes, not below them, and the page did not scroll. Focus stays on the card.
		const lanes = await page.getByRole('region', { name: 'Flow board lanes' }).boundingBox();
		const box = await drawer(page).boundingBox();
		expect(box!.y).toBeGreaterThanOrEqual(lanes!.y - 1);
		expect(box!.y).toBeLessThan(lanes!.y + lanes!.height);
		await expect(drawer(page)).toBeInViewport();
		await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);
		await expect(card(page, WORK.key)).toBeFocused();
		await shot('inspector-board');
	});

	test('on a short viewport, the drawer stays on screen and the page does not scroll', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1280, height: 500 });
		await page.goto('/');
		await card(page, WORK.key).click();
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		const heading = inspector(page).getByRole('heading', { level: 2 });
		await expect(heading).toHaveText(WORK.title);
		await expect(drawer(page)).toBeInViewport();
		await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);
		await expect(card(page, WORK.key)).toBeFocused();
	});

	test('on a tall viewport, opening keeps the drawer and the heading on screen', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto('/');
		await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);
		await expect(card(page, WORK.key)).toBeInViewport();

		await card(page, WORK.key).click();
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		const heading = inspector(page).getByRole('heading', { level: 2 });
		await expect(heading).toHaveText(WORK.title);
		await expect(heading).toBeInViewport({ ratio: 1 });
		await expect(drawer(page)).toBeInViewport();
		await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);
		await expect(card(page, WORK.key)).toBeFocused();
	});
});

test.describe('tab and execution in the URL', () => {
	test('choosing the Usage tab on the board writes tab=usage; Back returns to Tasks', async ({
		page,
		shot
	}) => {
		await page.goto(board(WORK.key));
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		await inspector(page).getByRole('tab', { name: 'Usage' }).click();
		await expect(page).toHaveURL(board(WORK.key, '&tab=usage'));
		await expect(inspector(page).getByTestId('usage-total')).toBeVisible();
		await shot('inspector-board-usage-tab');

		await page.goBack();
		await expect(page).toHaveURL(board(WORK.key));
		await expect(inspector(page).getByRole('tab', { name: 'Tasks' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(inspector(page).getByTestId('tasks')).toBeVisible();
	});

	test('choosing execution 1 on the board shows it read-only; Back returns to the current one', async ({
		page,
		shot
	}) => {
		await page.goto(board(MULTI));
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		await expect(inspector(page).getByTestId('past-execution')).toHaveCount(0);

		await inspector(page)
			.getByTestId('executions')
			.getByRole('link', { name: 'Execution 1' })
			.click();
		await expect(page).toHaveURL(board(MULTI, '&execution=1'));
		await expect(inspector(page)).toHaveAttribute('data-execution', '1');
		await expect(inspector(page).getByTestId('past-execution')).toContainText(
			'Past execution 1, read-only'
		);
		await shot('inspector-board-past-execution');

		await page.goBack();
		await expect(page).toHaveURL(board(MULTI));
		await expect(inspector(page)).toHaveAttribute(
			'data-execution',
			String(ticketDetailMultiExecution.execution)
		);
		await expect(inspector(page).getByTestId('past-execution')).toHaveCount(0);
	});

	test("/tickets/<key>?execution=1&tab=usage is the same Inspector, read-only, on execution 1's usage", async ({
		page,
		shot
	}) => {
		const response = await page.goto(ticketPage(MULTI, '?execution=1&tab=usage'));
		expect(response?.status()).toBe(200);
		const region = inspector(page);
		await expect(region).toHaveAttribute('data-state', 'loaded');
		await expect(region).toHaveAttribute('data-execution', '1');
		await expect(region.getByTestId('past-execution')).toContainText('Past execution 1, read-only');
		await expect(region.getByRole('tab', { name: 'Usage' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(region.getByTestId('usage-total')).toContainText(
			`$${ticketDetailMultiExecutionFirst.usage.costUsd.toFixed(2)}`
		);
		// The ticket page has no Close.
		await expect(region.getByRole('button', { name: 'Close inspector' })).toHaveCount(0);
		// The execution links keep the tab.
		await expect(
			region.getByTestId('executions').getByRole('link', { name: 'Execution 1' })
		).toHaveAttribute('href', ticketPage(MULTI, '?execution=1&tab=usage'));
		await shot('inspector-ticket-page-usage');

		// A tab change on the ticket page pushes history too.
		await region.getByRole('tab', { name: 'Tasks' }).click();
		await expect(page).toHaveURL(ticketPage(MULTI, '?execution=1'));
		await page.goBack();
		await expect(page).toHaveURL(ticketPage(MULTI, '?execution=1&tab=usage'));
		await expect(region.getByRole('tab', { name: 'Usage' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
	});
});

test.describe('Open ticket and Close', () => {
	test('Open ticket keeps execution and tab; Back returns to the board with the Inspector', async ({
		page
	}) => {
		await page.goto(board(MULTI, '&execution=1&tab=usage'));
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		const open = inspector(page).getByRole('link', { name: 'Open ticket' });
		await expect(open).toHaveAttribute('href', ticketPage(MULTI, '?execution=1&tab=usage'));
		await open.click();
		await expect(page).toHaveURL(ticketPage(MULTI, '?execution=1&tab=usage'));
		await expect(inspector(page).getByRole('button', { name: 'Close inspector' })).toHaveCount(0);

		await page.goBack();
		await expect(page).toHaveURL(board(MULTI, '&execution=1&tab=usage'));
		await expect(page.getByRole('heading', { name: 'Flow board', level: 2 })).toBeVisible();
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		await expect(inspector(page)).toHaveAttribute('data-execution', '1');
		await expect(inspector(page).getByRole('tab', { name: 'Usage' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
	});

	test('Escape closes the drawer and focuses the card', async ({ page }) => {
		await page.goto('/');
		await card(page, WORK.key).click();
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		await page.keyboard.press('Escape');
		await expect(page).toHaveURL('/');
		await expect(inspector(page)).toHaveCount(0);
		await expect(card(page, WORK.key)).toBeFocused();
	});

	test("Close removes the Inspector and ticket from the URL and focuses the ticket's card", async ({
		page,
		shot
	}) => {
		await page.goto(board(WORK.key, '&tab=usage'));
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		await inspector(page).getByRole('button', { name: 'Close inspector' }).click();
		await expect(page).toHaveURL('/');
		await expect(inspector(page)).toHaveCount(0);
		await expect(card(page, WORK.key)).toBeFocused();
		await shot('inspector-closed');
	});

	test('a finished ticket with no card shows its Inspector; Close falls back to the board heading', async ({
		page,
		shot
	}) => {
		const finished = ticketCompleteInDone;
		expect(openTickets.some((ticket) => ticket.key === finished.key)).toBe(false);
		await page.goto(board(finished.key));
		await expect(card(page, finished.key)).toHaveCount(0);
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(finished.title);
		await shot('inspector-finished-ticket');

		await inspector(page).getByRole('button', { name: 'Close inspector' }).click();
		await expect(page).toHaveURL('/');
		await expect(
			page.getByRole('heading', { name: 'Flow board', exact: true, level: 2 })
		).toBeFocused();
	});
});

test('an unknown key shows not found while the board keeps working', async ({ page, shot }) => {
	await page.goto(board('no-such-ticket-00000000'));
	await expect(inspector(page)).toHaveAttribute('data-state', 'not_found');
	await expect(inspector(page).getByRole('heading', { name: 'No such ticket' })).toBeVisible();
	await shot('inspector-not-found');

	// The board still selects.
	await card(page, WORK.key).click();
	await expect(page).toHaveURL(board(WORK.key));
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
});

test('no token, factory URL or host in the board page or the Inspector reads; the factory sees only GETs', async ({
	page,
	fake
}) => {
	const reads: string[] = [];
	page.on('response', async (response) => {
		if (new URL(response.url()).pathname.startsWith('/api/factory/tickets/')) {
			reads.push(await response.text());
		}
	});
	const response = await page.goto(board(MULTI, '&execution=1&tab=usage'));
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
	const html = (await response?.text()) ?? '';
	// An unknown key's failure answer too.
	await page.goto(board('no-such-ticket-00000000'));
	await expect(inspector(page)).toHaveAttribute('data-state', 'not_found');
	const data = await (
		await page.request.get(`/__data.json?ticket=${encodeURIComponent(MULTI)}`)
	).text();
	expect(reads.length).toBeGreaterThanOrEqual(2);
	for (const text of [html, data, ...reads]) {
		expect(text).not.toContain(fake.token);
		expect(text).not.toContain(fake.url);
		expect(text).not.toContain(new URL(fake.url).host);
	}
	// The root load is selection-free: its data does not carry the ticket.
	expect(data).not.toContain(ticketDetailMultiExecutionFirst.tasks[0]!.title);
	expect(fake.requests().every((request) => request.method === 'GET')).toBe(true);
});

test.describe('the Inspector read fails', () => {
	test.use({
		fakeOptions: {
			failRuns: {
				status: 500,
				title: 'Internal error',
				type: 'internal_error',
				detail: 'inspector-read-problem-detail'
			}
		}
	});

	test('the Inspector shows the error with Retry; the board keeps working', async ({
		page,
		shot
	}) => {
		let reads = 0;
		page.on('request', (request) => {
			if (new URL(request.url()).pathname.startsWith('/api/factory/tickets/')) reads++;
		});
		await page.goto(board(WORK.key));
		await expect(inspector(page)).toHaveAttribute('data-state', 'error');
		await expect(page.getByText('inspector-read-problem-detail')).toHaveCount(0);
		const retry = inspector(page).getByRole('button', { name: 'Retry' });
		await expect(retry).toBeVisible();
		await expect(card(page, WORK.key)).toBeVisible();
		await shot('inspector-error-retry');

		const before = reads;
		await retry.click();
		await expect.poll(() => reads).toBeGreaterThan(before);
		await expect(inspector(page)).toHaveAttribute('data-state', 'error');
	});
});
