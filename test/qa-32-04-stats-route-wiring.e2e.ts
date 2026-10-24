import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	statsTicketMultiExecutionRow,
	statsTicketsComplete,
	statsTicketsNoHandoffs
} from '../src/lib/factory/fixtures/stats.ts';
import {
	FAKE_FACTORY_TOKEN,
	FAKE_STATS_TICKETS_PAGE_SIZE,
	startFakeFactory,
	type FakeFactoryOptions
} from './fake-factory';

// QA for ticket #32, task 04: /stats wires time, quality, contributors and configurations.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const LEAK = 'qa-32-04 leaked detail: /srv/factory/facts.sqlite locked';
const internal = { status: 500, title: 'Internal error', type: 'internal_error', detail: LEAK };
const PANEL_ERROR = 'This panel could not be read. Other panels are unaffected.';

type Req = { method: string; path: string };
type Fake = { base: string; fakeUrl: string; requests: () => Req[] };

function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions): Fake {
	let fake: Server;
	let requests: Req[] = [];
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake, requests } = await startFakeFactory(fakePort, options));
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
	return {
		base: `http://localhost:${appPort}`,
		fakeUrl: `http://127.0.0.1:${fakePort}`,
		requests: () => requests
	};
}

const reads = (fake: Fake, path: string, since = 0) =>
	fake
		.requests()
		.slice(since)
		.map((r) => new URL(r.path, fake.fakeUrl))
		.filter((u) => u.pathname === path)
		.map((u) => u.searchParams);

const panel = (page: Page, name: string) => page.getByRole('article', { name });
const time = (page: Page) => panel(page, 'Time to handoff');
const quality = (page: Page) => panel(page, 'Tickets quality');
const contributors = (page: Page) => panel(page, 'Contributing executions');
const configurations = (page: Page) => panel(page, 'Factory configurations');
const summary = (page: Page) => panel(page, 'Cohort summary');
const stages = (page: Page) => panel(page, 'Stages');

const totalInterventions = (row: (typeof statsTicketsComplete.items)[number]) =>
	Object.values(row.interventions).reduce((sum, n) => sum + n, 0);

async function expectNoLeaks(page: Page, fake: Fake) {
	for (const path of ['/stats', '/stats/__data.json']) {
		const body = await (await page.request.get(`${fake.base}${path}`)).text();
		expect(body).not.toContain(FAKE_FACTORY_TOKEN);
		expect(body).not.toContain(fake.fakeUrl);
		expect(body).not.toContain(LEAK);
	}
}

test.describe('QA 32-04: the complete multi-page cohort', () => {
	const fake = scenario(7491, 4491, {});

	test('AC1: time breakdown, tickets quality and configurations render for the default window', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		for (const p of [time(page), quality(page), configurations(page)]) {
			await expect(p).toBeVisible();
			await expect(p.getByText(PANEL_ERROR)).toHaveCount(0);
		}
		await expect(time(page).getByText(/executions reached handoff/)).toBeVisible();
		await expect(quality(page).getByRole('button', { name: 'Needed a person' })).toBeVisible();
		await expect(configurations(page).getByRole('table')).toBeVisible();
		await shot(page, 'ac1-stats-time-quality-configurations');
	});

	test('AC2: every tickets page and configurations use the summary window, pages followed to the end', async ({
		page
	}) => {
		const since = fake.requests().length;
		await page.goto(`${fake.base}/stats`);
		await expect(time(page).getByText(/executions reached handoff/)).toBeVisible();

		const [s] = reads(fake, '/v1/stats/summary', since);
		expect(s, 'summary read').toBeTruthy();
		const tickets = reads(fake, '/v1/stats/tickets', since);
		const configs = reads(fake, '/v1/stats/configurations', since);
		expect(configs.length).toBeGreaterThanOrEqual(1);
		const pages = Math.ceil(statsTicketsComplete.items.length / FAKE_STATS_TICKETS_PAGE_SIZE);
		expect(pages).toBeGreaterThan(1);
		// The fake returns nextCursor null after the last page; every page was requested.
		const expected = Array.from({ length: pages }, (_, i) =>
			i === 0 ? null : String(i * FAKE_STATS_TICKETS_PAGE_SIZE)
		);
		expect(tickets.map((q) => q.get('cursor'))).toEqual(expected);
		for (const q of [...tickets, ...configs]) {
			expect(q.get('from')).toBe(s!.get('from'));
			expect(q.get('to')).toBe(s!.get('to'));
		}
	});

	test('AC3: the time sample counts rows from every page', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		const all = statsTicketsComplete.items;
		const handedOff = all.filter((r) => r.startToHandoffMs !== null).length;
		expect(all.length).toBeGreaterThan(2 * FAKE_STATS_TICKETS_PAGE_SIZE);
		await expect(time(page).getByText(/executions reached handoff/)).toContainText(
			`${handedOff} of ${all.length} executions reached handoff`
		);
	});

	test('AC7: "Needed a person" lists exactly those executions and opens generation 1 read-only', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		await quality(page).getByRole('button', { name: 'Needed a person' }).click();
		const expected = statsTicketsComplete.items
			.filter((r) => totalInterventions(r) > 0)
			.map((r) => r.displayRef);
		expect(expected.length).toBeGreaterThan(0);
		const rows = contributors(page).getByRole('row').filter({ has: page.getByRole('rowheader') });
		await expect(rows.getByRole('rowheader')).toHaveText(expected);
		await shot(page, 'ac7-needed-a-person-contributors');

		await rows
			.filter({ hasText: statsTicketMultiExecutionRow.displayRef })
			.getByRole('link', { name: /Open execution/ })
			.click();
		await expect(page).toHaveURL(
			`${fake.base}/tickets/${encodeURIComponent(statsTicketMultiExecutionRow.key)}?execution=1`
		);
		await expect(page.getByText('Past execution 1, read-only.')).toBeVisible();
		await expect(
			page.getByRole('button', { name: /^(Stop|Retry|Rerun|Complete|Cancel|Reply|Send)/ })
		).toHaveCount(0);
		await expect(page.getByRole('textbox')).toHaveCount(0);
		await shot(page, 'ac7-execution-1-read-only');
	});

	test('AC8: /stats HTML and __data.json carry no token or factory URL', async ({ page }) => {
		await expectNoLeaks(page, fake);
	});
});

