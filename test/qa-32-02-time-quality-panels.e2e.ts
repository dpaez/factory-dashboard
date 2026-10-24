import { expect, test, type Locator, type Page } from '@playwright/test';

// QA for ticket #32, task 02: time, quality, contributors and configuration panels, driven through Storybook.
test.describe.configure({ retries: 1 });
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

/** Open a story side by side, wait for its play function, and return both theme panes. */
const open = async (page: Page, id: string) => {
	await page.goto(`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:side-by-side`);
	await expect
		.poll(
			() =>
				page
					.evaluate(
						() =>
							(
								window as unknown as {
									__STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } };
								}
							).__STORYBOOK_PREVIEW__?.currentRender?.phase
					)
					.catch(() => undefined),
			{ timeout: 30_000 }
		)
		.toBe('finished');
	const panes = page.locator('#storybook-root [data-theme-pane]');
	await expect(panes).toHaveCount(2);
	return panes;
};
const time = (id: string) => `components-factory-stats-timebreakdown--${id}`;
const quality = (id: string) => `components-factory-stats-ticketsquality--${id}`;
const contributors = (id: string) => `components-factory-stats-contributingtickets--${id}`;
const configs = (id: string) => `components-factory-stats-configurationcomparison--${id}`;
/** The <dd> after the term a user reads. */
const figure = (pane: Locator, term: string | RegExp) =>
	pane
		.getByRole('term')
		.filter({ hasText: term })
		.first()
		.locator('xpath=following-sibling::dd[1]');

test('AC1: complete time breakdown shows mean, median, P90 in mono figures with sample and exclusions', async ({
	page
}) => {
	const pane = (await open(page, time('complete'))).first();
	const mean = figure(pane, 'Mean start → handoff');
	await expect.soft(mean).toHaveText('4 h 18 m');
	await expect.soft(figure(pane, /^Median$/)).toContainText('3 h 30 m');
	await expect.soft(figure(pane, 'P90')).toContainText('8 h');
	await expect.soft(pane.getByText('(nearest-rank)')).toBeVisible();
	for (const f of [mean, figure(pane, /^Median$/), figure(pane, 'P90')]) {
		const style = await f
			.locator('[data-availability]')
			.first()
			.evaluate((el) => {
				const s = getComputedStyle(el);
				return { family: s.fontFamily, numeric: s.fontVariantNumeric };
			});
		expect.soft(style.family.toLowerCase()).toMatch(/mono/);
		expect.soft(style.numeric).toContain('tabular-nums');
	}
	await expect
		.soft(pane.getByTestId('time-sample'))
		.toHaveText('10 of 12 executions reached handoff · 2 excluded (1 open, 1 cancelled)');
	await shot(page, 'ac1-time-complete');
});

test('AC2: no handoffs reads — Unavailable for every headline figure and excludes every execution', async ({
	page
}) => {
	const pane = (await open(page, time('no-handoffs'))).first();
	for (const term of ['Mean start → handoff', /^Median$/, 'P90']) {
		const value = figure(pane, term).locator('[data-availability]').first();
		await expect.soft(value).toHaveText(/^—\s*Unavailable$/);
		await expect.soft(value).not.toContainText('0');
	}
	await expect
		.soft(pane.getByTestId('time-sample'))
		.toHaveText('0 of 3 executions reached handoff · 3 excluded (1 open, 1 cancelled, 1 unknown)');
	await shot(page, 'ac2-time-no-handoffs');
});

test('AC3: small sample shows its n beside median and P90', async ({ page }) => {
	const pane = (await open(page, time('small-sample'))).first();
	await expect.soft(figure(pane, /^Median$/)).toContainText('n = 3');
	await expect.soft(figure(pane, 'P90')).toContainText('n = 3');
	await expect.soft(pane.getByText('Small sample: 3 executions')).toBeVisible();
	await shot(page, 'ac3-time-small-sample');
});

test('AC4: missing timings keeps the headline and marks stage bars and overhead partial with their own sample', async ({
	page
}) => {
	const pane = (await open(page, time('missing-timings'))).first();
	await expect.soft(figure(pane, 'Mean start → handoff')).toHaveText('2 h 40 m');
	await expect
		.soft(pane.getByTestId('stage-partial'))
		.toHaveText('Partial: 2 of 3 have no stage timings and count as 0.');
	const overhead = pane.getByTestId('agent-overhead');
	await expect.soft(overhead).toContainText('Overhead');
	await expect.soft(overhead).toContainText('(n = 1, partial: 2 without stage timings left out)');
	await shot(page, 'ac4-time-missing-timings');
});

test('AC5: stage bars share one scale and waiting before handoff is its own row', async ({
	page
}) => {
	const pane = (await open(page, time('complete'))).first();
	const stages = pane.getByRole('list', { name: 'Mean stage time per execution' });
	const item = (label: string) =>
		stages.getByRole('listitem').filter({ hasText: new RegExp(`^${label}`) });
	const bar = (label: string) => item(label).locator('div[aria-hidden="true"]');
	const width = async (label: string) =>
		(await bar(label).locator('div').boundingBox())!.width /
		(await bar(label).boundingBox())!.width;
	expect.soft(await width('work')).toBeCloseTo(1, 2);
	expect.soft(await width('plan')).toBeCloseTo(0.1449, 2);
	expect.soft(await width('review')).toBeCloseTo(0.2645, 2);
	await expect.soft(item('work')).toContainText('2 h 18 m');
	await expect.soft(stages).not.toContainText(/wait/i);
	await expect.soft(figure(pane, 'Waiting before handoff')).toContainText('15 m');
	await shot(page, 'ac5-time-stage-bars');
});

