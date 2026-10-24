import { expect, test, type Page } from '@playwright/test';

import { executionList } from '../src/lib/factory/fixtures/runs.ts';
import { ticketDetailMultiExecution } from '../src/lib/factory/fixtures/tickets.ts';
import { FAKE_FACTORY_TOKEN, FAKE_FACTORY_URL } from './fake-factory';

// The Stats contributor resolver: a ticket key and an execution's start time
// land on that exact execution in the inspector, against the fake factory.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const MULTI = ticketDetailMultiExecution.key;
const [FIRST, CURRENT] = executionList.items;
const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const resolver = (params: Record<string, string>) =>
	`/stats/execution?${new URLSearchParams(params)}`;
const ticketPage = (query: string) => `/tickets/${encodeURIComponent(MULTI)}${query}`;

async function expectNoLeak(page: Page) {
	const html = await page.content();
	expect(html).not.toContain(FAKE_FACTORY_TOKEN);
	expect(html).not.toContain(FAKE_FACTORY_URL);
}

test('a past execution redirects to its generation and opens read-only', async ({
	page,
	request
}) => {
	const url = resolver({ key: MULTI, startedAt: FIRST!.createdAt });
	const response = await request.get(url, { maxRedirects: 0 });
	expect(response.status()).toBe(303);
	expect(response.headers().location).toBe(ticketPage('?execution=1'));

	await page.goto(url);
	await expect(page).toHaveURL(ticketPage('?execution=1'));
	await expect(inspector(page)).toHaveAttribute('data-execution', '1');
	await expect(page.getByTestId('past-execution')).toContainText('Past execution 1');
	await expect(page.locator('[data-slot="ticket-commands"]')).toHaveCount(0);
	await expect(page.locator('[data-slot="ticket-actions"]')).toHaveCount(0);
	await expect(page.locator('[data-slot="reply-composer"]')).toHaveCount(0);
	await expectNoLeak(page);
	await shot(page, 'resolver-past-execution');
});

test('the current execution redirects to its generation, named in the URL', async ({ page }) => {
	await page.goto(resolver({ key: MULTI, startedAt: CURRENT!.createdAt }));
	await expect(page).toHaveURL(ticketPage(`?execution=${CURRENT!.generation}`));
	await expect(inspector(page)).toHaveAttribute('data-execution', String(CURRENT!.generation));
	await expect(page.getByTestId('past-execution')).toHaveCount(0);
	// The current execution opens normally, with its commands.
	await expect(page.locator('[data-slot="ticket-commands"]')).toHaveCount(1);
});

test('a start matching no execution is a 404, never the current execution', async ({ page }) => {
	const url = resolver({ key: MULTI, startedAt: '2026-10-05T08:00:01Z' });
	const response = await page.goto(url);
	expect(response?.status()).toBe(404);
	expect(new URL(page.url()).pathname).toBe('/stats/execution');
	await expect(
		page.getByRole('heading', { name: 'No such execution in this ticket' })
	).toBeVisible();
	await expect(inspector(page)).toHaveCount(0);
	await expectNoLeak(page);
	await shot(page, 'resolver-no-match');
});

test('a missing key or start time is a 400, and an unknown ticket a 404', async ({ page }) => {
	expect((await page.goto(resolver({ startedAt: FIRST!.createdAt })))?.status()).toBe(400);
	await expect(page.getByRole('heading', { name: 'The request is not valid' })).toBeVisible();
	expect((await page.goto(resolver({ key: MULTI })))?.status()).toBe(400);

	const unknown = await page.goto(
		resolver({ key: 'qa-no-such-ticket', startedAt: FIRST!.createdAt })
	);
	expect(unknown?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'No such ticket' })).toBeVisible();
	await expectNoLeak(page);
});
