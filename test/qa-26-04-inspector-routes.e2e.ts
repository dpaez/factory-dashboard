import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	ticketCompleteInDone,
	ticketDetailActiveInWork,
	ticketDetailMultiExecution,
	ticketDetailMultiExecutionFirst
} from '../src/lib/factory/fixtures/tickets.ts';
import {
	FAKE_FACTORY_TOKEN,
	FAKE_FACTORY_URL,
	openTickets,
	startFakeFactory
} from './fake-factory';

// QA for ticket #26, task 04: the Inspector on the Flow board and the ticket page.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const card = (page: Page, key: string) =>
	page.locator(`[data-slot="ticket-card"][data-ticket-key="${key}"]`);
const board = (key: string, query = '') => `/?ticket=${encodeURIComponent(key)}${query}`;
const ticketPage = (key: string, query = '') => `/tickets/${encodeURIComponent(key)}${query}`;
const MULTI = ticketDetailMultiExecution.key;

async function factoryRequests(): Promise<{ method: string; path: string }[]> {
	return (await fetch(`${FAKE_FACTORY_URL}/__fake/requests`)).json();
}

test('AC1: clicking a card shows the Inspector below the board with ?ticket=<key>', async ({
	page
}) => {
	const ticket = ticketDetailActiveInWork;
	await page.goto('/');
	await card(page, ticket.key).click();
	await expect(page).toHaveURL(board(ticket.key));

	const region = inspector(page);
	await expect(region).toHaveAttribute('data-state', 'loaded');
	await expect(region.getByRole('heading', { level: 2 })).toHaveText(ticket.title);
	await expect(region.getByTestId('execution')).toContainText(String(ticket.execution));
	await expect(region.locator('[data-slot="ticket-header"] [data-signal]').first()).toHaveText(
		'Active'
	);
	await expect(region.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true');
	await expect(region.getByTestId('tasks')).toBeVisible();

	// Below the board, and selecting kept focus on the card.
	const lanes = await page.getByRole('region', { name: 'Flow board lanes' }).boundingBox();
	const box = await region.boundingBox();
	expect(box!.y).toBeGreaterThanOrEqual(lanes!.y + lanes!.height);
	await expect(card(page, ticket.key)).toBeFocused();
	await shot(page, 'ac1-board-inspector');
});

test('AC1: on a short viewport, opening scrolls the offscreen Inspector into view', async ({
	page
}) => {
	const ticket = ticketDetailActiveInWork;
	await page.setViewportSize({ width: 1280, height: 500 });
	await page.goto('/');
	await card(page, ticket.key).click();
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
	const heading = inspector(page).getByRole('heading', { level: 2 });
	await expect(heading).toHaveText(ticket.title);
	await expect(heading).toBeInViewport({ ratio: 1 });
	await expect(card(page, ticket.key)).toBeFocused();
});

test('AC1: when only the top of the region is onscreen, opening still scrolls the heading into view', async ({
	page
}) => {
	const ticket = ticketDetailActiveInWork;
	// Size the viewport so the region (24px below the lanes) starts onscreen, but
	// the heading below its Open ticket row is past the bottom edge.
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/');
	const lanes = await page.getByRole('region', { name: 'Flow board lanes' }).boundingBox();
	const height = Math.ceil(lanes!.y + lanes!.height + 24 + 8);
	await page.setViewportSize({ width: 1280, height });
	await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);
	await expect(card(page, ticket.key)).toBeInViewport();

	await card(page, ticket.key).click();
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
	const heading = inspector(page).getByRole('heading', { level: 2 });
	await expect(heading).toHaveText(ticket.title);
	await expect(heading).toBeInViewport({ ratio: 1 });
	await expect(card(page, ticket.key)).toBeFocused();
});

