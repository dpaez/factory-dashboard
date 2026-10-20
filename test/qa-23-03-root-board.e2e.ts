import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	ticketActiveInQa,
	ticketCancelled,
	ticketPaused,
	ticketReadyForHandoff,
	ticketWaitingForManualApproval
} from '../src/lib/factory/fixtures/tickets.ts';
import {
	FAKE_FACTORY_TOKEN,
	agentList,
	openTickets,
	startFakeFactory,
	type FakeFactoryOptions
} from './fake-factory';

// QA for ticket #23, task 03: / is the Flow board, with ?ticket= selection and the nav.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const onBoard = openTickets.filter((t) => t.status !== 'complete' && t.status !== 'cancelled');
const lane = (page: Page, name: string) =>
	page.getByRole('group', { name: new RegExp(`^${name}\\b`) });
const cardIn = (scope: ReturnType<Page['locator']> | Page, title: string) =>
	scope.getByRole('button').filter({ hasText: title });
const allCards = (page: Page) =>
	page
		.getByRole('group')
		.getByRole('button')
		.filter({ hasText: /Updated/ });

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions, token?: string) {
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, options));
		app = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(appPort),
				FACTORY_API_URL: `http://127.0.0.1:${fakePort}`,
				FACTORY_API_TOKEN: token ?? FAKE_FACTORY_TOKEN
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
	return `http://localhost:${appPort}`;
}

test('AC1: / shows the five lanes with each open ticket in its lane and no cancelled ticket', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Flow board' })).toBeVisible();
	for (const name of ['Plan', 'Work', 'QA', 'Review', 'Handoff']) {
		await expect(lane(page, name)).toBeVisible();
	}
	await expect(allCards(page)).toHaveCount(onBoard.length);
	await expect(cardIn(lane(page, 'QA'), ticketActiveInQa.title)).toBeVisible();
	await expect(cardIn(lane(page, 'Work'), ticketPaused.title)).toBeVisible();
	await expect(cardIn(lane(page, 'Handoff'), ticketReadyForHandoff.title)).toBeVisible();
	await expect(cardIn(lane(page, 'Handoff'), ticketWaitingForManualApproval.title)).toBeVisible();
	await expect(page.getByText(ticketCancelled.title)).toHaveCount(0);
	await shot(page, 'ac1-flow-board');
});

test('AC2: the summary shows in progress, agents running, and ready to start Unavailable', async ({
	page
}) => {
	await page.goto('/');
	const summary = page.getByRole('list', { name: 'Board summary' });
	await expect(summary.getByRole('listitem').filter({ hasText: 'in progress' })).toHaveText(
		new RegExp(`^\\s*${onBoard.length}\\s+in progress\\s*$`)
	);
	await expect(summary.getByRole('listitem').filter({ hasText: 'agents running' })).toHaveText(
		new RegExp(`^\\s*${agentList.items.length}\\s+agents running\\s*$`)
	);
	await expect(summary.getByRole('listitem').filter({ hasText: 'ready to start' })).toHaveText(
		/^\s*Unavailable\s+ready to start\s*$/
	);
});

test.describe('AC3: one ticket detail read fails', () => {
	const failing = onBoard[1]!;
	const base = scenario(7831, 4231, {
		failDetail: {
			keys: [failing.key],
			problem: { status: 500, title: 'Boom', type: 'internal_error' }
		}
	});

	test('AC3: that card shows Unavailable cost and the rest of the board renders', async ({
		page
	}) => {
		await page.goto(`${base}/`);
		await expect(cardIn(page, failing.title)).toContainText('Unavailable');
		await expect(allCards(page)).toHaveCount(onBoard.length);
		await expect(cardIn(page, onBoard[0]!.title)).toContainText(/\$\d+\.\d\d/);
		await expect(cardIn(page, onBoard[0]!.title)).not.toContainText('Unavailable');
		await shot(page, 'ac3-cost-unavailable');
	});
});

test('AC4: Tab focuses a card; Enter and Space select it into ?ticket= with an Open ticket link', async ({
	page
}) => {
	await page.goto('/');
	const focusedCard = page.locator('button:focus');
	let title: string | null = null;
	for (let i = 0; i < 40 && title === null; i++) {
		await page.keyboard.press('Tab');
		const text = (await focusedCard.count()) ? await focusedCard.textContent() : null;
		title = onBoard.find((t) => text?.includes(t.title))?.title ?? null;
	}
	expect(title, 'Tab reaches a board card').not.toBeNull();
	const first = onBoard.find((t) => t.title === title)!;
	const firstCard = cardIn(page, first.title);
	await expect(firstCard).toBeFocused();

	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(first.key)}`);
	await expect(firstCard).toHaveAttribute('aria-pressed', 'true');
	await expect(firstCard).toBeFocused();
	const open = page.getByRole('link', { name: 'Open ticket' });
	await expect(open).toHaveAttribute('href', `/tickets/${encodeURIComponent(first.key)}`);
	await shot(page, 'ac4-card-selected');

	await page.keyboard.press('Tab');
	const text = await focusedCard.textContent();
	const second = onBoard.find((t) => t !== first && text?.includes(t.title))!;
	expect(second, 'Tab reaches a second board card').toBeTruthy();
	const secondCard = cardIn(page, second.title);
	await page.keyboard.press('Space');
	await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(second.key)}`);
	await expect(secondCard).toHaveAttribute('aria-pressed', 'true');
	await expect(firstCard).toHaveAttribute('aria-pressed', 'false');
	await expect(secondCard).toBeFocused();
	await expect(open).toHaveAttribute('href', `/tickets/${encodeURIComponent(second.key)}`);
});

test('AC5: no element on / is draggable', async ({ page }) => {
	await page.goto('/');
	await expect(allCards(page)).toHaveCount(onBoard.length);
	await expect(page.locator('[draggable="true"]')).toHaveCount(0);
});

test('AC6: the nav shows Flow board, Tickets and Stats and marks the current page', async ({
	page
}) => {
	const nav = page.getByRole('navigation', { name: 'Primary' });
	for (const [path, current] of [
		['/', 'Flow board'],
		['/tickets', 'Tickets'],
		[`/tickets/${encodeURIComponent(onBoard[0]!.key)}`, 'Tickets']
	] as const) {
		await page.goto(path);
		for (const name of ['Flow board', 'Tickets', 'Stats']) {
			const link = nav.getByRole('link', { name, exact: true });
			await expect.soft(link, `${path} ${name}`).toBeVisible();
			if (name === current) {
				await expect.soft(link, `${path} ${name}`).toHaveAttribute('aria-current', 'page');
			} else {
				await expect.soft(link, `${path} ${name}`).not.toHaveAttribute('aria-current', 'page');
			}
		}
		await expect.soft(page.getByText(/new ticket/i)).toHaveCount(0);
		if (path === '/tickets') await shot(page, 'ac6-nav-tickets-current');
	}
});

test.describe('AC7: the factory rejects the token', () => {
	const base = scenario(7832, 4232, {}, 'qa-23-03-wrong-token');

	test('AC7: / renders the configuration error page, not an empty board', async ({ page }) => {
		const response = await page.goto(`${base}/`);
		expect(response?.status()).toBe(503);
		await expect(page.getByText('FACTORY_API_TOKEN').first()).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Flow board' })).toHaveCount(0);
		await expect(page.getByRole('group', { name: /^Plan\b/ })).toHaveCount(0);
		await shot(page, 'ac7-config-error');
	});
});
