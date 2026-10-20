import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

import { FAKE_FACTORY_URL, agentList, allTickets, openTickets } from './fake-factory';

const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

/** Every request the dashboard sent to the fake factory so far. */
async function factoryRequests(): Promise<{ method: string; path: string }[]> {
	return (await fetch(`${FAKE_FACTORY_URL}/__fake/requests`)).json();
}

test('home: nav, the Flow board from the factory, and a selected-ticket link by key', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByText('FD')).toBeVisible();
	const nav = page.getByRole('navigation');
	await expect(nav).toContainText('Flow board');
	await expect(nav).toContainText('Tickets');
	await expect(nav).toContainText('Stats');
	await expect(page.getByRole('heading', { name: 'Flow board', level: 2 })).toBeVisible();

	const onBoard = openTickets.filter((ticket) => ticket.status !== 'cancelled');
	const cards = page.locator('[data-slot="ticket-card"]');
	await expect(cards).toHaveCount(onBoard.length);
	await expect(page.locator('[data-summary="agents-running"]')).toContainText(
		String(agentList.items.length)
	);

	const first = onBoard[0]!;
	await page.locator(`[data-ticket-key="${first.key}"]`).click();
	await expect(page).toHaveURL(`/?ticket=${encodeURIComponent(first.key)}`);
	await expect(page.getByRole('link', { name: 'Open ticket' })).toHaveAttribute(
		'href',
		`/tickets/${encodeURIComponent(first.key)}`
	);
	await shot(page, 'home-flow-board');

	expect((await factoryRequests()).every((request) => request.method === 'GET')).toBe(true);
});

test('tickets: every ticket from every page, each row a link by key', async ({ page }) => {
	await page.goto('/tickets');
	await expect(page.getByRole('heading', { name: 'Tickets', level: 2 })).toBeVisible();
	await expect(page.locator('tbody tr')).toHaveCount(allTickets.length);
	await expect(page.getByTestId('partial-note')).toHaveCount(0);
	for (const ticket of allTickets) {
		await expect(page.locator(`a[href="/tickets/${encodeURIComponent(ticket.key)}"]`)).toHaveText(
			ticket.displayRef
		);
	}
	await shot(page, 'tickets-list');
	expect((await factoryRequests()).every((request) => request.method === 'GET')).toBe(true);
});

// A wrong token: the built app against the same fake, with another token.
const BAD_TOKEN_PORT = 4188;
let badTokenServer: ChildProcess;

test.describe('bad token', () => {
	test.beforeAll(async () => {
		badTokenServer = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(BAD_TOKEN_PORT),
				FACTORY_API_URL: FAKE_FACTORY_URL,
				FACTORY_API_TOKEN: 'not-the-fake-factory-token'
			},
			stdio: 'ignore'
		});
		await expect
			.poll(
				async () => {
					try {
						return (await fetch(`http://localhost:${BAD_TOKEN_PORT}/`)).status;
					} catch {
						return 0;
					}
				},
				{ timeout: 30_000 }
			)
			.toBe(503);
	});

	test.afterAll(() => {
		badTokenServer?.kill();
	});

	for (const path of ['/', '/tickets', `/tickets/${encodeURIComponent(allTickets[0]!.key)}`]) {
		test(`${path} renders the configuration error, not an empty page`, async ({ page }) => {
			const response = await page.goto(`http://localhost:${BAD_TOKEN_PORT}${path}`);
			expect(response?.status()).toBe(503);
			await expect(
				page.getByRole('heading', { name: /cannot reach the factory with its configuration/ })
			).toBeVisible();
			await expect(page.locator('body')).toContainText('FACTORY_API_TOKEN');
			await expect(page.locator('table')).toHaveCount(0);
			await expect(page.locator('[data-slot="flow-board"]')).toHaveCount(0);
			await shot(
				page,
				`bad-token${path === '/' ? '-home' : path === '/tickets' ? '-tickets' : '-detail'}`
			);
		});
	}
});
