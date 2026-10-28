import { allTickets } from './fake-factory.ts';
import { expect, test } from './fixtures.ts';

// The tickets list on /tickets: every ticket from every page, each row a link
// by key, the partial note, and the refused-token error.

const rows = (page: import('@playwright/test').Page) =>
	page.getByRole('row').filter({ has: page.getByRole('cell') });

test('/tickets lists every ticket from every page, each row a link by key', async ({
	page,
	fake,
	shot
}) => {
	await page.goto('/tickets');
	await expect(page.getByRole('heading', { name: 'Tickets', level: 2 })).toBeVisible();
	await expect(rows(page)).toHaveCount(allTickets.length);
	await expect(page.getByTestId('partial-note')).toHaveCount(0);
	await expect(page.getByText(/The list is partial/)).toHaveCount(0);
	for (const ticket of allTickets) {
		await expect(page.locator(`a[href="/tickets/${encodeURIComponent(ticket.key)}"]`)).toHaveText(
			ticket.displayRef
		);
	}
	await shot('tickets-list');
	// The fake pages 4 at a time, so the list took several reads.
	const reads = fake.requests().filter((request) => request.path.startsWith('/v1/tickets?'));
	expect(reads.length).toBeGreaterThan(1);
	expect(fake.requests().every((request) => request.method === 'GET')).toBe(true);
});

test.describe('more tickets than the pager bound', () => {
	// 20 pages × 4 per page = 80; list more so the pager stops with pages left.
	const many = Array.from({ length: 90 }, (_, i) => ({
		...allTickets[i % allTickets.length]!,
		id: `tkt_many_${i}`,
		key: `many-${i}`,
		displayRef: `many/tickets#${i}`
	}));
	test.use({ fakeOptions: { tickets: many } });

	test('/tickets shows the pages it read and says the list is partial', async ({ page, shot }) => {
		await page.goto('/tickets');
		await expect(rows(page)).toHaveCount(80);
		await expect(page.getByText(/The list is partial/)).toBeVisible();
		await shot('tickets-partial');
	});
});

test.describe('the factory refuses the token', () => {
	test.use({ fakeOptions: { token: 'not-the-dashboard-token' } });

	// The ticket page's refused token is in ticket-page.e2e.ts.
	test('/tickets renders the configuration error, not an empty page', async ({ page, shot }) => {
		const response = await page.goto('/tickets');
		expect(response?.status()).toBe(503);
		await expect(
			page.getByRole('heading', { name: /cannot reach the factory with its configuration/ })
		).toBeVisible();
		await expect(page.locator('body')).toContainText('FACTORY_API_TOKEN');
		await expect(page.getByRole('table')).toHaveCount(0);
		await shot('bad-token-tickets');
	});
});
