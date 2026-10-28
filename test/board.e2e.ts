import type { Page } from '@playwright/test';

import { backlogIssues } from '../src/lib/factory/fixtures/backlog.ts';
import {
	ticketActiveInQa,
	ticketCancelled,
	ticketPaused,
	ticketReadyForHandoff,
	ticketWaitingForAgentQuestion,
	ticketWaitingForManualApproval
} from '../src/lib/factory/fixtures/tickets.ts';
import { agentList, openTickets } from './fake-factory.ts';
import { expect, gotoLive, test } from './fixtures.ts';

// The Flow board on /: lanes, summary, `?ticket=` selection, the nav, and what
// the board does when the factory refuses or fails a read.

/** Backlog issues neither blocked nor umbrella: the summary's ready to start. */
const READY = backlogIssues.filter((issue) => !issue.blocked && !issue.umbrella).length;
const LANES = ['Plan', 'Work', 'QA', 'Review', 'Handoff'] as const;
const LANE_OF: Record<string, (typeof LANES)[number]> = {
	plan: 'Plan',
	work: 'Work',
	qa: 'QA',
	review: 'Review',
	wrapup: 'Handoff'
};
const onBoard = openTickets.filter(
	(ticket) => !['complete', 'cancelled'].includes(ticket.status) && ticket.stage !== 'done'
);
const lane = (page: Page, name: string) =>
	page.getByRole('group', { name: new RegExp(`^${name}\\b`) });
const card = (page: Page, key: string) =>
	page.locator(`[data-slot="ticket-card"][data-ticket-key="${key}"]`);
const cards = (page: Page) => page.locator('[data-slot="ticket-card"]');
const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const ticketHref = (key: string) => `/tickets/${encodeURIComponent(key)}`;

