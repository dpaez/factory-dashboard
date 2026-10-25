import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import { executionList } from '../src/lib/factory/fixtures/runs.ts';
import { ticketDetailMultiExecution } from '../src/lib/factory/fixtures/tickets.ts';
import {
	FAKE_FACTORY_TOKEN,
	FAKE_FACTORY_URL,
	startFakeFactory,
	type FakeFactoryOptions
} from './fake-factory';

// QA for ticket #32, task 03: /stats/execution resolves a Stats row's
// execution to its generation in the inspector.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const KEY = ticketDetailMultiExecution.key;
const [FIRST, CURRENT] = executionList.items;
const LEAK = 'qa-32-03 leaked detail: /srv/factory/executions.sqlite locked';
const resolver = (params: Record<string, string>) =>
	`/stats/execution?${new URLSearchParams(params)}`;
const ticketPage = (query: string) => `/tickets/${encodeURIComponent(KEY)}${query}`;
const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const commands = (page: Page) => page.locator('[data-slot="ticket-commands"]');

function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions) {
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, options));
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
				() =>
					fetch(`http://localhost:${appPort}/robots.txt`).then(
						(r) => r.status > 0,
						() => false
					),
				{ timeout: 30_000 }
			)
			.toBe(true);
	});
	test.afterAll(async () => {
		app?.kill();
		await new Promise((resolve) => fake?.close(resolve));
	});
	return { base: `http://localhost:${appPort}`, fakeUrl: `http://127.0.0.1:${fakePort}` };
}

test.describe('QA 32-03: the execution resolver', () => {
	test('AC1: a past execution redirects 303 to ?execution=1 and opens read-only', async ({
		page,
		request
	}) => {
		const url = resolver({ key: KEY, startedAt: FIRST!.createdAt });
		const response = await request.get(url, { maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(response.headers().location).toBe(ticketPage('?execution=1'));

		await page.goto(url);
		await expect(page).toHaveURL(ticketPage('?execution=1'));
		await expect(inspector(page)).toHaveAttribute('data-execution', '1');
		await expect(page.getByTestId('past-execution')).toBeVisible();
		await expect(commands(page)).toHaveCount(0);
		await expect(page.locator('[data-slot="ticket-actions"]')).toHaveCount(0);
		await expect(page.locator('[data-slot="reply-composer"]')).toHaveCount(0);
		await shot(page, 'ac1-past-execution-read-only');
	});

	test('AC2: the current execution redirects to its generation', async ({ page, request }) => {
		const url = resolver({ key: KEY, startedAt: CURRENT!.createdAt });
		const response = await request.get(url, { maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(response.headers().location).toBe(ticketPage(`?execution=${CURRENT!.generation}`));

		await page.goto(url);
		await expect(page).toHaveURL(ticketPage(`?execution=${CURRENT!.generation}`));
		await expect(inspector(page)).toHaveAttribute('data-execution', String(CURRENT!.generation));
		await expect(page.getByTestId('past-execution')).toHaveCount(0);
		await shot(page, 'ac2-current-execution');
	});

	test('AC3: a start matching no execution is a 404, never a redirect', async ({
		page,
		request
	}) => {
		const url = resolver({ key: KEY, startedAt: '2026-10-05T08:00:01Z' });
		const raw = await request.get(url, { maxRedirects: 0 });
		expect(raw.status()).toBe(404);
		expect(raw.headers().location).toBeUndefined();

		const response = await page.goto(url);
		expect(response?.status()).toBe(404);
		expect(new URL(page.url()).pathname).toBe('/stats/execution');
		await expect(
			page.getByRole('heading', { name: 'No such execution in this ticket' })
		).toBeVisible();
		await expect(inspector(page)).toHaveCount(0);
		await shot(page, 'ac3-no-such-execution');
	});

	test('AC4: a missing key or startedAt is a 400', async ({ page, request }) => {
		for (const params of [{ startedAt: FIRST!.createdAt }, { key: KEY }, {}] as Record<
			string,
			string
		>[]) {
			const res = await request.get(resolver(params), { maxRedirects: 0 });
			expect(res.status()).toBe(400);
		}
		const response = await page.goto(resolver({ key: KEY }));
		expect(response?.status()).toBe(400);
		await expect(inspector(page)).toHaveCount(0);
		await shot(page, 'ac4-invalid-link');
	});

	test('AC5: an unknown ticket is a 404', async ({ page }) => {
		const response = await page.goto(
			resolver({ key: 'qa-32-03-no-such-ticket', startedAt: FIRST!.createdAt })
		);
		expect(response?.status()).toBe(404);
		await expect(page.getByRole('heading', { name: 'No such ticket' })).toBeVisible();
	});

	test('AC6: no token or factory URL in any resolver response', async ({ request }) => {
		for (const params of [
			{ key: KEY, startedAt: FIRST!.createdAt },
			{ key: KEY, startedAt: '2026-10-05T08:00:01Z' },
			{ key: KEY },
			{ key: 'qa-32-03-no-such-ticket', startedAt: FIRST!.createdAt }
		] as Record<string, string>[]) {
			const res = await request.get(resolver(params), { maxRedirects: 0 });
			const text = JSON.stringify(res.headers()) + (await res.text());
			expect(text).not.toContain(FAKE_FACTORY_TOKEN);
			expect(text).not.toContain(FAKE_FACTORY_URL);
		}
	});
});

test.describe('QA 32-03: an unauthorized executions read', () => {
	const fake = scenario(7471, 4471, {
		failExecutions: { status: 401, title: 'Unauthorized', type: 'unauthorized', detail: LEAK }
	});

	test('AC5: the resolver shows the configuration error page', async ({ page }) => {
		await page.goto(`${fake.base}${resolver({ key: KEY, startedAt: FIRST!.createdAt })}`);
		await expect(
			page.getByText('The dashboard cannot reach the factory with its configuration')
		).toBeVisible();
		await expect(inspector(page)).toHaveCount(0);
		await shot(page, 'ac5-unauthorized-configuration-error');
	});

	test('AC6: no Problem detail, token or factory URL leaks', async ({ request }) => {
		const res = await request.get(
			`${fake.base}${resolver({ key: KEY, startedAt: FIRST!.createdAt })}`,
			{ maxRedirects: 0 }
		);
		const text = JSON.stringify(res.headers()) + (await res.text());
		expect(text).not.toContain(LEAK);
		expect(text).not.toContain(FAKE_FACTORY_TOKEN);
		expect(text).not.toContain(fake.fakeUrl);
	});
});

test.describe('QA 32-03: a failing executions read', () => {
	const fake = scenario(7472, 4472, {
		failExecutions: { status: 500, title: 'Internal error', type: 'internal_error', detail: LEAK }
	});

	test('AC6: a factory failure shows a safe error without its Problem detail', async ({ page }) => {
		const response = await page.goto(
			`${fake.base}${resolver({ key: KEY, startedAt: FIRST!.createdAt })}`
		);
		expect(response?.status()).toBe(502);
		const html = await page.content();
		expect(html).not.toContain(LEAK);
		expect(html).not.toContain(FAKE_FACTORY_TOKEN);
		expect(html).not.toContain(fake.fakeUrl);
		await expect(inspector(page)).toHaveCount(0);
	});
});
