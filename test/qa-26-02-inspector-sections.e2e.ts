import { expect, test, type Page } from '@playwright/test';

// QA for ticket #26, task 02: ticket header, task list and usage panel, driven through Storybook.
test.describe.configure({ retries: 1 });
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const story = (id: string, theme = 'side-by-side') =>
	`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;

/** Open a story side by side, wait for its play function, and return its light pane. */
const open = async (page: Page, id: string) => {
	await page.goto(story(id));
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
const header = (id: string) => `components-factory-ticketheader--${id}`;

test('AC1: a running ticket header shows execution, stage, status, reason and task/round', async ({
	page
}) => {
	let pane = await open(page, header('running'));
	await expect
		.soft(pane.getByRole('heading', { level: 2 }))
		.toHaveText('Switch routes to the factory API');
	await expect.soft(pane.getByTestId('execution')).toHaveText('Execution 1');
	await expect.soft(pane.getByTestId('stage')).toHaveText(/work/i);
	await expect.soft(pane.getByText('Active', { exact: true }).first()).toBeVisible();
	await expect
		.soft(pane.getByTestId('current-task'))
		.toContainText('Typed read operations and API fixtures');
	await expect.soft(pane.getByTestId('current-task')).toContainText('round 1');
	await shot(page, 'ac1-header-running');

	// The running fixture has no status reason; a waiting ticket carries one.
	pane = await open(page, header('waiting-with-question'));
	await expect.soft(pane.getByTestId('status-reason')).toHaveText(/\S/);
	pane = await open(page, header('paused-with-round'));
	await expect.soft(pane.getByTestId('status-reason')).toHaveText('Paused by the operator.');
});

test('AC2: a past execution is read-only, links to the current one, and the picker marks it', async ({
	page
}) => {
	const pane = await open(page, header('past-execution-with-history'));
	const banner = pane.getByTestId('past-execution');
	await expect(banner).toContainText('read-only');
	await expect(banner.getByRole('link', { name: 'Go to the current execution' })).toBeVisible();
	const history = pane.getByTestId('executions').getByRole('listitem');
	await expect(history).toHaveCount(2);
	await expect(pane.getByRole('link', { name: 'Execution 1' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(pane.getByRole('link', { name: 'Execution 2' })).not.toHaveAttribute(
		'aria-current',
		'page'
	);
	await shot(page, 'ac2-past-execution');
});

test('AC3: tracker warnings sit in their own block, apart from the status reason', async ({
	page
}) => {
	const pane = await open(page, header('tracker-warnings'));
	const warnings = pane.getByRole('group', { name: 'Tracker warnings' });
	await expect(warnings).toContainText('Could not update the issue label: tracker_unavailable');
	await expect(pane.getByTestId('status-reason')).toHaveText(
		'The agent session could not be resumed.'
	);
	await expect(warnings.getByTestId('status-reason')).toHaveCount(0);
	// Not the Fault tone: the block's left rule is not the fault signal colour.
	const colours = await warnings.evaluate((el) => {
		const probe = document.createElement('span');
		probe.className = 'bg-signal-fault';
		el.ownerDocument.body.append(probe);
		const fault = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return { border: getComputedStyle(el).borderLeftColor, fault };
	});
	expect(colours.border).not.toBe(colours.fault);
	await shot(page, 'ac3-tracker-warnings');
});

test('AC4: the source section links URL refs, shows plain refs, and reads Unavailable', async ({
	page
}) => {
	let pane = await open(page, header('source-from-a-tracker-url'));
	const source = pane.getByRole('group', { name: 'Source' });
	const link = source.getByRole('link', { name: /Open in tracker/ });
	await expect(link).toHaveAttribute(
		'href',
		'https://github.com/dpaez/factory-dashboard/issues/21'
	);
	await expect(link).toHaveAttribute('target', '_blank');
	await expect
		.soft(source.getByRole('definition').filter({ hasText: 'Unavailable' }))
		.toHaveCount(4);
	for (const term of ['Labels', 'Author', 'Dates', 'Description']) {
		await expect.soft(source.getByRole('term').filter({ hasText: term })).toBeVisible();
	}
	await source.scrollIntoViewIfNeeded();
	await shot(page, 'ac4-source-url');

	pane = await open(page, header('cancelled-with-a-non-url-source'));
	const plain = pane.getByRole('group', { name: 'Source' });
	await expect(plain).toContainText('notes/ticket.md');
	await expect(plain.getByRole('link')).toHaveCount(0);
});

test('AC5: Ready for handoff and Complete read and look different', async ({ page }) => {
	let pane = await open(page, header('ready-for-handoff'));
	const ready = pane.getByText('Ready for handoff', { exact: true }).first();
	await expect(ready).toBeVisible();
	await expect(pane.getByTestId('pull-request')).toContainText('PR #42 · open');
	const readyBg = await ready.evaluate((el) => getComputedStyle(el).backgroundColor);
	await shot(page, 'ac5-ready-for-handoff');

	pane = await open(page, header('complete'));
	const complete = pane.getByText('Complete', { exact: true }).first();
	await expect(complete).toBeVisible();
	await expect(pane.getByText('Ready for handoff', { exact: true })).toHaveCount(0);
	await expect(pane.getByTestId('pull-request')).toContainText('PR #38 · merged');
	const completeBg = await complete.evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(completeBg).not.toBe(readyBg);
	await shot(page, 'ac5-complete');
});

test('AC6: activating a blocker moves focus to the blocking task row', async ({ page }) => {
	const pane = await open(page, 'components-factory-tasklist--blockers');
	const row = (id: string) => pane.locator(`[data-task="${id}"]`);
	await row('03').getByRole('button', { name: /02/ }).click();
	await expect(row('02')).toBeFocused();
	await row('03').getByRole('button', { name: /01/ }).focus();
	await page.keyboard.press('Enter');
	await expect(row('01')).toBeFocused();
	await shot(page, 'ac6-blocker-focus');
});

test('AC7: no tasks in plan shows the planning state', async ({ page }) => {
	let pane = await open(page, 'components-factory-tasklist--planning');
	await expect(pane).toContainText('Planning — tasks appear when the plan is ready.');
	await shot(page, 'ac7-planning');
	pane = await open(page, 'components-factory-tasklist--no-tasks-after-plan');
	await expect(pane).toContainText('No tasks recorded for this execution.');
	await expect(pane).not.toContainText('Planning');
});

test('AC8: null usage shows — / Unavailable everywhere, never $0.00', async ({ page }) => {
	let pane = await open(page, 'components-factory-usagepanel--null-usage');
	await expect(page.locator('#storybook-root')).not.toContainText('$0.00');
	await expect(pane.getByTestId('usage-total')).toContainText('—');
	await expect(pane.getByTestId('usage-total')).toContainText('Unavailable');
	const figures = pane.getByTestId('usage-tokens').getByRole('definition');
	await expect(figures).toHaveCount(5);
	for (const figure of await figures.all()) await expect.soft(figure).toContainText('—');
	await expect(pane.getByTestId('run-cost')).toHaveText('—');
	await shot(page, 'ac8-null-usage');

	pane = await open(page, 'components-usagelist--run-without-usage');
	await expect(pane.getByTestId('run-cost')).toHaveText('—');
	await expect(page.locator('#storybook-root')).not.toContainText('$0.00');
});
