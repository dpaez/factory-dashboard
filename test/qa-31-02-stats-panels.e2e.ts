import { expect, test, type Locator, type Page } from '@playwright/test';

// QA for ticket #31, task 02: stats panels, driven through Storybook.
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
const summary = (id: string) => `components-factory-stats-metricsummaryrow--${id}`;
const table = (id: string) => `components-factory-stats-stagetable--${id}`;
const tokens = (id: string) => `components-factory-stats-tokensbystage--${id}`;
const card = (pane: Locator, title: string) =>
	pane.locator('[data-metric]').filter({ hasText: title });

test('AC1: Complete summary shows tokens, cost, 80% merge rate and its denominator', async ({
	page
}) => {
	const pane = (await open(page, summary('complete'))).first();
	await expect.soft(pane).toContainText('6,400,000');
	await expect.soft(pane).toContainText('$48.20');
	await expect.soft(pane).toContainText('80%');
	await expect.soft(pane).toContainText('16 of 20 finished · 6 open or unknown excluded');
	await shot(page, 'ac1-summary-complete');

	// A user must be able to read every figure: none may be clipped by its card (light theme, full width).
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(`${SB}/iframe.html?id=${summary('complete')}&viewMode=story&globals=theme:light`);
	const values = page.getByTestId('info-card-value');
	await expect(values).toHaveCount(3);
	for (let i = 0; i < 3; i++) {
		const fits = await values.nth(i).evaluate((el) => {
			const range = document.createRange();
			range.selectNodeContents(el);
			const text = range.getBoundingClientRect();
			const card = el.closest('[data-slot="info-card"]')!.getBoundingClientRect();
			return text.left >= card.left && text.right <= card.right;
		});
		expect.soft(fits, `figure ${i} fits its card`).toBe(true);
	}
	await shot(page, 'ac1-summary-complete-light');
});

test('AC2: Zero merges shows 0% over a non-zero denominator', async ({ page }) => {
	const pane = (await open(page, summary('zero-merges'))).first();
	await expect.soft(pane).toContainText('0%');
	await expect.soft(pane).toContainText('0 of 3 finished');
	await expect.soft(pane).not.toContainText('—');
	await shot(page, 'ac2-summary-zero-merges');
});

test('AC3: Empty window reads — Unavailable, never 0%, and stage panels show no runs', async ({
	page
}) => {
	let pane = (await open(page, summary('empty-window'))).first();
	await expect.soft(pane).toContainText('—');
	await expect.soft(pane).toContainText('Unavailable');
	await expect.soft(pane).not.toContainText('0%');
	await shot(page, 'ac3-summary-empty-window');

	pane = (await open(page, table('empty-window'))).first();
	await expect.soft(pane.getByText('No runs in this cohort')).toHaveCount(5);
	pane = (await open(page, tokens('empty-window'))).first();
	await expect.soft(pane.getByText('No runs in this cohort')).toHaveCount(5);
	await shot(page, 'ac3-tokens-empty-window');
});

test('AC4: Inspect cohort expands the five outcome counts and the started count', async ({
	page
}) => {
	const pane = (await open(page, summary('complete'))).first();
	const counts = pane.getByRole('definition');
	// The play function already opened it; close and reopen as a user would.
	const toggle = pane.getByText('Inspect cohort');
	await toggle.click();
	await expect(counts.first()).toBeHidden();
	await toggle.click();
	const expected = {
		merged: '16',
		abandoned: '2',
		cancelled: '2',
		open: '4',
		unknown: '2',
		started: '26'
	};
	for (const [label, count] of Object.entries(expected)) {
		const term = pane.getByRole('term').filter({ hasText: new RegExp(`^${label}$`, 'i') });
		await expect.soft(term).toBeVisible();
		await expect.soft(term.locator('xpath=following-sibling::dd[1]')).toHaveText(count);
	}
	await shot(page, 'ac4-inspect-cohort');
});

test('AC5: stage table groups stages in pipeline order, one row per model setup; null ratio is — Unavailable', async ({
	page
}) => {
	let pane = (await open(page, table('complete'))).first();
	const groups = pane.getByRole('rowheader').filter({ hasNotText: '·' });
	await expect.soft(groups).toHaveText(['plan', 'work', 'QA', 'review', 'wrapup'], {
		ignoreCase: true
	});
	await expect
		.soft(pane.getByRole('rowheader', { name: 'claude-opus-5-5 · high' }).first())
		.toBeVisible();
	await expect.soft(pane.getByRole('rowheader', { name: 'gpt-6 · medium' }).first()).toBeVisible();
	await shot(page, 'ac5-stage-table-complete');

	pane = (await open(page, table('partial'))).first();
	const reviewRow = pane
		.getByRole('row')
		.filter({ has: page.getByRole('rowheader', { name: 'claude-opus-5-5 · high' }) })
		.filter({ hasText: 'Unavailable' });
	await expect(reviewRow).toHaveCount(1);
	const cells = reviewRow.getByRole('cell');
	// First-pass acceptance, corrections, review rounds, tokens and cost per accepted output.
	for (const index of [2, 3, 5, 6, 7]) {
		await expect.soft(cells.nth(index)).toHaveText(/^—\s*Unavailable$/);
	}
});

