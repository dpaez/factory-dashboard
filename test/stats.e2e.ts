import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	FAKE_FACTORY_TOKEN,
	FAKE_STATS_COHORTS,
	startFakeFactory,
	type FakeFactoryOptions
} from './fake-factory';

// Ticket #31, task 03: the /stats route against the fake factory.
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

const SECRET_DETAIL = 'stats-upstream-secret: sqlite busy at /var/factory/stats.db';
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

/** The query of the latest request to a stats route. */
const lastQuery = (fake: Fake, path: string) => {
	const request = fake
		.requests()
		.filter((r) => r.path.startsWith(`${path}?`))
		.at(-1);
	return request ? new URL(request.path, fake.fakeUrl).searchParams : null;
};

const summaryRow = (page: Page) => page.locator('[data-slot="metric-summary-row"]');
const stageTable = (page: Page) => page.locator('[data-slot="stage-table"]');
const tokensPanel = (page: Page) => page.locator('[data-slot="tokens-by-stage"]');
const mergeRate = (page: Page) => page.locator('[data-metric="merge-rate"]');

/** The page HTML and its `__data.json` contain no secret. */
async function expectNoLeaks(page: Page, fake: Fake, path: string) {
	const html = await (await page.request.get(`${fake.base}${path}`)).text();
	const [pathname, search = ''] = path.split('?');
	const dataJson = await (
		await page.request.get(`${fake.base}${pathname}/__data.json${search ? `?${search}` : ''}`)
	).text();
	for (const body of [html, dataJson]) {
		expect(body).not.toContain(FAKE_FACTORY_TOKEN);
		expect(body).not.toContain(fake.fakeUrl);
		expect(body).not.toContain('127.0.0.1');
		expect(body).not.toContain(SECRET_DETAIL);
	}
}