test('AC6: tickets quality lists six intervention kinds, #63 gap, and the review rounds definition', async ({
	page
}) => {
	const pane = (await open(page, quality('complete'))).first();
	for (const kind of [
		'Questions',
		'Limit pauses',
		'Replies',
		'Manual retries',
		'Manual completes',
		'Stops'
	]) {
		await expect.soft(pane.getByText(kind, { exact: true })).toBeVisible();
	}
	const changes = pane.locator('[data-row="external-changes-requested"]');
	await expect.soft(changes).toContainText('External changes requested');
	await expect.soft(changes).toContainText(/—\s*Unavailable/);
	await expect.soft(changes).toContainText('geut/factory-skills#63');
	await expect
		.soft(pane.getByTestId('external-review-rounds-definition'))
		.toContainText('or a comment with a body');
	await shot(page, 'ac6-quality-complete');
});

test('AC7: selecting a figure lists exactly its executions with Open execution links', async ({
	page
}) => {
	const pane = (await open(page, contributors('selecting-a-figure'))).first();
	const panel = pane.locator('[data-slot="contributing-tickets"]');
	const refs = panel.getByRole('rowheader');
	const links = panel.getByRole('link', { name: /^Open execution/ });

	await pane.getByRole('button', { name: 'Needed a person' }).click();
	await expect(panel).toContainText('Needed a person');
	await expect
		.soft(refs)
		.toHaveText([
			'dpaez/factory-dashboard#9',
			'dpaez/factory-dashboard#14',
			'dpaez/factory-dashboard#17',
			'KAI-21',
			'KAI-23',
			'dpaez/factory-dashboard#20'
		]);
	await expect.soft(links).toHaveCount(6);
	await expect
		.soft(links.first())
		.toHaveAttribute(
			'href',
			'/stats/execution?key=dpaez-factory-dashboard-9-9a0b1c2d&startedAt=2026-10-05T08%3A00%3A00Z'
		);

	await pane.getByRole('button', { name: '2 excluded' }).click();
	await expect.soft(refs).toHaveText(['dpaez/factory-dashboard#20', 'KAI-24']);
	await expect.soft(links).toHaveCount(2);
	for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
		expect.soft(href).toMatch(/^\/stats\/execution\?key=[^&]+&startedAt=[^&]+$/);
	}
	await shot(page, 'ac7-contributors-selected');
});

test('AC8: configuration comparison shows samples, small-sample markers and a null merge rate as Unavailable', async ({
	page
}) => {
	const pane = (await open(page, configs('small-sample-and-null-merge-rate'))).first();
	const rows = pane
		.getByRole('table')
		.getByRole('row')
		.filter({ has: page.getByRole('rowheader') });
	await expect(rows).toHaveCount(2);
	const cell = (row: Locator, name: string) => row.locator(`[data-column="${name}"]`);
	await expect.soft(cell(rows.nth(0), 'tickets')).toHaveText(/^4\s*small sample$/);
	await expect.soft(cell(rows.nth(1), 'tickets')).toHaveText(/^1\s*small sample$/);
	await expect.soft(cell(rows.nth(0), 'merge-rate')).toHaveText('75%');
	await expect.soft(cell(rows.nth(1), 'merge-rate')).toHaveText(/^—\s*Unavailable$/);
	await shot(page, 'ac8-configurations');
});

test('AC9: every new story renders light and dark; loading and error use the shared states', async ({
	page
}) => {
	const res = await page.request.get(`${SB}/index.json`);
	const entries = Object.values(
		((await res.json()) as { entries: Record<string, { id: string; type: string; title: string }> })
			.entries
	).filter(
		(e) =>
			e.type === 'story' &&
			/Stats\/(TimeBreakdown|TicketsQuality|ContributingTickets|ConfigurationComparison|MeasurementNotes)$/.test(
				e.title
			)
	);
	expect(entries.length).toBeGreaterThanOrEqual(25);
	const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
	for (const { id } of entries) {
		const panes = await open(page, id);
		await expect.soft(panes.nth(0), id).not.toBeEmpty();
		await expect.soft(panes.nth(1), id).not.toBeEmpty();
		expect.soft(await bg(panes.nth(0)), id).not.toBe(await bg(panes.nth(1)));
	}

	for (const group of [time, quality, contributors, configs]) {
		let pane = (await open(page, group('error'))).first();
		await expect.soft(pane.getByRole('status')).toContainText('Stats unavailable');
		await expect.soft(pane.getByRole('table')).toHaveCount(0);
		await expect.soft(pane).not.toContainText(/https?:|problem|status \d|token/i);
		if (group === time) await shot(page, 'ac9-time-error');

		pane = (await open(page, group('loading'))).first();
		await expect.soft(pane.locator('[aria-busy="true"]')).toHaveCount(1);
		await expect.soft(pane.getByText('Loading…')).toHaveCount(1);
		if (group === quality) await shot(page, 'ac9-quality-loading');
	}
});