test.describe('QA 32-04: a later tickets page fails', () => {
	const fake = scenario(7492, 4492, {
		failStatsTickets: { atCursor: FAKE_STATS_TICKETS_PAGE_SIZE, problem: internal }
	});

	test('AC4: time, quality and contributors show the panel error; summary, stages, configurations render', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		for (const p of [time(page), quality(page), contributors(page)]) {
			await expect(p.getByText(PANEL_ERROR)).toBeVisible();
		}
		await expect(time(page).getByText(/executions reached handoff/)).toHaveCount(0);
		for (const p of [summary(page), stages(page), configurations(page)]) {
			await expect(p).toBeVisible();
			await expect(p.getByText(PANEL_ERROR)).toHaveCount(0);
		}
		await expect(configurations(page).getByRole('table')).toBeVisible();
		await shot(page, 'ac4-tickets-page-failed');
	});

	test('AC8: no Problem detail leaks when a tickets page fails', async ({ page }) => {
		await expectNoLeaks(page, fake);
	});
});

test.describe('QA 32-04: every tickets page fails', () => {
	const fake = scenario(7493, 4493, { failStatsTickets: internal });

	test('AC4: the first tickets page failing errors only the ticket-fact panels', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		for (const p of [time(page), quality(page), contributors(page)]) {
			await expect(p.getByText(PANEL_ERROR)).toBeVisible();
		}
		for (const p of [summary(page), stages(page), configurations(page)]) {
			await expect(p.getByText(PANEL_ERROR)).toHaveCount(0);
		}
	});
});

test.describe('QA 32-04: the configurations read fails', () => {
	const fake = scenario(7494, 4494, { failStatsConfigurations: internal });

	test('AC5: only the configuration comparison shows the panel error', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(configurations(page).getByText(PANEL_ERROR)).toBeVisible();
		await expect(page.getByText(PANEL_ERROR)).toHaveCount(1);
		await expect(time(page).getByText(/executions reached handoff/)).toBeVisible();
		await expect(quality(page).getByRole('button', { name: 'Needed a person' })).toBeVisible();
		await shot(page, 'ac5-configurations-failed');
	});

	test('AC8: no Problem detail leaks when configurations fail', async ({ page }) => {
		await expectNoLeaks(page, fake);
	});
});

test.describe('QA 32-04: the no-handoffs cohort', () => {
	const fake = scenario(7495, 4495, { statsTicketsCohort: 'noHandoffs' });

	test('AC6: the time headline reads Unavailable with the excluded count, never 0', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		const n = statsTicketsNoHandoffs.items.length;
		await expect(time(page).getByText(/executions reached handoff/)).toContainText(
			`0 of ${n} executions reached handoff`
		);
		await expect(time(page).getByText(`${n} excluded`)).toBeVisible();
		const headline = time(page).getByRole('definition').first();
		await expect(headline).toContainText('Unavailable');
		await expect(headline).not.toContainText(/\b0\s?(s|m|h|ms)\b/);
		await shot(page, 'ac6-no-handoffs-unavailable');
	});
});