test('AC2: choosing the Usage tab on the board writes tab=usage; Back returns to Tasks', async ({
	page
}) => {
	const key = ticketDetailActiveInWork.key;
	await page.goto(board(key));
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
	await inspector(page).getByRole('tab', { name: 'Usage' }).click();
	await expect(page).toHaveURL(board(key, '&tab=usage'));
	await expect(inspector(page).getByTestId('usage-total')).toBeVisible();
	await shot(page, 'ac2-board-usage-tab');

	await page.goBack();
	await expect(page).toHaveURL(board(key));
	await expect(inspector(page).getByRole('tab', { name: 'Tasks' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(inspector(page).getByTestId('tasks')).toBeVisible();
});

test('AC3: choosing execution 1 on the board shows it read-only; Back returns to the current one', async ({
	page
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
	await shot(page, 'ac3-board-past-execution');

	await page.goBack();
	await expect(page).toHaveURL(board(MULTI));
	await expect(inspector(page)).toHaveAttribute(
		'data-execution',
		String(ticketDetailMultiExecution.execution)
	);
	await expect(inspector(page).getByTestId('past-execution')).toHaveCount(0);
});

test("AC4: /tickets/<key>?execution=1&tab=usage is the same Inspector, read-only, on execution 1's usage", async ({
	page
}) => {
	const response = await page.goto(ticketPage(MULTI, '?execution=1&tab=usage'));
	expect(response?.status()).toBe(200);
	const region = inspector(page);
	await expect(region).toHaveAttribute('data-state', 'loaded');
	await expect(region).toHaveAttribute('data-execution', '1');
	await expect(region.getByTestId('past-execution')).toContainText('Past execution 1, read-only');
	await expect(region.getByRole('tab', { name: 'Usage' })).toHaveAttribute('aria-selected', 'true');
	await expect(region.getByTestId('usage-total')).toContainText(
		`$${ticketDetailMultiExecutionFirst.usage.costUsd.toFixed(2)}`
	);
	// The ticket page has no Close.
	await expect(region.getByRole('button', { name: 'Close inspector' })).toHaveCount(0);
	// The execution links keep the tab.
	await expect(
		region.getByTestId('executions').getByRole('link', { name: 'Execution 1' })
	).toHaveAttribute('href', ticketPage(MULTI, '?execution=1&tab=usage'));
	await shot(page, 'ac4-ticket-page-usage');

	// A tab change on the ticket page pushes history too.
	await region.getByRole('tab', { name: 'Tasks' }).click();
	await expect(page).toHaveURL(ticketPage(MULTI, '?execution=1'));
	await page.goBack();
	await expect(page).toHaveURL(ticketPage(MULTI, '?execution=1&tab=usage'));
	await expect(region.getByRole('tab', { name: 'Usage' })).toHaveAttribute('aria-selected', 'true');
});

test('AC5: Open ticket keeps execution and tab; Back returns to the board with the Inspector', async ({
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

test("AC6: Close removes the Inspector and ticket from the URL and focuses the ticket's card", async ({
	page
}) => {
	const key = ticketDetailActiveInWork.key;
	await page.goto(board(key, '&tab=usage'));
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
	await inspector(page).getByRole('button', { name: 'Close inspector' }).click();
	await expect(page).toHaveURL('/');
	await expect(inspector(page)).toHaveCount(0);
	await expect(card(page, key)).toBeFocused();
	await shot(page, 'ac6-closed');
});

test('AC7: a finished ticket with no card shows its Inspector; Close falls back to the board heading', async ({
	page
}) => {
	const finished = ticketCompleteInDone;
	expect(openTickets.some((ticket) => ticket.key === finished.key)).toBe(false);
	await page.goto(board(finished.key));
	await expect(card(page, finished.key)).toHaveCount(0);
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
	await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(finished.title);
	await shot(page, 'ac7-finished-ticket');

	await inspector(page).getByRole('button', { name: 'Close inspector' }).click();
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: 'Flow board', level: 2 })).toBeFocused();
});

test('AC8: an unknown key shows not found while the board keeps working', async ({ page }) => {
	await page.goto(board('qa-26-no-such-ticket'));
	await expect(inspector(page)).toHaveAttribute('data-state', 'not_found');
	await expect(inspector(page).getByRole('heading', { name: 'No such ticket' })).toBeVisible();
	await shot(page, 'ac8-not-found');

	// The board still selects.
	const target = ticketDetailActiveInWork;
	await card(page, target.key).click();
	await expect(page).toHaveURL(board(target.key));
	await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
});

test('AC9, AC10: no secrets in the board page or the Inspector read; the factory sees GETs only', async ({
	page
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
	const data = await (
		await page.request.get(`/__data.json?ticket=${encodeURIComponent(MULTI)}`)
	).text();
	expect(reads.length).toBeGreaterThan(0);
	for (const text of [html, data, ...reads]) {
		expect(text).not.toContain(FAKE_FACTORY_TOKEN);
		expect(text).not.toContain(FAKE_FACTORY_URL);
		expect(text).not.toContain('127.0.0.1');
	}
	// The root load is selection-free: its data does not carry the ticket.
	expect(data).not.toContain(ticketDetailMultiExecutionFirst.tasks[0]!.title);
	expect((await factoryRequests()).every((request) => request.method === 'GET')).toBe(true);
});

test.describe('AC8: the Inspector read fails', () => {
	const fakePort = 7871;
	const appPort = 4271;
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, {
			failRuns: { status: 500, title: 'Internal error', type: 'internal_error', detail: 'qa-26-04' }
		}));
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

	test('an endpoint failure shows the error state with Retry; the board keeps working', async ({
		page
	}) => {
		const base = `http://localhost:${appPort}`;
		const key = ticketDetailActiveInWork.key;
		let reads = 0;
		page.on('request', (request) => {
			if (new URL(request.url()).pathname.startsWith('/api/factory/tickets/')) reads++;
		});
		await page.goto(`${base}${board(key)}`);
		await expect(inspector(page)).toHaveAttribute('data-state', 'error');
		await expect(page.getByText('qa-26-04')).toHaveCount(0);
		const retry = inspector(page).getByRole('button', { name: 'Retry' });
		await expect(retry).toBeVisible();
		await expect(card(page, key)).toBeVisible();
		await shot(page, 'ac8-error-retry');

		const before = reads;
		await retry.click();
		await expect.poll(() => reads).toBeGreaterThan(before);
		await expect(inspector(page)).toHaveAttribute('data-state', 'error');
	});
});
