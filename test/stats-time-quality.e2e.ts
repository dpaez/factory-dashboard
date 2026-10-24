import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	statsTicketMultiExecutionRow,
	statsTicketsComplete
} from '../src/lib/factory/fixtures/stats.ts';
import {
	FAKE_FACTORY_TOKEN,
	FAKE_STATS_TICKETS_PAGE_SIZE,
	startFakeFactory,
	type FakeFactoryOptions
} from './fake-factory';

// Ticket #32, task 04: time, quality, contributors and configurations on /stats.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (!SHOTS) return;
	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await page.evaluate((mode) => {
			document.documentElement.classList.toggle('dark', mode === 'dark');
		}, scheme);
		await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png`, fullPage: true });
	}
};

const SECRET_DETAIL = 'stats-tickets-secret: sqlite busy at /var/factory/facts.db';
const internal = {
	status: 500,
	title: 'Internal error',
	type: 'internal_error',
	detail: SECRET_DETAIL
} as const;

type Request = { method: string; path: string };
type Fake = { base: string; fakeUrl: string; requests: () => Request[] };

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions): Fake {
	let fake: Server;
	let requests: Request[] = [];
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
	return {
		base: `http://localhost:${appPort}`,
		fakeUrl: `http://127.0.0.1:${fakePort}`,
		requests: () => requests
	};
}

const queries = (fake: Fake, path: string) =>
	fake
		.requests()
		.filter((r) => r.path.startsWith(`${path}?`))
		.map((r) => new URL(r.path, fake.fakeUrl).searchParams);

const timePanel = (page: Page) => page.locator('[data-slot="time-breakdown"]');
const qualityPanel = (page: Page) => page.locator('[data-slot="tickets-quality"]');
const contributorsPanel = (page: Page) => page.locator('[data-slot="contributing-tickets"]');
const configurationsPanel = (page: Page) => page.locator('[data-slot="configuration-comparison"]');
const contributorRefs = (page: Page) => contributorsPanel(page).locator('tbody tr th');

async function expectNoLeaks(page: Page, fake: Fake) {
	const html = await (await page.request.get(`${fake.base}/stats`)).text();
	const dataJson = await (await page.request.get(`${fake.base}/stats/__data.json`)).text();
	for (const body of [html, dataJson]) {
		expect(body).not.toContain(FAKE_FACTORY_TOKEN);
		expect(body).not.toContain(fake.fakeUrl);
		expect(body).not.toContain('127.0.0.1');
		expect(body).not.toContain(SECRET_DETAIL);
	}
}

test.describe('the complete ticket cohort', () => {
	const fake = scenario(7481, 4481, {});

	test('time, quality and configurations render for the default window', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(timePanel(page)).toHaveAttribute('data-state', 'ready');
		await expect(qualityPanel(page)).toHaveAttribute('data-state', 'ready');
		await expect(configurationsPanel(page)).toHaveAttribute('data-state', 'ready');

		// Every read used the summary's window; the tickets pages ran to the end.
		const [summary] = queries(fake, '/v1/stats/summary');
		const from = summary?.get('from');
		const to = summary?.get('to');
		const pages = queries(fake, '/v1/stats/tickets');
		const expectedPages = Math.ceil(
			statsTicketsComplete.items.length / FAKE_STATS_TICKETS_PAGE_SIZE
		);
		expect(pages).toHaveLength(expectedPages);
		expect(pages.map((p) => p.get('cursor'))).toEqual([null, '5', '10']);
		for (const query of [
			...pages,
			...queries(fake, '/v1/stats/configurations'),
			...queries(fake, '/v1/stats/stages')
		]) {
			expect(query.get('from')).toBe(from);
			expect(query.get('to')).toBe(to);
		}

		// Ten of twelve rows, from all three pages, reached handoff.
		await expect(page.getByTestId('time-sample')).toContainText(
			'10 of 12 executions reached handoff'
		);
		await expect(page.getByTestId('time-excluded')).toHaveText('2 excluded');
		await expect(timePanel(page).locator('[data-figure="median"]')).toContainText('3 h 30 m');
		await expect(timePanel(page).locator('[data-figure="p90"]')).toContainText('8 h');
		await expect(timePanel(page).locator('[data-figure="p90"]')).toContainText('n = 10');
		await expect(timePanel(page).getByTestId('facts-incomplete')).toHaveCount(0);

		await expect(page.getByTestId('needed-a-person-value')).toContainText('50%');
		await expect(page.getByTestId('needed-a-person-value')).toContainText(
			'6 of 12 executions started'
		);
		await expect(
			qualityPanel(page).locator('[data-row="external-changes-requested"]')
		).toContainText('Unavailable');
		await expect(configurationsPanel(page).locator('tbody tr')).toHaveCount(2);

		// The default selection is the time sample.
		await expect(contributorsPanel(page).locator('[data-measure]')).toHaveAttribute(
			'data-measure',
			'timeSample'
		);
		await expect(contributorRefs(page)).toHaveCount(10);
		await shot(page, 'stats-time-quality-complete');
	});

	test('"Needed a person" lists exactly those executions and opens one read-only', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		await qualityPanel(page).getByRole('button', { name: 'Needed a person' }).click();
		await expect(page).toHaveURL(/[?&]measure=neededAPerson/);
		await expect(
			qualityPanel(page).getByRole('button', { name: 'Needed a person' })
		).toHaveAttribute('aria-pressed', 'true');
		await expect(contributorsPanel(page).locator('[data-measure]')).toHaveAttribute(
			'data-measure',
			'neededAPerson'
		);
		await expect(contributorRefs(page)).toHaveText([
			'dpaez/factory-dashboard#9',
			'dpaez/factory-dashboard#14',
			'dpaez/factory-dashboard#17',
			'KAI-21',
			'KAI-23',
			'dpaez/factory-dashboard#20'
		]);

		const row = contributorsPanel(page).locator(
			`tbody tr[data-key="${statsTicketMultiExecutionRow.key}"]`
		);
		await row.getByTestId('open-execution').click();
		await expect(page).toHaveURL(
			`${fake.base}/tickets/${encodeURIComponent(statsTicketMultiExecutionRow.key)}?execution=1`
		);
		await expect(page.getByTestId('ticket-inspector')).toHaveAttribute('data-execution', '1');
		await expect(page.getByTestId('past-execution')).toContainText('Past execution 1');
		await expect(page.locator('[data-slot="ticket-commands"]')).toHaveCount(0);
		await expect(page.locator('[data-slot="ticket-actions"]')).toHaveCount(0);
		await expect(page.locator('[data-slot="reply-composer"]')).toHaveCount(0);
	});

	test('?measure= selects the population on load', async ({ page }) => {
		await page.goto(`${fake.base}/stats?measure=timeExcluded`);
		await expect(contributorsPanel(page).locator('[data-measure]')).toHaveAttribute(
			'data-measure',
			'timeExcluded'
		);
		await expect(contributorRefs(page)).toHaveText(['dpaez/factory-dashboard#20', 'KAI-24']);
	});

	test('the page and its data carry no token, factory URL or Problem detail', async ({ page }) => {
		await expectNoLeaks(page, fake);
	});
});

