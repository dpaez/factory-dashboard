import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import { FAKE_FACTORY_TOKEN, startFakeFactory, type FakeFactoryOptions } from './fake-factory';

// Efficiency signals and "No returns to work" on /stats, read from /v1/stats/export.
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

const SECRET_DETAIL = 'stats-export-secret: sqlite busy at /var/factory/facts.db';
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

const efficiency = (page: Page) => page.locator('[data-slot="efficiency-signals"]');
const noReturns = (page: Page) => page.getByTestId('no-returns-to-work-value');
const shares = (page: Page) =>
	efficiency(page).locator(
		'[data-row="waiting-share"], [data-row="blended-cost-per-merged"], [data-row="rework-token-share"], [data-row="usage-coverage"]'
	);

async function expectNoLeaks(page: Page, fake: Fake) {
	const html = await (await page.request.get(`${fake.base}/stats`)).text();
	const dataJson = await (await page.request.get(`${fake.base}/stats/__data.json`)).text();
	for (const body of [html, dataJson]) {
		expect(body).not.toContain(FAKE_FACTORY_TOKEN);
		expect(body).not.toContain(fake.fakeUrl);
		expect(body).not.toContain('127.0.0.1');
		expect(body).not.toContain(SECRET_DETAIL);
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

test.describe('the complete export cohort', () => {
	const fake = scenario(7501, 4501, {});

	test('Efficiency signals shows $3.01 blended cost per merged ticket for the default window', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		await expect(efficiency(page)).toHaveAttribute('data-state', 'ready');
		const blended = efficiency(page).locator('[data-row="blended-cost-per-merged"]');
		await expect(blended).toHaveAttribute('data-availability', 'complete');
		await expect(blended).toContainText('$3.01');
		await expect(blended.getByTestId('blended-parts')).toContainText('16 merged');
		await expect(efficiency(page).getByTestId('export-status')).toHaveCount(0);
		await shot(page, 'ac1-efficiency-complete');
	});

	test('the export is read with the same from/to as the summary', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(efficiency(page)).toHaveAttribute('data-state', 'ready');
		// Each page load reads summary and export once; pair them load by load.
		const summaries = queries(fake, '/v1/stats/summary');
		const exports = queries(fake, '/v1/stats/export');
		expect(exports.length).toBeGreaterThan(0);
		expect(exports).toHaveLength(summaries.length);
		exports.forEach((query, i) => {
			expect(query.get('from')).toBe(summaries[i]?.get('from'));
			expect(query.get('to')).toBe(summaries[i]?.get('to'));
		});
	});

	test('TicketsQuality shows No returns to work with its numerator and denominator', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		const row = page.locator('[data-row="no-returns-to-work"]');
		await expect(row).toHaveAttribute('data-availability', 'complete');
		await expect(row).toContainText('No returns to work');
		await expect(noReturns(page)).toContainText('85%');
		await expect(noReturns(page)).toContainText('17 of 20 executions that reached handoff');
	});

	test('the page and its data carry no token, factory URL, Problem detail or export lines', async ({
		page
	}) => {
		await expectNoLeaks(page, fake);
	});
});

test.describe('the export read fails', () => {
	const fake = scenario(7502, 4502, { failStatsExport: internal });

	test('only Efficiency signals shows the panel error; No returns reads Unavailable', async ({
		page
	}) => {
		await page.goto(`${fake.base}/stats`);
		await expect(efficiency(page)).toHaveAttribute('data-state', 'error');
		await expect(efficiency(page).getByTestId('panel-error-title')).toHaveText('Internal error');
		await expect(noReturns(page)).toContainText('Unavailable');
		await expect(noReturns(page)).not.toContainText('%');
		for (const slot of [
			'metric-summary-row',
			'stage-table',
			'time-breakdown',
			'tickets-quality',
			'configuration-comparison'
		]) {
			await expect(page.locator(`[data-slot="${slot}"]`)).toHaveAttribute('data-state', 'ready');
		}
		await shot(page, 'ac3-export-failed');
		await expectNoLeaks(page, fake);
	});
});

test.describe('the export has malformed lines', () => {
	const fake = scenario(7503, 4503, { statsExportMalformed: true });

	test('the malformed-line count shows and no share is a number', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(efficiency(page)).toHaveAttribute('data-state', 'ready');
		const status = efficiency(page).getByTestId('export-status');
		await expect(status).toContainText('2 malformed lines');
		await expectNoShareNumbers(page);
		await shot(page, 'ac4-export-malformed');
		await expectNoLeaks(page, fake);
	});
});

test.describe('the export is truncated', () => {
	const fake = scenario(7504, 4504, { statsExportTruncate: true });

	test('the malformed-line count shows and no share is a number', async ({ page }) => {
		await page.goto(`${fake.base}/stats`);
		await expect(efficiency(page)).toHaveAttribute('data-state', 'ready');
		const status = efficiency(page).getByTestId('export-status');
		await expect(status).toContainText('1 malformed line');
		await expectNoShareNumbers(page);
		await shot(page, 'ac4-export-truncated');
	});
});
