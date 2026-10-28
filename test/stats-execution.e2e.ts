import type { APIResponse, Page } from '@playwright/test';

import { executionList } from '../src/lib/factory/fixtures/runs.ts';
import { ticketDetailMultiExecution } from '../src/lib/factory/fixtures/tickets.ts';
import { expect, test, type FakeFixture } from './fixtures.ts';

// The Stats contributor resolver, /stats/execution: a ticket key and an
// execution's start time land on that exact execution in the inspector. The
// load's every branch is proved by src/routes/stats/execution/page.server.test.ts;
// here the running app shows the redirect, the pages and their safety.

const KEY = ticketDetailMultiExecution.key;
const [FIRST, CURRENT] = executionList.items;
const NO_MATCH = '2026-10-05T08:00:01Z';
const UNKNOWN = 'no-such-ticket-e2e';
const LEAK = 'executions-upstream-secret: sqlite busy at /srv/factory/executions.db';
const CONFIG_ERROR = 'The dashboard cannot reach the factory with its configuration';

const resolver = (params: Record<string, string>) =>
	`/stats/execution?${new URLSearchParams(params)}`;
const ticketPage = (query: string) => `/tickets/${encodeURIComponent(KEY)}${query}`;
const inspector = (page: Page) => page.getByTestId('ticket-inspector');

/** The response's headers and body name no token, factory URL or Problem detail. */
async function expectSafe(response: APIResponse, fake: FakeFixture) {
	const text = JSON.stringify(response.headers()) + (await response.text());
	for (const secret of [fake.token, fake.url, '127.0.0.1', LEAK]) {
		expect.soft(text, `${response.url()} leaks ${secret}`).not.toContain(secret);
	}
}

test('a past execution redirects 303 to ?execution=n and opens read-only', async ({
	page,
	request,
	fake,
	shot
}) => {
	const url = resolver({ key: KEY, startedAt: FIRST!.createdAt });
	const response = await request.get(url, { maxRedirects: 0 });
	expect(response.status()).toBe(303);
	expect(response.headers().location).toBe(ticketPage(`?execution=${FIRST!.generation}`));
	await expectSafe(response, fake);

	await page.goto(url);
	await expect(page).toHaveURL(ticketPage(`?execution=${FIRST!.generation}`));
	await expect(inspector(page)).toHaveAttribute('data-execution', String(FIRST!.generation));
	await expect(page.getByTestId('past-execution')).toContainText(
		`Past execution ${FIRST!.generation}`
	);
	await expect(page.locator('[data-slot="ticket-commands"]')).toHaveCount(0);
	await expect(page.locator('[data-slot="ticket-actions"]')).toHaveCount(0);
	await expect(page.locator('[data-slot="reply-composer"]')).toHaveCount(0);
	await shot('resolver-past-execution');
});

test('the current execution redirects to its generation, named in the URL, with its commands', async ({
	page,
	request,
	fake
}) => {
	const url = resolver({ key: KEY, startedAt: CURRENT!.createdAt });
	const response = await request.get(url, { maxRedirects: 0 });
	expect(response.status()).toBe(303);
	expect(response.headers().location).toBe(ticketPage(`?execution=${CURRENT!.generation}`));
	await expectSafe(response, fake);

	await page.goto(url);
	await expect(page).toHaveURL(ticketPage(`?execution=${CURRENT!.generation}`));
	await expect(inspector(page)).toHaveAttribute('data-execution', String(CURRENT!.generation));
	await expect(page.getByTestId('past-execution')).toHaveCount(0);
	await expect(page.locator('[data-slot="ticket-commands"]')).toHaveCount(1);
});

test('a start matching no execution is a 404, never a redirect to the current one', async ({
	page,
	request,
	fake,
	shot
}) => {
	const url = resolver({ key: KEY, startedAt: NO_MATCH });
	const raw = await request.get(url, { maxRedirects: 0 });
	expect(raw.status()).toBe(404);
	expect(raw.headers().location).toBeUndefined();
	await expectSafe(raw, fake);

	const response = await page.goto(url);
	expect(response?.status()).toBe(404);
	expect(new URL(page.url()).pathname).toBe('/stats/execution');
	await expect(
		page.getByRole('heading', { name: 'No such execution in this ticket' })
	).toBeVisible();
	await expect(inspector(page)).toHaveCount(0);
	await shot('resolver-no-match');
});

test('an unknown ticket is a 404, and a missing key or start time a 400', async ({
	page,
	request,
	fake
}) => {
	const unknown = await page.goto(resolver({ key: UNKNOWN, startedAt: FIRST!.createdAt }));
	expect(unknown?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'No such ticket' })).toBeVisible();
	await expect(inspector(page)).toHaveCount(0);

	const missing: Record<string, string>[] = [{ startedAt: FIRST!.createdAt }, { key: KEY }, {}];
	for (const params of missing) {
		const response = await request.get(resolver(params), { maxRedirects: 0 });
		expect(response.status(), JSON.stringify(params)).toBe(400);
		await expectSafe(response, fake);
	}
	expect((await page.goto(resolver({ key: KEY })))?.status()).toBe(400);
	await expect(page.getByRole('heading', { name: 'The request is not valid' })).toBeVisible();
	await expect(inspector(page)).toHaveCount(0);
});

test.describe('the executions read is unauthorized', () => {
	test.use({
		fakeOptions: {
			failExecutions: { status: 401, title: 'Unauthorized', type: 'unauthorized', detail: LEAK }
		}
	});

	test('the resolver shows the configuration error, with no Problem detail', async ({
		page,
		request,
		fake,
		shot
	}) => {
		const url = resolver({ key: KEY, startedAt: FIRST!.createdAt });
		await page.goto(url);
		await expect(page.getByText(CONFIG_ERROR)).toBeVisible();
		await expect(inspector(page)).toHaveCount(0);
		await shot('resolver-unauthorized');
		await expectSafe(await request.get(url, { maxRedirects: 0 }), fake);
	});
});

test.describe('the executions read fails', () => {
	test.use({
		fakeOptions: {
			failExecutions: { status: 500, title: 'Internal error', type: 'internal_error', detail: LEAK }
		}
	});

	test('the resolver shows a safe error, without the Problem detail', async ({
		page,
		request,
		fake
	}) => {
		const url = resolver({ key: KEY, startedAt: FIRST!.createdAt });
		const response = await page.goto(url);
		expect(response?.status()).toBe(502);
		await expect(inspector(page)).toHaveCount(0);
		await expect(page.getByText(LEAK)).toHaveCount(0);
		await expectSafe(await request.get(url, { maxRedirects: 0 }), fake);
	});
});
