import { expect, test, type Page } from '@playwright/test';

// QA for ticket #27, task 02: run timeline, evidence panel and latest-activity message, via Storybook.
test.describe.configure({ retries: 1 });
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

/** Open a story side by side, wait for its play function, and return its light pane. */
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
	return panes.first();
};
const timeline = (id: string) => `components-factory-runtimeline--${id}`;
const evidence = (id: string) => `components-factory-evidencepanel--${id}`;
const runRow = (pane: ReturnType<Page['locator']>, id: string) =>
	pane.locator(`[data-run="${id}"]`);

test('AC1: the timeline groups runs by task and stage, labels purposes, and shows a lost run', async ({
	page
}) => {
	const pane = await open(page, timeline('multi-task-history'));
	await expect
		.soft(pane.getByRole('heading', { level: 4 }))
		.toHaveText(['Ticket', 'Task 01', 'Task 02']);
	const task01 = pane
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Task 01' }) });
	await expect
		.soft(task01.getByRole('heading', { level: 5 }))
		.toHaveText([/01 · work/i, /01 · review/i]);
	for (const label of ['Return to work', 'Correction', 'Re-entry', 'Infrastructure retry']) {
		await expect.soft(pane.getByRole('button').filter({ hasText: label }).first()).toBeVisible();
	}
	await expect.soft(runRow(pane, 'run_hist_02_work_crashed')).toContainText('Lost: crashed');
	await shot(page, 'ac1-run-timeline');
});

test('AC2: an unknown purpose shows its raw value as the label', async ({ page }) => {
	const pane = await open(page, timeline('unknown-purpose'));
	await expect(pane.getByRole('button').first()).toContainText('operator_nudge');
	await shot(page, 'ac2-unknown-purpose');
});

test('AC3: each row shows round, outcome, status and model; no usage reads unavailable', async ({
	page
}) => {
	let pane = await open(page, timeline('multi-task-history'));
	const retry = runRow(pane, 'run_hist_02_work_retry');
	await expect.soft(retry).toContainText('round 1');
	await expect.soft(retry).toContainText('Running');
	await expect.soft(retry).toContainText('claude-opus-5-5 · high');
	const crashed = runRow(pane, 'run_hist_02_work_crashed');
	await expect.soft(crashed).toContainText('retrying');
	await expect.soft(crashed).toContainText('Usage unavailable');
	await expect.soft(crashed).not.toContainText('$0.00');

	pane = await open(page, timeline('no-usage'));
	await expect.soft(pane).toContainText('Usage unavailable');
	await expect.soft(pane).not.toContainText('$0.00');
	await expect.soft(pane).not.toContainText(/\b0 tokens/);
	await shot(page, 'ac3-no-usage');
});

test('AC4: clicking a row reports its run id and the selected row is marked', async ({ page }) => {
	const pane = await open(page, timeline('selected-run'));
	const selected = pane.getByRole('button', { pressed: true });
	await expect(selected).toHaveCount(1);
	await expect(selected).toHaveAttribute('data-run', 'run_hist_01_review_changes');
	await shot(page, 'ac4-selected-run');

	// In the Storybook UI, a click shows the reported run id in the Actions panel.
	await page.goto(
		`${SB}/?path=/story/${timeline('multi-task-history')}&panel=storybook/actions/panel`
	);
	const preview = page.frameLocator('#storybook-preview-iframe');
	const row = preview
		.locator('[data-theme-pane]')
		.first()
		.locator('[data-run="run_hist_01_work_return"]');
	await row.click();
	await page.getByRole('tab', { name: /^Actions/ }).click();
	const actions = page.getByRole('tabpanel');
	await expect(actions.getByText('onselect').first()).toBeVisible({ timeout: 15_000 });
	await expect(actions.getByText('"run_hist_01_work_return"').first()).toBeVisible();
	await shot(page, 'ac4-onselect-action');
});

test('AC5: a failed validation shows status, summary and each check', async ({ page }) => {
	const pane = await open(page, evidence('validation-failed'));
	const validation = pane.getByTestId('evidence-validation');
	await expect.soft(validation).toContainText('Failed');
	await expect.soft(validation).toContainText('1 of 4 checks failed.');
	const check = (name: string) => validation.locator(`[data-check="${name}"]`);
	await expect.soft(check('test')).toContainText('Failed');
	await expect.soft(check('test')).toContainText('pnpm test');
	await expect.soft(check('test').getByTestId('check-exit')).toHaveText(/1/);
	await expect.soft(check('test')).toContainText('18.3 s');
	await expect.soft(check('lint')).toContainText('Passed');
	await expect.soft(check('check')).toContainText('Skipped');
	await expect.soft(check('worktree has a change')).toContainText('Error');
	await shot(page, 'ac5-validation-failed');
});

test('AC6: review shows Changes requested and every finding in full', async ({ page }) => {
	const pane = await open(page, evidence('review-changes-requested'));
	const review = pane.getByTestId('evidence-review');
	await expect.soft(review).toContainText('Changes requested');
	const findings = review.locator('[data-finding]');
	await expect.soft(findings).toHaveCount(3);
	const first = findings.first();
	await expect.soft(first).toContainText('Critical');
	await expect.soft(first).toContainText('Blocking');
	await expect
		.soft(first.getByTestId('finding-location'))
		.toContainText('src/lib/server/factory/client.ts:12');
	await expect.soft(first.getByTestId('finding-evidence')).toContainText('logs the token.');
	await expect.soft(findings.nth(1)).toContainText('Major');
	await expect.soft(findings.nth(2)).toContainText('Minor');
	await expect.soft(findings.nth(2)).toContainText('Non-blocking');
	await shot(page, 'ac6-review-findings');
});

test('AC7: evidence paths are text and the panel has no links', async ({ page }) => {
	for (const id of ['review-changes-requested', 'validation-passed']) {
		const pane = await open(page, evidence(id));
		await expect.soft(pane.getByRole('link')).toHaveCount(0);
		await expect.soft(pane.locator('[href]')).toHaveCount(0);
	}
	const pane = await open(page, evidence('validation-passed'));
	await expect(pane.getByTestId('evidence-session')).toContainText(
		'/home/agent/.pi/sessions/work-01-return.jsonl'
	);
});

test('AC8: the run-detail error shows the safe title and Retry', async ({ page }) => {
	const pane = await open(page, evidence('run-detail-error'));
	await expect.soft(pane).toContainText('Run unreachable');
	await expect.soft(pane.getByRole('button', { name: 'Retry' })).toBeVisible();
	await shot(page, 'ac8-run-detail-error');
});

test('AC9: agent-message renders a Latest activity label', async ({ page }) => {
	const pane = await open(page, 'components-agentmessage--with-label');
	await expect(pane.getByText('Latest activity', { exact: true })).toBeVisible();
	await shot(page, 'ac9-latest-activity');
});

test('AC10: badges use only the five signal tones in both themes', async ({ page }) => {
	await open(page, timeline('multi-task-history'));
	const signals = await page
		.locator('[data-slot="status-badge"]')
		.evaluateAll((els) => els.map((el) => el.getAttribute('data-signal')));
	expect(signals.length).toBeGreaterThan(0);
	for (const s of signals) expect.soft(['run', 'wait', 'standby', 'fault', 'clear']).toContain(s);
	// Both panes render the same badges.
	const panes = page.locator('#storybook-root [data-theme-pane]');
	await expect(panes.nth(1).locator('[data-slot="status-badge"]')).toHaveCount(signals.length / 2);
});
