import type { Page } from '@playwright/test';

import {
	statsTicketMultiExecutionRow,
	statsTicketsComplete,
	statsTicketsNoHandoffs
} from '../src/lib/factory/fixtures/stats.ts';
import {
	FAKE_STATS_COHORTS,
	FAKE_STATS_TICKETS_PAGE_SIZE,
	type FakeFactoryOptions
} from './fake-factory.ts';
import { expect, gotoLive, test, type FakeFixture } from './fixtures.ts';

// The /stats route against the fake factory: the cohort header and every
// panel, the one window every read shares, a failing read blanking only its
// own panels, and the cohorts whose figures must read Unavailable rather than
// 0. The load's view models are proved by src/routes/stats/page.server.test.ts,
// the panels' states by their stories; the execution links by
// stats-execution.e2e.ts.

const DAY = 86_400_000;
const LEAK = 'stats-upstream-secret: sqlite busy at /var/factory/stats.db';
const internal = {
	status: 500,
	title: 'Internal error',
	type: 'internal_error',
	detail: LEAK
} as const;

/** Every panel on /stats, by its `data-slot`. */
const PANELS = [
	'metric-summary-row',
	'stage-table',
	'tokens-by-stage',
	'time-breakdown',
	'tickets-quality',
	'contributing-tickets',
	'configuration-comparison',
	'efficiency-signals'
] as const;
type Panel = (typeof PANELS)[number];

const panel = (page: Page, slot: Panel) => page.locator(`[data-slot="${slot}"]`);
const mergeRate = (page: Page) => page.locator('[data-metric="merge-rate"]');
const timePanel = (page: Page) => panel(page, 'time-breakdown');
const qualityPanel = (page: Page) => panel(page, 'tickets-quality');
const contributors = (page: Page) => panel(page, 'contributing-tickets');
const contributorRefs = (page: Page) => contributors(page).locator('tbody tr th');
const efficiency = (page: Page) => panel(page, 'efficiency-signals');

/** Inactive secondary tabs stay mounted but hidden. Open the tab before asserting one. */
async function showSecondary(page: Page, slot: Panel) {
	const tab =
		slot === 'tickets-quality'
			? 'Quality'
			: slot === 'efficiency-signals'
				? 'Efficiency'
				: slot === 'configuration-comparison'
					? 'Configurations'
					: null;
	if (tab) await page.getByRole('tab', { name: tab }).click();
}
const noReturns = (page: Page) => page.getByTestId('no-returns-to-work-value');
const shares = (page: Page) =>
	efficiency(page).locator(
		'[data-row="waiting-share"], [data-row="blended-cost-per-merged"], [data-row="rework-token-share"], [data-row="usage-coverage"]'
	);
const label = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/** The stats reads the fake received from `since` on, with their query. */
const statsReads = (fake: FakeFixture, since = 0) =>
	fake
		.requests()
		.slice(since)
		.map((request) => new URL(request.path, fake.url))
		.filter((url) => url.pathname.startsWith('/v1/stats/'));

/** `/stats` and its `__data.json` carry no token, factory URL, Problem detail or export line. */
async function expectNoLeaks(page: Page, fake: FakeFixture, search = '') {
	for (const path of [`/stats${search}`, `/stats/__data.json${search}`]) {
		const body = await (await page.request.get(path)).text();
		expect(body).toContain('stats.v1');
		for (const secret of [fake.token, fake.url, '127.0.0.1', LEAK]) {
			expect.soft(body, `${path} leaks ${secret}`).not.toContain(secret);
		}
		// Raw NDJSON export lines never reach the page.
		expect(body).not.toMatch(/"type"\s*:\s*"(ticket|run|stage)"/);
		expect(body).not.toMatch(/\\"type\\"\s*:\s*\\"(ticket|run|stage)\\"/);
	}
}