test.describe('the no-handoffs ticket cohort', () => {
	const fake = scenario(7482, 4482, { statsTicketsCohort: 'noHandoffs' });

	test('the time headline is Unavailable with the excluded count, never 0', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		const mean = timePanel(page).locator('[data-figure="mean"]');
		await expect(mean).toContainText('Unavailable');
		await expect(mean).not.toContainText(/\b0 s\b/);
		await expect(page.getByTestId('time-sample')).toContainText(
			'0 of 3 executions reached handoff'
		);
		await expect(page.getByTestId('time-excluded')).toHaveText('3 excluded');
		await shot(page, 'stats-time-quality-no-handoffs');
	});
});

test.describe('a tickets page fails', () => {
	const fake = scenario(7483, 4483, {
		failStatsTickets: { atCursor: FAKE_STATS_TICKETS_PAGE_SIZE, problem: internal }
	});

	test('time, quality and contributors show the panel error; the rest renders', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		for (const panel of [timePanel(page), qualityPanel(page), contributorsPanel(page)]) {
			await expect(panel).toHaveAttribute('data-state', 'error');
			await expect(panel.getByTestId('panel-error-title')).toHaveText('Internal error');
		}
		await expect(page.locator('[data-slot="metric-summary-row"]')).toHaveAttribute(
			'data-state',
			'ready'
		);
		await expect(page.locator('[data-slot="stage-table"]')).toHaveAttribute('data-state', 'ready');
		await expect(configurationsPanel(page)).toHaveAttribute('data-state', 'ready');
		// The pager stopped at the failing page: no figure renders from the first page alone.
		expect(queries(fake, '/v1/stats/tickets').map((p) => p.get('cursor'))).toContain('5');
		await shot(page, 'stats-time-quality-tickets-failed');
		await expectNoLeaks(page, fake);
	});
});

test.describe('the configurations read fails', () => {
	const fake = scenario(7484, 4484, { failStatsConfigurations: internal });

	test('only the configuration comparison shows the panel error', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(configurationsPanel(page)).toHaveAttribute('data-state', 'error');
		await expect(configurationsPanel(page).getByTestId('panel-error-title')).toHaveText(
			'Internal error'
		);
		await expect(timePanel(page)).toHaveAttribute('data-state', 'ready');
		await expect(qualityPanel(page)).toHaveAttribute('data-state', 'ready');
		await expect(contributorsPanel(page)).toHaveAttribute('data-state', 'ready');
		await expect(page.locator('[data-slot="metric-summary-row"]')).toHaveAttribute(
			'data-state',
			'ready'
		);
		await expectNoLeaks(page, fake);
	});
});
