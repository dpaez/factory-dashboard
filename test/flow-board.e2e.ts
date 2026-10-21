import { expect, test, type Page } from '@playwright/test';

import {
	ticketActiveInQa,
	ticketCancelled,
	ticketPaused,
	ticketReadyForHandoff,
	ticketWaitingForAgentQuestion
} from '../src/lib/factory/fixtures/tickets.ts';
import { backlogIssues } from '../src/lib/factory/fixtures/backlog.ts';
import { agentList, openTickets } from './fake-factory';

// Ticket #23, task 03: / is the Flow board, with `?ticket=` selection and the nav.
const SHOTS = process.env.QA_SCREENSHOTS;
/** Backlog issues neither blocked nor umbrella: the summary's ready to start. */
const READY = backlogIssues.filter((issue) => !issue.blocked && !issue.umbrella).length;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

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

test('AC1: / shows the five lanes with one card per open ticket in its lane', async ({ page }) => {
	await page.goto('/');
	for (const name of LANES) await expect(lane(page, name)).toBeVisible();
	await expect(page.locator('[data-slot="ticket-card"]')).toHaveCount(onBoard.length);
	for (const ticket of onBoard) {
		await expect(
			lane(page, LANE_OF[ticket.stage]!).locator(`[data-ticket-key="${ticket.key}"]`)
		).toHaveCount(1);
	}
	await expect(
		lane(page, 'QA').locator(`[data-ticket-key="${ticketActiveInQa.key}"]`)
	).toBeVisible();
	await expect(lane(page, 'Work').locator(`[data-ticket-key="${ticketPaused.key}"]`)).toBeVisible();
	await expect(
		lane(page, 'Handoff').locator(`[data-ticket-key="${ticketReadyForHandoff.key}"]`)
	).toBeVisible();
	await expect(card(page, ticketCancelled.key)).toHaveCount(0);
	await shot(page, 'flow-board');
});

test('AC2: the summary counts cards, agents and backlog issues ready to start', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.locator('[data-summary="in-progress"]')).toContainText(
		`${onBoard.length} in progress`
	);
	await expect(page.locator('[data-summary="agents-running"]')).toContainText(
		`${agentList.items.length} agents running`
	);
	await expect(page.locator('[data-summary="ready-to-start"]')).toContainText(
		`${READY} ready to start`
	);
});

test('AC4: Tab reaches cards; Enter and Space select into ?ticket= without refetching', async ({
	page
}) => {
	// Wait for hydration: a key pressed before the click handlers attach does nothing.
	await page.goto('/', { waitUntil: 'networkidle' });
	const dataRequests: string[] = [];
	page.on('request', (request) => {
		if (request.url().includes('__data.json')) dataRequests.push(request.url());
	});

	// Tab from the top of the page until a board card has focus.
	let focusedKey: string | null = null;
	for (let i = 0; i < 40 && focusedKey === null; i++) {
		await page.keyboard.press('Tab');
		focusedKey = await page.evaluate(
			() =>
				(document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
					'[data-slot="ticket-card"]'
				)?.dataset.ticketKey ?? null
		);
	}
	expect(focusedKey, 'Tab reaches a board card').not.toBeNull();
	const first = focusedKey!;

	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(first)}`);
	await expect(card(page, first)).toHaveAttribute('aria-pressed', 'true');
	await expect(card(page, first)).toBeFocused();
	const open = page.getByRole('link', { name: 'Open ticket' });
	await expect(open).toHaveAttribute('href', `/tickets/${encodeURIComponent(first)}`);
	await shot(page, 'flow-board-selected');

	// Space on the next card moves the selection.
	await page.keyboard.press('Tab');
	const second = await page.evaluate(
		() => (document.activeElement as HTMLElement | null)?.dataset.ticketKey ?? null
	);
	expect(second).not.toBeNull();
	expect(second).not.toBe(first);
	await page.keyboard.press('Space');
	await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(second!)}`);
	await expect(card(page, second!)).toHaveAttribute('aria-pressed', 'true');
	await expect(card(page, first)).toHaveAttribute('aria-pressed', 'false');
	await expect(card(page, second!)).toBeFocused();
	await expect(open).toHaveAttribute('href', `/tickets/${encodeURIComponent(second!)}`);

	expect(dataRequests, 'selecting a card does not rerun the board load').toEqual([]);
});

test('AC4: a ?ticket= key loaded directly selects that card and shows its ref', async ({
	page
}) => {
	const ticket = ticketWaitingForAgentQuestion;
	await page.goto(`/?ticket=${encodeURIComponent(ticket.key)}`);
	await expect(card(page, ticket.key)).toHaveAttribute('aria-pressed', 'true');
	const region = page.getByTestId('ticket-inspector');
	await expect(region).toHaveAttribute('data-state', 'loaded');
	await expect(region).toContainText(ticket.displayRef);
	await expect(region.getByRole('heading', { level: 2 })).toHaveText(ticket.title);
	await region.getByRole('link', { name: 'Open ticket' }).click();
	await expect(page).toHaveURL(`/tickets/${encodeURIComponent(ticket.key)}`);
});

test('AC4: a key that is not on the board still shows the Open ticket link', async ({ page }) => {
	await page.goto(`/?ticket=${encodeURIComponent('not on/board')}`);
	await expect(page.getByTestId('ticket-inspector')).toHaveAttribute('data-state', 'not_found');
	await expect(page.getByRole('link', { name: 'Open ticket' })).toHaveAttribute(
		'href',
		`/tickets/${encodeURIComponent('not on/board')}`
	);
	await expect(page.locator('[data-slot="ticket-card"][aria-pressed="true"]')).toHaveCount(0);
});

test('AC5: nothing on / is draggable', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-slot="ticket-card"]').first()).toBeVisible();
	await expect(page.locator('[draggable="true"]')).toHaveCount(0);
});

test('AC6: the nav marks the current page and has no New ticket button', async ({ page }) => {
	const nav = page.getByRole('navigation');
	const link = (name: string) => nav.getByRole('link', { name, exact: true });
	const current = nav.locator('[aria-current="page"]');

	for (const [path, name] of [
		['/', 'Flow board'],
		['/tickets', 'Tickets'],
		[`/tickets/${encodeURIComponent(onBoard[0]!.key)}`, 'Tickets']
	] as const) {
		await page.goto(path);
		await expect(link('Flow board')).toHaveAttribute('href', '/');
		await expect(link('Tickets')).toHaveAttribute('href', '/tickets');
		await expect(link('Stats')).toHaveAttribute('href', '/stats');
		await expect(current, path).toHaveCount(1);
		await expect(current, path).toHaveText(name);
		await expect(page.getByRole('button', { name: /new ticket/i })).toHaveCount(0);
		await expect(page.getByRole('link', { name: /new ticket/i })).toHaveCount(0);
	}
	await shot(page, 'nav-tickets-current');
});