test('the board shows the five lanes with one card per open ticket in its lane', async ({
	page,
	fake,
	shot
}) => {
	await page.goto('/');
	await expect(page.getByText('FD')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Flow board', level: 2 })).toBeVisible();
	for (const name of LANES) await expect(lane(page, name)).toBeVisible();
	await expect(cards(page)).toHaveCount(onBoard.length);
	for (const ticket of onBoard) {
		await expect(
			lane(page, LANE_OF[ticket.stage]!).locator(`[data-ticket-key="${ticket.key}"]`)
		).toHaveCount(1);
	}
	await expect(
		lane(page, 'QA').locator(`[data-ticket-key="${ticketActiveInQa.key}"]`)
	).toBeVisible();
	await expect(lane(page, 'Work').locator(`[data-ticket-key="${ticketPaused.key}"]`)).toBeVisible();
	for (const ticket of [ticketReadyForHandoff, ticketWaitingForManualApproval]) {
		await expect(lane(page, 'Handoff').locator(`[data-ticket-key="${ticket.key}"]`)).toBeVisible();
	}
	await expect(card(page, ticketCancelled.key)).toHaveCount(0);
	await expect(page.getByText(ticketCancelled.title)).toHaveCount(0);
	await shot('flow-board');

	expect(fake.requests().every((request) => request.method === 'GET')).toBe(true);
});

test('the summary counts cards, agents running and backlog issues ready to start', async ({
	page
}) => {
	await page.goto('/');
	const summary = page.getByRole('list', { name: 'Board summary' });
	await expect(summary.locator('[data-summary="in-progress"]')).toHaveText(
		new RegExp(`^\\s*${onBoard.length}\\s+in progress\\s*$`)
	);
	await expect(summary.locator('[data-summary="agents-running"]')).toHaveText(
		new RegExp(`^\\s*${agentList.items.length}\\s+agents running\\s*$`)
	);
	await expect(summary.locator('[data-summary="ready-to-start"]')).toHaveText(
		new RegExp(`^\\s*${READY}\\s+ready to start\\s*$`)
	);
});

test.describe('selection', () => {
	test('clicking a card writes ?ticket= and the inspector links to the ticket by key', async ({
		page
	}) => {
		const first = onBoard[0]!;
		await gotoLive(page, '/');
		await card(page, first.key).click();
		await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(first.key)}`);
		await expect(card(page, first.key)).toHaveAttribute('aria-pressed', 'true');
		await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(first.title);
		await expect(page.getByRole('link', { name: 'Open ticket' })).toHaveAttribute(
			'href',
			ticketHref(first.key)
		);
	});

	test('Tab reaches cards; Enter and Space select into ?ticket= without rerunning the load', async ({
		page,
		shot
	}) => {
		// Wait for hydration: a key pressed before the click handlers attach does nothing.
		await gotoLive(page, '/');
		const dataRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('__data.json')) dataRequests.push(request.url());
		});

		const focusedKey = () =>
			page.evaluate(
				() =>
					(document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
						'[data-slot="ticket-card"]'
					)?.dataset.ticketKey ?? null
			);
		let first: string | null = null;
		for (let i = 0; i < 40 && first === null; i++) {
			await page.keyboard.press('Tab');
			first = await focusedKey();
		}
		expect(first, 'Tab reaches a board card').not.toBeNull();

		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(first!)}`);
		await expect(card(page, first!)).toHaveAttribute('aria-pressed', 'true');
		await expect(card(page, first!)).toBeFocused();
		await expect(inspector(page)).toHaveAttribute('data-ticket-key', first!);
		const open = page.getByRole('link', { name: 'Open ticket' });
		await expect(open).toHaveAttribute('href', ticketHref(first!));
		await shot('flow-board-selected');

		// Space on the next card moves the selection.
		await page.keyboard.press('Tab');
		const second = await focusedKey();
		expect(second, 'Tab reaches a second board card').not.toBeNull();
		expect(second).not.toBe(first);
		await page.keyboard.press('Space');
		await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(second!)}`);
		await expect(card(page, second!)).toHaveAttribute('aria-pressed', 'true');
		await expect(card(page, first!)).toHaveAttribute('aria-pressed', 'false');
		await expect(card(page, second!)).toBeFocused();
		await expect(inspector(page)).toHaveAttribute('data-ticket-key', second!);
		await expect(open).toHaveAttribute('href', ticketHref(second!));

		expect(dataRequests, 'selecting a card does not rerun the board load').toEqual([]);
	});

	test('a ?ticket= key loaded directly selects that card and shows its ref', async ({ page }) => {
		const ticket = ticketWaitingForAgentQuestion;
		await page.goto(`/?ticket=${encodeURIComponent(ticket.key)}`);
		await expect(card(page, ticket.key)).toHaveAttribute('aria-pressed', 'true');
		await expect(inspector(page)).toHaveAttribute('data-state', 'loaded');
		await expect(inspector(page)).toContainText(ticket.displayRef);
		await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(ticket.title);
		await inspector(page).getByRole('link', { name: 'Open ticket' }).click();
		await expect(page).toHaveURL(ticketHref(ticket.key));
	});

	test('a key that is not on the board still shows the Open ticket link', async ({ page }) => {
		await page.goto(`/?ticket=${encodeURIComponent('not on/board')}`);
		await expect(inspector(page)).toHaveAttribute('data-state', 'not_found');
		await expect(page.getByRole('link', { name: 'Open ticket' })).toHaveAttribute(
			'href',
			ticketHref('not on/board')
		);
		await expect(page.locator('[data-slot="ticket-card"][aria-pressed="true"]')).toHaveCount(0);
	});
});

test('nothing on / is draggable', async ({ page }) => {
	await page.goto('/');
	await expect(cards(page)).toHaveCount(onBoard.length);
	await expect(page.locator('[draggable="true"]')).toHaveCount(0);
});

test('the nav marks the current page; New ticket is a link to /new', async ({ page, shot }) => {
	const nav = page.getByRole('navigation', { name: 'Primary' });
	const link = (name: string) => nav.getByRole('link', { name, exact: true });
	const current = nav.locator('[aria-current="page"]');

	for (const [path, name] of [
		['/', 'Flow board'],
		['/tickets', 'Tickets'],
		[ticketHref(onBoard[0]!.key), 'Tickets']
	] as const) {
		await page.goto(path);
		await expect(link('Flow board')).toHaveAttribute('href', '/');
		await expect(link('Tickets')).toHaveAttribute('href', '/tickets');
		await expect(link('Stats')).toHaveAttribute('href', '/stats');
		await expect(current, path).toHaveCount(1);
		await expect(current, path).toHaveText(name);
		await expect(page.getByRole('button', { name: /new ticket/i })).toHaveCount(0);
		await expect(link('New ticket')).toHaveAttribute('href', '/new');
		await expect(link('New ticket')).not.toHaveAttribute('aria-current', 'page');
		if (path === '/tickets') await shot('nav-tickets-current');
	}
});

test('the board page and its data carry no token or factory URL', async ({ page, fake }) => {
	const response = await page.goto(`/?ticket=${encodeURIComponent(onBoard[0]!.key)}`);
	const html = (await response?.text()) ?? '';
	const data = await (
		await page.request.get(`/__data.json?ticket=${encodeURIComponent(onBoard[0]!.key)}`)
	).text();
	for (const text of [html, data]) {
		expect(text).not.toContain(fake.token);
		expect(text).not.toContain(fake.url);
		expect(text).not.toContain(new URL(fake.url).host);
	}
});

test.describe('one ticket detail read fails', () => {
	const failing = onBoard[1]!;
	test.use({
		fakeOptions: {
			failDetail: {
				keys: [failing.key],
				problem: { status: 500, title: 'Boom', type: 'internal_error' }
			}
		}
	});

	test('that card shows Unavailable tokens and the rest of the board renders', async ({
		page,
		shot
	}) => {
		await page.goto('/');
		await expect(card(page, failing.key).locator('[data-slot="ticket-tokens"]')).toHaveText(
			'Tokens Unavailable'
		);
		await expect(card(page, failing.key)).not.toContainText('In 0');
		await expect(cards(page)).toHaveCount(onBoard.length);
		await expect(card(page, onBoard[0]!.key)).toContainText(/In [\d,]+ · Out [\d,]+/);
		await expect(card(page, onBoard[0]!.key)).not.toContainText('Unavailable');
		await expect(cards(page).filter({ hasText: '$' })).toHaveCount(0);
		await shot('board-cost-unavailable');
	});
});

test.describe('the factory refuses the token', () => {
	test.use({ fakeOptions: { token: 'not-the-dashboard-token' } });

	test('/ renders the configuration error, not an empty board', async ({ page, shot }) => {
		const response = await page.goto('/');
		expect(response?.status()).toBe(503);
		await expect(
			page.getByRole('heading', { name: /cannot reach the factory with its configuration/ })
		).toBeVisible();
		await expect(page.locator('body')).toContainText('FACTORY_API_TOKEN');
		await expect(page.getByRole('heading', { name: 'Flow board' })).toHaveCount(0);
		await expect(page.locator('[data-slot="flow-board"]')).toHaveCount(0);
		await expect(page.getByRole('group', { name: /^Plan\b/ })).toHaveCount(0);
		await shot('bad-token-home');
	});
});