test.describe('the complete cohort', () => {
	const fake = scenario(7451, 4451, {});

	test('the Stats nav opens /stats with the cohort header and every panel', async ({ page }) => {
		await page.goto(`${fake.base}/`);
		await page.getByRole('link', { name: 'Stats' }).click();
		await expect(page).toHaveURL(`${fake.base}/stats`);
		await expect(page.getByRole('heading', { level: 2, name: 'Factory stats' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Stats' })).toHaveAttribute('aria-current', 'page');

		const summary = FAKE_STATS_COHORTS.complete.summary;
		await expect(page.getByTestId('cohort-factory')).toHaveText(summary.factoryId);
		await expect(page.getByTestId('cohort-versions')).toHaveText(
			summary.factoryVersions.join(', ')
		);
		await expect(page.getByTestId('cohort-definitions')).toHaveText('stats.v1');

		// The default window: the last 30 days, the same for both reads.
		const summaryQuery = lastQuery(fake, '/v1/stats/summary');
		const stagesQuery = lastQuery(fake, '/v1/stats/stages');
		const from = summaryQuery?.get('from') ?? '';
		const to = summaryQuery?.get('to') ?? '';
		expect(Date.parse(to) - Date.parse(from)).toBe(30 * 86_400_000);
		expect(stagesQuery?.get('from')).toBe(from);
		expect(stagesQuery?.get('to')).toBe(to);
		expect(stagesQuery?.get('groupBy')).toBe('setup');
		await expect(page.getByTestId('cohort-window')).toContainText(
			`${from.slice(0, 10)} ${from.slice(11, 16)} UTC – before ${to.slice(0, 10)} ${to.slice(11, 16)} UTC`
		);

		await expect(mergeRate(page)).toContainText('80%');
		await expect(page.getByTestId('merge-rate-denominator')).toContainText('16 of 20 finished');
		await expect(stageTable(page).locator('[data-state="ready"], table').first()).toBeVisible();
		await expect(tokensPanel(page)).toHaveAttribute('data-state', 'ready');
		await expect(page.locator('[data-slot="measurement-notes"]')).toBeVisible();
		await shot(page, 'stats-complete');
	});

	test('submitting a window reloads /stats and both reads use it', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await page.getByLabel('Started on or after').fill('2026-09-01');
		await page.getByLabel('Started on or before').fill('2026-09-30');
		await page.getByRole('button', { name: 'Apply' }).click();
		await expect(page).toHaveURL(`${fake.base}/stats?from=2026-09-01&to=2026-09-30`);
		await expect(page.getByTestId('cohort-window')).toContainText(
			'2026-09-01 00:00 UTC – before 2026-10-01 00:00 UTC'
		);
		for (const path of ['/v1/stats/summary', '/v1/stats/stages']) {
			expect(lastQuery(fake, path)?.get('from')).toBe('2026-09-01T00:00:00Z');
			expect(lastQuery(fake, path)?.get('to')).toBe('2026-10-01T00:00:00Z');
		}
		await expect(page.getByLabel('Started on or after')).toHaveValue('2026-09-01');
		await expect(page.getByLabel('Started on or before')).toHaveValue('2026-09-30');
		await expect(page.getByTestId('window-notice')).toHaveCount(0);
	});

	test('an inverted or invalid window shows the default and a notice', async ({ page }) => {
		for (const search of ['?from=2026-10-01&to=2026-09-01', '?from=not-a-date']) {
			const before = fake.requests().length;
			await page.goto(`${fake.base}/stats${search}`);
			await expect(page.getByTestId('window-notice')).toContainText('Showing the last 30 days');
			const reads = fake
				.requests()
				.slice(before)
				.filter((r) => r.path.startsWith('/v1/stats/'));
			expect(reads.length).toBeGreaterThan(0);
			for (const read of reads) {
				const params = new URL(read.path, fake.fakeUrl).searchParams;
				expect(params.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
				expect(params.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
				expect(Date.parse(params.get('to')!) - Date.parse(params.get('from')!)).toBe(
					30 * 86_400_000
				);
			}
		}
	});

	test('the page and its data carry no token or factory URL', async ({ page }) => {
		await expectNoLeaks(page, fake, '/stats');
	});
});

test.describe('the stages read fails', () => {
	const fake = scenario(7452, 4452, { failStatsStages: internal });

	test('stages and tokens show the panel error; the summary still renders', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(stageTable(page)).toHaveAttribute('data-state', 'error');
		await expect(tokensPanel(page)).toHaveAttribute('data-state', 'error');
		await expect(stageTable(page).getByTestId('panel-error-title')).toHaveText('Internal error');
		await expect(summaryRow(page)).toHaveAttribute('data-state', 'ready');
		await expect(mergeRate(page)).toContainText('80%');
		await expect(page.getByTestId('cohort-factory')).toHaveText('factory-geut-01');
		await shot(page, 'stats-stages-failed');
		await expectNoLeaks(page, fake, '/stats');
	});
});

test.describe('the summary read fails', () => {
	const fake = scenario(7453, 4453, { failStatsSummary: internal });

	test('the summary shows the panel error; stages and token bars render', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(summaryRow(page)).toHaveAttribute('data-state', 'error');
		await expect(summaryRow(page).getByTestId('panel-error-title')).toHaveText('Internal error');
		await expect(stageTable(page)).toHaveAttribute('data-state', 'ready');
		await expect(tokensPanel(page)).toHaveAttribute('data-state', 'ready');
		await expect(tokensPanel(page).locator('[data-slot="token-bar"]').first()).toBeVisible();
		await expect(page.getByTestId('tokens-coverage')).toContainText('Unavailable');
		await shot(page, 'stats-summary-failed');
		await expectNoLeaks(page, fake, '/stats');
	});
});

test.describe('the stats read is unauthorized', () => {
	const fake = scenario(7454, 4454, {
		failStatsSummary: {
			status: 401,
			title: 'Unauthorized',
			type: 'unauthorized',
			detail: SECRET_DETAIL
		}
	});

	test('the page shows the configuration error', async ({ page }) => {
		const response = await page.goto(`${fake.base}/stats`);
		expect(response?.status()).toBe(503);
		await expect(
			page.getByText('The dashboard cannot reach the factory with its configuration')
		).toBeVisible();
		await expect(page.locator('[data-slot="metric-summary-row"]')).toHaveCount(0);
		await expect(page.getByText(SECRET_DETAIL)).toHaveCount(0);
		await expectNoLeaks(page, fake, '/stats');
	});
});

test.describe('the mismatched cohort', () => {
	const fake = scenario(7458, 4458, { statsCohort: 'mismatch' });

	test('the header flags the mismatch and token coverage reads Unavailable', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(page.getByTestId('cohort-mismatch')).toBeVisible();
		await expect(summaryRow(page)).toHaveAttribute('data-state', 'ready');
		await expect(tokensPanel(page)).toHaveAttribute('data-state', 'ready');
		await expect(page.getByTestId('tokens-coverage')).toContainText('Unavailable');
		await expect(page.getByTestId('tokens-coverage')).not.toContainText('100%');
	});
});

test.describe('the zero-merges cohort', () => {
	const fake = scenario(7455, 4455, { statsCohort: 'zeroMerges' });

	test('merge rate reads 0% with its denominator', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(mergeRate(page)).toContainText('0%');
		await expect(page.getByTestId('merge-rate-denominator')).toContainText('0 of 3 finished');
	});
});

test.describe('the empty cohort', () => {
	const fake = scenario(7456, 4456, { statsCohort: 'empty' });

	test('merge rate is Unavailable, never 0%', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(mergeRate(page)).toContainText('Unavailable');
		await expect(mergeRate(page)).not.toContainText('0%');
		await expect(page.getByTestId('merge-rate-denominator')).toContainText('No finished tickets');
		await shot(page, 'stats-empty');
	});
});

test.describe('the QA-disabled cohort', () => {
	const fake = scenario(7457, 4457, { statsCohort: 'qaDisabled' });

	test('the QA stage has no runs in this cohort', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(tokensPanel(page).locator('[data-stage="qa"]')).toContainText(
			'No runs in this cohort'
		);
		await expect(stageTable(page)).toContainText('No runs in this cohort');
	});
});
