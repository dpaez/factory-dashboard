import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	FAKE_FACTORY_TOKEN,
	FAKE_STATS_COHORTS,
	startFakeFactory,
	type FakeFactoryOptions
} from './fake-factory';

// QA for ticket #31, task 03: the /stats route against the fake factory.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const DAY = 86_400_000;
const LEAK = 'qa-31-03 leaked detail: /srv/factory/stats.sqlite locked';
const internal = {
	status: 500,
	title: 'Internal error',
	type: 'internal_error',
	detail: LEAK
} as const;

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

const statsReads = (fake: Fake, since = 0) =>
	fake
		.requests()
		.slice(since)
		.filter((r) => r.path.startsWith('/v1/stats/'))
		.map((r) => ({ path: r.path, url: new URL(r.path, fake.fakeUrl) }));

const label = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const summaryRow = (page: Page) => page.getByRole('article', { name: 'Cohort summary' });
const stagesPanel = (page: Page) => page.getByRole('article', { name: 'Stages' });
const tokensPanel = (page: Page) => page.getByRole('article', { name: 'Tokens by stage' });
const mergeCard = (page: Page) => summaryRow(page).locator('[data-metric="merge-rate"]');
const PANEL_ERROR = 'This panel could not be read. Other panels are unaffected.';

test.describe('QA 31-03: the complete cohort', () => {
	const fake = scenario(7461, 4461, {});

	test('AC1: the Stats nav opens /stats with the cohort header', async ({ page }) => {
		await page.goto(`${fake.base}/`);
		await page.getByRole('link', { name: 'Stats' }).click();
		await expect(page).toHaveURL(`${fake.base}/stats`);
		await expect(page.getByRole('heading', { name: 'Factory stats' })).toBeVisible();

		const reads = statsReads(fake);
		const from = reads.at(-1)!.url.searchParams.get('from')!;
		const to = reads.at(-1)!.url.searchParams.get('to')!;
		expect(Date.parse(to) - Date.parse(from)).toBe(30 * DAY);
		await expect(
			page.getByText(`tickets started ${label(from)} – before ${label(to)}`)
		).toBeVisible();

		const summary = FAKE_STATS_COHORTS.complete.summary;
		const header = page.locator('[data-slot="cohort-header"]');
		await expect(header).toContainText(summary.factoryId);
		await expect(header).toContainText(summary.factoryVersions.join(', '));
		await expect(header).toContainText('stats.v1');
		await shot(page, 'ac1-stats-complete');
	});

	test('AC2: summary and stages reads receive the identical from and to', async ({ page }) => {
		const since = fake.requests().length;
		await page.goto(`${fake.base}/stats`);
		await expect(page.getByRole('heading', { name: 'Factory stats' })).toBeVisible();
		const reads = statsReads(fake, since);
		const summary = reads.find((r) => r.url.pathname === '/v1/stats/summary');
		const stages = reads.find((r) => r.url.pathname === '/v1/stats/stages');
		expect(summary, 'summary read logged').toBeTruthy();
		expect(stages, 'stages read logged').toBeTruthy();
		expect(stages!.url.searchParams.get('groupBy')).toBe('setup');
		expect(summary!.url.searchParams.get('from')).toBeTruthy();
		expect(stages!.url.searchParams.get('from')).toBe(summary!.url.searchParams.get('from'));
		expect(stages!.url.searchParams.get('to')).toBe(summary!.url.searchParams.get('to'));
	});

	test('AC3: submitting a window reloads /stats and both reads use it', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		const since = fake.requests().length;
		await page.getByLabel('Started on or after').fill('2026-08-03');
		await page.getByLabel('Started on or before').fill('2026-08-20');
		await page.getByRole('button', { name: 'Apply' }).click();
		await expect(page).toHaveURL(`${fake.base}/stats?from=2026-08-03&to=2026-08-20`);
		await expect(
			page.getByText('tickets started 2026-08-03 00:00 UTC – before 2026-08-21 00:00 UTC')
		).toBeVisible();
		const reads = statsReads(fake, since);
		for (const path of ['/v1/stats/summary', '/v1/stats/stages']) {
			const read = reads.filter((r) => r.url.pathname === path).at(-1);
			expect(read, `${path} read`).toBeTruthy();
			expect(read!.url.searchParams.get('from')).toBe('2026-08-03T00:00:00Z');
			expect(read!.url.searchParams.get('to')).toBe('2026-08-21T00:00:00Z');
		}
		await shot(page, 'ac3-stats-chosen-window');
	});

	test('AC4: an invalid or inverted window falls back with a notice', async ({ page }) => {
		for (const search of ['?from=2026-09-20&to=2026-09-02', '?from=garbage&to=2026-13-45']) {
			const since = fake.requests().length;
			await page.goto(`${fake.base}/stats${search}`);
			const notice = page.getByRole('status').filter({ hasText: 'Showing the last 30 days' });
			await expect(notice).toBeVisible();
			const reads = statsReads(fake, since);
			expect(reads.length).toBe(2);
			const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
			for (const read of reads) {
				expect(read.path).not.toContain('garbage');
				const from = read.url.searchParams.get('from')!;
				const to = read.url.searchParams.get('to')!;
				expect(from).toMatch(iso);
				expect(to).toMatch(iso);
				expect(Date.parse(to) - Date.parse(from)).toBe(30 * DAY);
			}
			const from = reads[0]!.url.searchParams.get('from')!;
			const to = reads[0]!.url.searchParams.get('to')!;
			await expect(
				page.getByText(`tickets started ${label(from)} – before ${label(to)}`)
			).toBeVisible();
			if (search.includes('garbage')) await shot(page, 'ac4-stats-invalid-window');
		}
	});

	test('AC10: the page and its data carry no token or factory URL', async ({ request }) => {
		for (const path of ['/stats', '/stats/__data.json']) {
			const body = await (await request.get(`${fake.base}${path}`)).text();
			expect(body).toContain('stats.v1');
			expect(body).not.toContain(FAKE_FACTORY_TOKEN);
			expect(body).not.toContain(fake.fakeUrl);
			expect(body).not.toContain('127.0.0.1:7461');
		}
	});
});