/** Every efficiency share and the No-returns figure read Unavailable, never a number. */
async function expectNoShareNumbers(page: Page) {
	await expect(shares(page)).toHaveCount(4);
	for (const row of await shares(page).all()) {
		await expect(row).toHaveAttribute('data-availability', 'unavailable');
		await expect(row.locator('dd > span').first().locator('span').first()).toHaveText(
			/^—\s*Unavailable$/
		);
	}
	await expect(noReturns(page).locator('span').first()).toHaveText(/^—\s*Unavailable$/);
	await expect(noReturns(page)).not.toContainText('%');
}

test.describe('the complete cohort', () => {
	test('the Stats nav opens /stats with the cohort header and every panel', async ({
		page,
		shot
	}) => {
		await gotoLive(page, '/');
		await page.getByRole('link', { name: 'Stats' }).click();
		await expect(page).toHaveURL(/\/stats$/);
		await expect(page.getByRole('heading', { level: 2, name: 'Factory stats' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Stats' })).toHaveAttribute('aria-current', 'page');

		const summary = FAKE_STATS_COHORTS.complete.summary;
		await expect(page.getByTestId('cohort-factory')).toHaveText(summary.factoryId);
		await expect(page.getByTestId('cohort-versions')).toHaveText(
			summary.factoryVersions.join(', ')
		);
		await expect(page.getByTestId('cohort-definitions')).toHaveText('stats.v1');
		await expect(page.getByTestId('cohort-mismatch')).toHaveCount(0);
		await expect(page.getByTestId('window-notice')).toHaveCount(0);
		for (const slot of PANELS) {
			await showSecondary(page, slot);
			await expect(panel(page, slot)).toHaveAttribute('data-state', 'ready');
		}
		await expect(page.locator('[data-slot="measurement-notes"]')).toBeVisible();
		await shot('stats-complete');
	});

	test('the figures come from the summary, every tickets page and the export', async ({ page }) => {
		await gotoLive(page, '/stats');
		await expect(mergeRate(page)).toContainText('80%');
		await expect(page.getByTestId('merge-rate-denominator')).toContainText('16 of 20 finished');

		// Ten of twelve rows, from all three pages, reached handoff.
		const all = statsTicketsComplete.items;
		expect(all.length).toBeGreaterThan(2 * FAKE_STATS_TICKETS_PAGE_SIZE);
		const handedOff = all.filter((row) => row.startToHandoffMs !== null).length;
		await expect(page.getByTestId('time-sample')).toContainText(
			`${handedOff} of ${all.length} executions reached handoff`
		);
		await expect(page.getByTestId('time-excluded')).toHaveText(
			`${all.length - handedOff} excluded`
		);
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
		await showSecondary(page, 'configuration-comparison');
		await expect(panel(page, 'configuration-comparison').locator('tbody tr')).toHaveCount(2);

		// The default contributors are the time sample.
		await expect(contributors(page).locator('[data-measure]')).toHaveAttribute(
			'data-measure',
			'timeSample'
		);
		await expect(contributorRefs(page)).toHaveCount(handedOff);

		await showSecondary(page, 'efficiency-signals');
		const blended = efficiency(page).locator('[data-row="blended-cost-per-merged"]');
		await expect(blended).toHaveAttribute('data-availability', 'complete');
		await expect(blended).toContainText('$3.01');
		await expect(blended.getByTestId('blended-parts')).toContainText('16 merged');
		await expect(efficiency(page).getByTestId('export-status')).toHaveCount(0);
		const row = page.locator('[data-row="no-returns-to-work"]');
		await expect(row).toHaveAttribute('data-availability', 'complete');
		await expect(noReturns(page)).toContainText('85%');
		await expect(noReturns(page)).toContainText('17 of 20 executions that reached handoff');
	});

	test('every stats read of a load uses one identical window, all tickets pages and the export included', async ({
		page,
		fake
	}) => {
		const pages = Math.ceil(statsTicketsComplete.items.length / FAKE_STATS_TICKETS_PAGE_SIZE);
		expect(pages).toBeGreaterThan(1);
		const cursors = Array.from({ length: pages }, (_, i) =>
			i === 0 ? 'first' : String(i * FAKE_STATS_TICKETS_PAGE_SIZE)
		);
		/** One load's reads: exactly one `from`/`to` pair, and every read once. */
		const expectOneLoad = (reads: URL[]) => {
			const windows = new Set(
				reads.map((url) => `${url.searchParams.get('from')}|${url.searchParams.get('to')}`)
			);
			expect(windows.size, [...windows].join(', ')).toBe(1);
			const count = (path: string) => reads.filter((url) => url.pathname === path).length;
			for (const path of [
				'/v1/stats/summary',
				'/v1/stats/stages',
				'/v1/stats/configurations',
				'/v1/stats/export'
			]) {
				expect(count(path), path).toBe(1);
			}
			const stages = reads.find((url) => url.pathname === '/v1/stats/stages')!;
			expect(stages.searchParams.get('groupBy')).toBe('setup');
			// Every tickets page, followed to the end.
			const tickets = reads
				.filter((url) => url.pathname === '/v1/stats/tickets')
				.map((url) => url.searchParams.get('cursor') ?? 'first');
			expect(tickets).toEqual(cursors);
			return [...windows][0]!.split('|') as [string, string];
		};

		// The server finishes the first load before it answers, so its reads all
		// come before the reread that the live stream's open triggers: split by count.
		await gotoLive(page, '/stats');
		const perLoad = 4 + pages;
		const reads = statsReads(fake);
		expect(reads).toHaveLength(2 * perLoad);
		const firstLoad = reads.slice(0, perLoad);
		const secondLoad = reads.slice(perLoad);

		const [from, to] = expectOneLoad(firstLoad);
		expect(Date.parse(to) - Date.parse(from)).toBe(30 * DAY);
		const [rereadFrom, rereadTo] = expectOneLoad(secondLoad);
		expect(Date.parse(rereadTo) - Date.parse(rereadFrom)).toBe(30 * DAY);
		await expect(page.getByTestId('cohort-window')).toContainText(
			`${label(rereadFrom)} – before ${label(rereadTo)}`
		);
	});

	test('a chosen window is the one window of the whole visit, the live reread included', async ({
		page,
		fake
	}) => {
		await gotoLive(page, '/stats?from=2026-09-01&to=2026-09-30');
		const reads = statsReads(fake);
		// The first load and the reread the stream's open triggers.
		expect(reads.filter((url) => url.pathname === '/v1/stats/summary')).toHaveLength(2);
		expect(reads.filter((url) => url.pathname === '/v1/stats/export')).toHaveLength(2);
		const windows = new Set(
			reads.map((url) => `${url.searchParams.get('from')}|${url.searchParams.get('to')}`)
		);
		expect([...windows]).toEqual(['2026-09-01T00:00:00Z|2026-10-01T00:00:00Z']);
	});

	test('submitting a window reloads /stats and every read uses it', async ({
		page,
		fake,
		shot
	}) => {
		await gotoLive(page, '/stats');
		const since = fake.requests().length;
		await page.getByLabel('Started on or after').fill('2026-09-01');
		await page.getByLabel('Started on or before').fill('2026-09-30');
		await page.getByRole('button', { name: 'Apply' }).click();
		await expect(page).toHaveURL(/\/stats\?from=2026-09-01&to=2026-09-30$/);
		await expect(page.getByTestId('cohort-window')).toContainText(
			'2026-09-01 00:00 UTC – before 2026-10-01 00:00 UTC'
		);
		await expect(page.getByLabel('Started on or after')).toHaveValue('2026-09-01');
		await expect(page.getByLabel('Started on or before')).toHaveValue('2026-09-30');
		await expect(page.getByTestId('window-notice')).toHaveCount(0);
		await showSecondary(page, 'efficiency-signals');
		await expect(efficiency(page)).toHaveAttribute('data-state', 'ready');

		const reads = statsReads(fake, since);
		expect(new Set(reads.map((url) => url.pathname))).toEqual(
			new Set([
				'/v1/stats/summary',
				'/v1/stats/stages',
				'/v1/stats/tickets',
				'/v1/stats/configurations',
				'/v1/stats/export'
			])
		);
		for (const url of reads) {
			expect(url.searchParams.get('from'), url.pathname).toBe('2026-09-01T00:00:00Z');
			expect(url.searchParams.get('to'), url.pathname).toBe('2026-10-01T00:00:00Z');
		}
		await shot('stats-chosen-window');
	});

	test('an invalid or inverted window falls back to the last 30 days with a notice', async ({
		page,
		fake,
		shot
	}) => {
		for (const search of ['?from=2026-10-01&to=2026-09-01', '?from=garbage&to=2026-13-45']) {
			const since = fake.requests().length;
			await page.goto(`/stats${search}`);
			await expect(page.getByTestId('window-notice')).toContainText('Showing the last 30 days');
			const reads = statsReads(fake, since);
			// Summary, stages, configurations, the export and every tickets page.
			expect(reads.length).toBeGreaterThanOrEqual(5);
			const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
			for (const url of reads) {
				expect(url.search).not.toContain('garbage');
				const from = url.searchParams.get('from')!;
				const to = url.searchParams.get('to')!;
				expect(from).toMatch(iso);
				expect(to).toMatch(iso);
				expect(Date.parse(to) - Date.parse(from)).toBe(30 * DAY);
			}
			const first = reads[0]!.searchParams;
			await expect(page.getByTestId('cohort-window')).toContainText(
				`${label(first.get('from')!)} – before ${label(first.get('to')!)}`
			);
		}
		await shot('stats-invalid-window');
	});

	test('?measure= selects the population on load', async ({ page }) => {
		await page.goto('/stats?measure=timeExcluded');
		await expect(contributors(page).locator('[data-measure]')).toHaveAttribute(
			'data-measure',
			'timeExcluded'
		);
		await expect(contributorRefs(page)).toHaveText(['dpaez/factory-dashboard#20', 'KAI-24']);
	});

	test('"Needed a person" lists exactly those executions and opens one read-only', async ({
		page,
		shot
	}) => {
		await gotoLive(page, '/stats');
		const button = qualityPanel(page).getByRole('button', { name: 'Needed a person' });
		await button.click();
		await expect(page).toHaveURL(/[?&]measure=neededAPerson/);
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		await expect(contributors(page).locator('[data-measure]')).toHaveAttribute(
			'data-measure',
			'neededAPerson'
		);
		const expected = statsTicketsComplete.items
			.filter((row) => Object.values(row.interventions).some((n) => n > 0))
			.map((row) => row.displayRef);
		expect(expected).toEqual([
			'dpaez/factory-dashboard#9',
			'dpaez/factory-dashboard#14',
			'dpaez/factory-dashboard#17',
			'KAI-21',
			'KAI-23',
			'dpaez/factory-dashboard#20'
		]);
		await expect(contributorRefs(page)).toHaveText(expected);
		await shot('stats-needed-a-person');

		await contributors(page)
			.locator(`tbody tr[data-key="${statsTicketMultiExecutionRow.key}"]`)
			.getByTestId('open-execution')
			.click();
		await expect(page).toHaveURL(
			`/tickets/${encodeURIComponent(statsTicketMultiExecutionRow.key)}?execution=1`
		);
		await expect(page.getByTestId('ticket-inspector')).toHaveAttribute('data-execution', '1');
		await expect(page.getByText('Past execution 1, read-only.')).toBeVisible();
		await expect(page.locator('[data-slot="ticket-commands"]')).toHaveCount(0);
		await expect(page.locator('[data-slot="ticket-actions"]')).toHaveCount(0);
		await expect(page.locator('[data-slot="reply-composer"]')).toHaveCount(0);
		await expect(page.getByRole('textbox')).toHaveCount(0);
	});

	test('the page and its data carry no token, factory URL or export lines', async ({
		page,
		fake
	}) => {
		await expectNoLeaks(page, fake);
		await expectNoLeaks(page, fake, '?from=2026-09-01&to=2026-09-30&measure=neededAPerson');
	});
});

/** One failing read, and the panels it alone blanks. */
const failingReads: {
	read: string;
	options: FakeFactoryOptions;
	errored: Panel[];
	also?: (page: Page, fake: FakeFixture) => Promise<void>;
}[] = [
	{
		read: 'the summary',
		options: { failStatsSummary: internal },
		errored: ['metric-summary-row'],
		also: async (page) => {
			await expect(
				panel(page, 'tokens-by-stage').locator('[data-slot="token-bar"]').first()
			).toBeVisible();
			await expect(page.getByTestId('tokens-coverage')).toContainText('Unavailable');
		}
	},
	{
		read: 'the stages',
		options: { failStatsStages: internal },
		errored: ['stage-table', 'tokens-by-stage'],
		also: async (page) => {
			await expect(mergeRate(page)).toContainText('80%');
			await expect(page.getByTestId('cohort-factory')).toHaveText('factory-geut-01');
		}
	},
	{
		read: 'a later tickets page',
		options: { failStatsTickets: { atCursor: FAKE_STATS_TICKETS_PAGE_SIZE, problem: internal } },
		errored: ['time-breakdown', 'tickets-quality', 'contributing-tickets'],
		also: async (page, fake) => {
			// The pager reached the failing page: no figure renders from the first page alone.
			const cursors = statsReads(fake)
				.filter((url) => url.pathname === '/v1/stats/tickets')
				.map((url) => url.searchParams.get('cursor'));
			expect(cursors).toContain(String(FAKE_STATS_TICKETS_PAGE_SIZE));
			await expect(page.getByTestId('time-sample')).toHaveCount(0);
		}
	},
	{
		read: 'every tickets page',
		options: { failStatsTickets: internal },
		errored: ['time-breakdown', 'tickets-quality', 'contributing-tickets']
	},
	{
		read: 'the configurations',
		options: { failStatsConfigurations: internal },
		errored: ['configuration-comparison']
	},
	{
		read: 'the export',
		options: { failStatsExport: internal },
		errored: ['efficiency-signals'],
		also: async (page) => {
			await expect(noReturns(page)).toContainText('Unavailable');
			await expect(noReturns(page)).not.toContainText('%');
		}
	}
];

for (const { read, options, errored, also } of failingReads) {
	test.describe(`${read} read fails`, () => {
		test.use({ fakeOptions: options });

		test('only its own panels show the panel error, without the Problem detail', async ({
			page,
			fake,
			shot
		}) => {
			await page.goto('/stats');
			for (const slot of PANELS) {
				await showSecondary(page, slot);
				if (errored.includes(slot)) {
					await expect(panel(page, slot), slot).toHaveAttribute('data-state', 'error');
					await expect(panel(page, slot).getByTestId('panel-error-title')).toHaveText(
						'Internal error'
					);
				} else {
					await expect(panel(page, slot), slot).toHaveAttribute('data-state', 'ready');
				}
			}
			await expect(page.getByText(LEAK)).toHaveCount(0);
			await also?.(page, fake);
			await shot(`stats-${read.replaceAll(' ', '-')}-failed`);
			await expectNoLeaks(page, fake);
		});
	});
}

test.describe('an unauthorized stats read', () => {
	test.use({
		fakeOptions: {
			failStatsStages: { status: 401, title: 'Unauthorized', type: 'unauthorized', detail: LEAK }
		}
	});

	test('the page shows the configuration error and no Problem detail', async ({
		page,
		fake,
		shot
	}) => {
		const response = await page.goto('/stats');
		expect(response?.status()).toBe(503);
		await expect(
			page.getByText('The dashboard cannot reach the factory with its configuration')
		).toBeVisible();
		await expect(panel(page, 'metric-summary-row')).toHaveCount(0);
		await shot('stats-unauthorized');
		for (const path of ['/stats', '/stats/__data.json']) {
			const body = await (await page.request.get(path)).text();
			for (const secret of [fake.token, fake.url, '127.0.0.1', LEAK]) {
				expect.soft(body, `${path} leaks ${secret}`).not.toContain(secret);
			}
		}
	});
});

test.describe('the zero-merges cohort', () => {
	test.use({ fakeOptions: { statsCohort: 'zeroMerges' } });

	test('merge rate reads 0% with its denominator', async ({ page }) => {
		await page.goto('/stats');
		await expect(mergeRate(page)).toContainText('0%');
		await expect(page.getByTestId('merge-rate-denominator')).toContainText('0 of 3 finished');
	});
});

test.describe('the empty cohort', () => {
	test.use({ fakeOptions: { statsCohort: 'empty' } });

	test('merge rate reads Unavailable, never 0%', async ({ page, shot }) => {
		await page.goto('/stats');
		await expect(mergeRate(page)).toContainText('Unavailable');
		await expect(mergeRate(page)).not.toContainText('0%');
		await expect(page.getByTestId('merge-rate-denominator')).toContainText('No finished tickets');
		await shot('stats-empty');
	});
});

test.describe('the no-handoffs ticket cohort', () => {
	test.use({ fakeOptions: { statsTicketsCohort: 'noHandoffs' } });

	test('the time headline reads Unavailable with the excluded count, never 0', async ({
		page,
		shot
	}) => {
		await page.goto('/stats');
		const n = statsTicketsNoHandoffs.items.length;
		const mean = timePanel(page).locator('[data-figure="mean"]');
		await expect(mean).toContainText('Unavailable');
		await expect(mean).not.toContainText(/\b0\s?(s|m|h|ms)\b/);
		await expect(page.getByTestId('time-sample')).toContainText(
			`0 of ${n} executions reached handoff`
		);
		await expect(page.getByTestId('time-excluded')).toHaveText(`${n} excluded`);
		await shot('stats-no-handoffs');
	});
});

test.describe('the QA-disabled cohort', () => {
	test.use({ fakeOptions: { statsCohort: 'qaDisabled' } });

	test('the QA stage reads "No runs in this cohort" in the table and the token bars', async ({
		page
	}) => {
		await page.goto('/stats');
		await expect(panel(page, 'tokens-by-stage').locator('[data-stage="qa"]')).toContainText(
			'No runs in this cohort'
		);
		await expect(panel(page, 'stage-table')).toContainText('No runs in this cohort');
	});
});

test.describe('the mismatched cohort', () => {
	test.use({ fakeOptions: { statsCohort: 'mismatch' } });

	test('the header flags the mismatch and token coverage reads Unavailable', async ({ page }) => {
		await page.goto('/stats');
		await expect(page.getByTestId('cohort-mismatch')).toBeVisible();
		await expect(panel(page, 'metric-summary-row')).toHaveAttribute('data-state', 'ready');
		await expect(panel(page, 'tokens-by-stage')).toHaveAttribute('data-state', 'ready');
		await expect(page.getByTestId('tokens-coverage')).toContainText('Unavailable');
		await expect(page.getByTestId('tokens-coverage')).not.toContainText('100%');
	});
});

/** An export the parser cannot fully read, and the malformed count it shows. */
const brokenExports: { name: string; options: FakeFactoryOptions; count: string }[] = [
	{
		name: 'has malformed lines',
		options: { statsExportMalformed: true },
		count: '2 malformed lines'
	},
	{ name: 'is truncated', options: { statsExportTruncate: true }, count: '1 malformed line' }
];

for (const { name, options, count } of brokenExports) {
	test.describe(`the export ${name}`, () => {
		test.use({ fakeOptions: options });

		test('the malformed-line count shows and no share is a number', async ({
			page,
			fake,
			shot
		}) => {
			await page.goto('/stats');
			await showSecondary(page, 'efficiency-signals');
			await expect(efficiency(page)).toHaveAttribute('data-state', 'ready');
			await expect(efficiency(page).getByTestId('export-status')).toContainText(count);
			await expectNoShareNumbers(page);
			await shot(`stats-export-${name.replaceAll(' ', '-')}`);
			await expectNoLeaks(page, fake);
		});
	});
}