test('AC6: QA disabled reads "No runs in this cohort" in the table and the bars', async ({
	page
}) => {
	let pane = (await open(page, table('qa-disabled'))).first();
	const qaGroup = pane
		.getByRole('rowgroup')
		.filter({ has: page.getByRole('rowheader', { name: 'QA', exact: true }) });
	await expect.soft(qaGroup).toContainText('No runs in this cohort');
	await expect.soft(pane.getByText('No runs in this cohort')).toHaveCount(1);
	await shot(page, 'ac6-stage-table-qa-disabled');

	pane = (await open(page, tokens('qa-disabled'))).first();
	const qa = pane.getByRole('listitem').filter({ hasText: /^QA/ });
	await expect.soft(qa).toContainText('No runs in this cohort');
	await expect.soft(pane.getByText('No runs in this cohort')).toHaveCount(1);
	await shot(page, 'ac6-tokens-qa-disabled');
});

test('AC7: token bars share one scale and categories always read Unavailable', async ({ page }) => {
	const pane = (await open(page, tokens('complete'))).first();
	const bar = (stage: RegExp) =>
		pane.getByRole('listitem').filter({ hasText: stage }).locator('div[aria-hidden="true"] > div');
	const width = async (stage: RegExp) => (await bar(stage).boundingBox())!.width;
	const track = async (stage: RegExp) =>
		(await pane
			.getByRole('listitem')
			.filter({ hasText: stage })
			.locator('div[aria-hidden="true"]')
			.boundingBox())!.width;
	const work = await width(/^work/);
	const plan = await width(/^plan/);
	expect.soft(work).toBeCloseTo(await track(/^work/), 0);
	expect.soft(plan).toBeLessThan(work);
	expect.soft(plan / work).toBeCloseTo(0.2889, 2);
	await expect.soft(pane).toContainText('Token categories: Unavailable');
	await shot(page, 'ac7-tokens-complete');

	for (const id of ['qa-disabled', 'partial', 'empty-window']) {
		const p = (await open(page, tokens(id))).first();
		await expect.soft(p, id).toContainText('Token categories: Unavailable');
	}
});

test('AC8: Partial marks the affected stage partial with its excluded run count', async ({
	page
}) => {
	const pane = (await open(page, tokens('partial'))).first();
	const review = pane.getByRole('listitem').filter({ hasText: /^review/ });
	await expect(review).toContainText('partial · 3 runs excluded');
	await shot(page, 'ac8-tokens-partial');
});

test('AC9: a failed panel shows only its safe title; loading shows a skeleton', async ({
	page
}) => {
	const cases: [string, string][] = [
		[summary('error'), summary('loading')],
		[table('error'), table('loading')],
		[tokens('error'), tokens('loading')]
	];
	for (const [errorId, loadingId] of cases) {
		let pane = (await open(page, errorId)).first();
		await expect.soft(pane.getByRole('status'), errorId).toContainText('Stats unavailable');
		await expect.soft(pane.getByRole('table'), errorId).toHaveCount(0);
		await expect.soft(pane.getByRole('listitem'), errorId).toHaveCount(0);
		await expect.soft(pane, errorId).not.toContainText(/https?:|problem|status \d/i);
		if (errorId === summary('error')) await shot(page, 'ac9-summary-error');

		pane = (await open(page, loadingId)).first();
		await expect.soft(pane.locator('[aria-busy="true"]'), loadingId).toHaveCount(1);
		await expect.soft(pane.getByText('Loading…'), loadingId).toHaveCount(1);
		if (loadingId === tokens('loading')) await shot(page, 'ac9-tokens-loading');
	}
});

test('AC10: every stats story renders in a light and a dark pane', async ({ page }) => {
	const res = await page.request.get(`${SB}/index.json`);
	const entries = Object.values(
		((await res.json()) as { entries: Record<string, { id: string; type: string; title: string }> })
			.entries
	).filter((e) => e.type === 'story' && e.title.startsWith('Components/Factory/Stats/'));
	expect(entries.length).toBeGreaterThanOrEqual(20);
	for (const { id } of entries) {
		const panes = await open(page, id);
		const [light, dark] = [panes.nth(0), panes.nth(1)];
		await expect.soft(light, id).not.toBeEmpty();
		await expect.soft(dark, id).not.toBeEmpty();
		const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect.soft(await bg(light), id).not.toBe(await bg(dark));
	}
	await open(page, summary('complete'));
	await shot(page, 'ac10-light-dark-summary');
});