test.describe('QA 31-03: the stages read fails', () => {
	const fake = scenario(7462, 4462, { failStatsStages: internal });

	test('AC5: stages and tokens show the panel error; the summary still renders', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		await expect(stagesPanel(page).getByText(PANEL_ERROR)).toBeVisible();
		await expect(stagesPanel(page).getByText('Internal error')).toBeVisible();
		await expect(tokensPanel(page).getByText(PANEL_ERROR)).toBeVisible();
		await expect(summaryRow(page).getByText(PANEL_ERROR)).toHaveCount(0);
		await expect(mergeCard(page)).toContainText('80%');
		await expect(mergeCard(page)).toContainText('16 of 20 finished');
		await shot(page, 'ac5-stats-stages-failed');
	});

	test('AC10: no Problem detail leaks when stages fail', async ({ request }) => {
		for (const path of ['/stats', '/stats/__data.json']) {
			const body = await (await request.get(`${fake.base}${path}`)).text();
			expect(body).toContain('Internal error');
			expect(body).not.toContain(LEAK);
			expect(body).not.toContain(FAKE_FACTORY_TOKEN);
			expect(body).not.toContain(fake.fakeUrl);
		}
	});
});

test.describe('QA 31-03: the summary read fails', () => {
	const fake = scenario(7463, 4463, { failStatsSummary: internal });

	test('AC6: the summary shows the panel error; stages and token bars render', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(summaryRow(page).getByText(PANEL_ERROR)).toBeVisible();
		await expect(summaryRow(page).getByText('Internal error')).toBeVisible();
		await expect(stagesPanel(page).getByRole('table')).toBeVisible();
		await expect(stagesPanel(page).getByText(PANEL_ERROR)).toHaveCount(0);
		await expect(
			tokensPanel(page).getByRole('list', { name: 'Total tokens per stage' })
		).toBeVisible();
		await expect(tokensPanel(page).locator('[data-slot="token-bar"]').first()).toBeVisible();
		await expect(tokensPanel(page).getByText(/coverage of cohort tokens/)).toContainText(
			'Unavailable'
		);
		await shot(page, 'ac6-stats-summary-failed');
	});

	test('AC10: no Problem detail leaks when the summary fails', async ({ request }) => {
		for (const path of ['/stats', '/stats/__data.json']) {
			const body = await (await request.get(`${fake.base}${path}`)).text();
			expect(body).not.toContain(LEAK);
			expect(body).not.toContain(FAKE_FACTORY_TOKEN);
			expect(body).not.toContain(fake.fakeUrl);
		}
	});
});

test.describe('QA 31-03: an unauthorized stats read', () => {
	const fake = scenario(7464, 4464, {
		failStatsStages: { status: 401, title: 'Unauthorized', type: 'unauthorized', detail: LEAK }
	});

	test('AC7: the page shows the configuration error', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(
			page.getByText('The dashboard cannot reach the factory with its configuration')
		).toBeVisible();
		await expect(page.getByRole('article', { name: 'Cohort summary' })).toHaveCount(0);
		await shot(page, 'ac7-stats-unauthorized');
	});

	test('AC10: no Problem detail leaks from the unauthorized read', async ({ request }) => {
		for (const path of ['/stats', '/stats/__data.json']) {
			const body = await (await request.get(`${fake.base}${path}`)).text();
			expect(body).not.toContain(LEAK);
			expect(body).not.toContain(FAKE_FACTORY_TOKEN);
			expect(body).not.toContain(fake.fakeUrl);
		}
	});
});

test.describe('QA 31-03: the zero-merges cohort', () => {
	const fake = scenario(7465, 4465, { statsCohort: 'zeroMerges' });

	test('AC8: merge rate reads 0% with its denominator', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(mergeCard(page)).toContainText('0%');
		await expect(mergeCard(page)).toContainText('0 of 3 finished');
		await shot(page, 'ac8-stats-zero-merges');
	});
});

test.describe('QA 31-03: the empty cohort', () => {
	const fake = scenario(7466, 4466, { statsCohort: 'empty' });

	test('AC8: merge rate is Unavailable, never 0%', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(mergeCard(page)).toContainText('Unavailable');
		await expect(mergeCard(page)).not.toContainText('0%');
		await expect(mergeCard(page)).toContainText('No finished tickets');
		await shot(page, 'ac8-stats-empty');
	});
});

test.describe('QA 31-03: the QA-disabled cohort', () => {
	const fake = scenario(7467, 4467, { statsCohort: 'qaDisabled' });

	test('AC9: the QA stage shows "No runs in this cohort"', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(tokensPanel(page).getByRole('listitem').filter({ hasText: 'QA' })).toContainText(
			'No runs in this cohort'
		);
		await expect(
			stagesPanel(page)
				.getByRole('rowgroup')
				.filter({ hasText: /^\s*QA/ })
		).toContainText('No runs in this cohort');
		await shot(page, 'ac9-stats-qa-disabled');
	});
});
