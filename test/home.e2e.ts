import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

import {
	FAKE_FACTORY_URL,
	agentList,
	allTickets,
	openTickets,
	openTicketsCostUsd
} from './fake-factory';

const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

/** Every request the dashboard sent to the fake factory so far. */
async function factoryRequests(): Promise<{ method: string; path: string }[]> {
	return (await fetch(`${FAKE_FACTORY_URL}/__fake/requests`)).json();
}

test('home: nav, overview cards from the factory, and ticket links by key', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('FD')).toBeVisible();
	await expect(page.getByRole('navigation')).toContainText('Main');
	await expect(page.getByRole('navigation')).toContainText('Tickets');

	const needsUser = openTickets.filter((ticket) => ticket.needsUser);
	const attention = page.getByTestId('needs-attention-card');
	await expect(attention).toContainText('Needs attention');
	await expect(attention).toContainText(String(needsUser.length));
	for (const ticket of needsUser) await expect(attention).toContainText(ticket.displayRef);

	const agents = page.getByTestId('active-agents-card');
	await expect(agents).toContainText('Active agents');
	await expect(agents).toContainText(String(agentList.items.length));

	const qa = page.getByTestId('stage-cards').locator('[data-stage="qa"]');
	await expect(qa).toContainText('QA');
	await expect(qa).toContainText(String(openTickets.filter((t) => t.stage === 'qa').length));

	const cost = page.getByTestId('cost-card');
	await expect(cost).toContainText('Cost · open tickets');
	await expect(cost.getByTestId('cost-value')).toHaveText(`$${openTicketsCostUsd.toFixed(2)}`);

	const first = openTickets[0]!;
	const link = page.getByRole('link', { name: first.displayRef, exact: true });
	await expect(link).toHaveAttribute('href', `/tickets/${encodeURIComponent(first.key)}`);
	await expect(page.locator('tbody tr')).toHaveCount(openTickets.length);
	await shot(page, 'home-overview');

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
		test(`${path} renders the configuration error, not an empty table`, async ({ page }) => {
			const response = await page.goto(`http://localhost:${BAD_TOKEN_PORT}${path}`);
			expect(response?.status()).toBe(503);
			await expect(
				page.getByRole('heading', { name: /cannot reach the factory with its configuration/ })
			).toBeVisible();
			await expect(page.locator('body')).toContainText('FACTORY_API_TOKEN');
			await expect(page.locator('table')).toHaveCount(0);
			await shot(
				page,
				`bad-token${path === '/' ? '-home' : path === '/tickets' ? '-tickets' : '-detail'}`
			);
		});
	}
});
