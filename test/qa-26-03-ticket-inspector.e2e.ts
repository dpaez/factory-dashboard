import { expect, test, type Locator, type Page } from '@playwright/test';

// QA for ticket #26, task 03: the ticket Inspector, driven through its Storybook stories.
test.describe.configure({ retries: 1 });
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const id = (name: string) => `components-factory-ticketinspector--${name}`;
const url = (name: string) =>
	`${SB}/iframe.html?id=${id(name)}&viewMode=story&globals=theme:side-by-side`;

/** Open an Inspector story side by side, wait for its play function, return both panes. */
const open = async (page: Page, name: string) => {
	await page.goto(url(name));
	// The Storybook dev server can reload the iframe while it optimizes deps; settle first.
	await page.waitForLoadState('networkidle');
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
	await page.waitForLoadState('networkidle');
	const panes = page.locator('#storybook-root [data-theme-pane]');
	await expect(panes).toHaveCount(2);
	return panes;
};
const inspector = (pane: Locator) => pane.getByTestId('ticket-inspector');
/** The `fn()` story arg's recorded calls, after the play function has run. */
const calls = (page: Page, arg: string) =>
	page.evaluate((name) => {
		const render = (
			window as unknown as {
				__STORYBOOK_PREVIEW__: {
					currentRender: {
						storyContext: () => { args: Record<string, { mock: { calls: unknown[][] } }> };
					};
				};
			}
		).__STORYBOOK_PREVIEW__.currentRender;
		return render.storyContext().args[name]!.mock.calls;
	}, arg);
const schemes = (panes: Locator) =>
	panes.evaluateAll((els) => els.map((el) => getComputedStyle(el).colorScheme));

test('AC1: every listed Inspector state renders in a light and a dark pane', async ({ page }) => {
	const states: [string, (pane: Locator) => Promise<void>][] = [
		['running', (p) => expect(p.getByRole('tab', { name: 'Tasks' })).toBeVisible()],
		[
			'waiting-with-question',
			(p) =>
				expect(p.getByRole('heading', { name: 'Attention requests', exact: true })).toBeVisible()
		],
		['paused', (p) => expect(p.getByText('Paused', { exact: true }).first()).toBeVisible()],
		['failed', (p) => expect(p.getByRole('tab', { name: 'Tasks' })).toBeVisible()],
		[
			'ready-for-handoff',
			(p) => expect(p.getByText('Ready for handoff', { exact: true }).first()).toBeVisible()
		],
		['complete', (p) => expect(p.getByText('Complete', { exact: true }).first()).toBeVisible()],
		['cancelled', (p) => expect(p.getByText('Cancelled', { exact: true }).first()).toBeVisible()],
		['rerun-current-execution', (p) => expect(p.getByTestId('executions')).toBeVisible()],
		[
			'rerun-past-execution',
			(p) => expect(p.getByTestId('past-execution')).toContainText('read-only')
		],
		[
			'no-tasks-planning',
			(p) => expect(p).toContainText('Planning — tasks appear when the plan is ready.')
		],
		['null-usage', (p) => expect(p.getByTestId('usage-total')).toContainText('Unavailable')],
		['not-found', (p) => expect(p).toContainText('No such ticket')],
		['loading', (p) => expect(p).toContainText('Loading ticket…')]
	];
	for (const [name, check] of states) {
		await test.step(name, async () => {
			const panes = await open(page, name);
			for (const pane of await panes.all()) {
				await expect.soft(inspector(pane)).toBeVisible();
				await check(pane);
			}
			expect.soft(await schemes(panes)).toEqual(['light', 'dark']);
			await shot(page, `ac1-${name}`);
		});
	}
	// Null usage never reads as zero cost.
	await open(page, 'null-usage');
	await expect(page.locator('#storybook-root')).not.toContainText('$0.00');
	// Loading is announced as busy.
	const loading = await open(page, 'loading');
	await expect(inspector(loading.first())).toHaveAttribute('aria-busy', 'true');
});

test('AC2: the tabs read Tasks, Activity, Evidence, Usage; Activity and Evidence show a placeholder', async ({
	page
}) => {
	let pane = (await open(page, 'running')).first();
	await expect(pane.getByRole('tab')).toHaveText(['Tasks', 'Activity', 'Evidence', 'Usage']);

	pane = (await open(page, 'activity-tab')).first();
	await expect(pane.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(pane.getByRole('tabpanel')).toContainText('Activity is not available yet.');
	await shot(page, 'ac2-activity-placeholder');

	pane = (await open(page, 'evidence-tab')).first();
	await expect(pane.getByRole('tab', { name: 'Evidence' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(pane.getByRole('tabpanel')).toContainText('Evidence is not available yet.');
	await shot(page, 'ac2-evidence-placeholder');
});

test('AC3: clicking or arrowing reports the tab, and the panel follows the tab prop', async ({
	page
}) => {
	// Controlled story: ontabchange updates `tab`, so the panel moves only if the tab was reported.
	let pane = (await open(page, 'panel-follows-the-tab-prop')).first();
	await pane.getByRole('tab', { name: 'Usage' }).click();
	await expect(pane.getByRole('tab', { name: 'Usage' })).toHaveAttribute('aria-selected', 'true');
	await expect(pane.getByRole('tabpanel').getByTestId('usage-total')).toBeVisible();
	await pane.getByRole('tab', { name: 'Tasks' }).click();
	await expect(pane.getByRole('tabpanel').getByTestId('tasks-progress')).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await expect(pane.getByRole('tab', { name: 'Activity' })).toBeFocused();
	await expect(pane.getByRole('tabpanel')).toContainText('Activity is not available yet.');
	await page.keyboard.press('ArrowRight');
	await expect(pane.getByRole('tabpanel')).toContainText('Evidence is not available yet.');
	await shot(page, 'ac3-panel-follows-tab');

	// Uncontrolled story: `tab` stays 'tasks', so choosing another tab does not change the panel.
	pane = (await open(page, 'tasks-tab')).first();
	const before = (await calls(page, 'ontabchange')).length;
	await pane.getByRole('tab', { name: 'Usage' }).click();
	// One choice, one report: exactly one call, naming the chosen tab.
	await expect
		.poll(async () => (await calls(page, 'ontabchange')).slice(before))
		.toEqual([['usage']]);
	// Give a late duplicate the chance to arrive before counting again.
	await page.waitForTimeout(250);
	expect((await calls(page, 'ontabchange')).slice(before)).toEqual([['usage']]);
	const mid = before + 1;
	await pane.getByRole('tab', { name: 'Tasks' }).focus();
	await page.keyboard.press('ArrowRight');
	await expect
		.poll(async () => (await calls(page, 'ontabchange')).slice(mid))
		.toEqual([['activity']]);
	await page.waitForTimeout(250);
	expect((await calls(page, 'ontabchange')).slice(mid)).toEqual([['activity']]);
	await expect(pane.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true');
	await expect(pane.getByRole('tabpanel').getByTestId('tasks-progress')).toBeVisible();
	await expect(pane.getByRole('tabpanel')).not.toContainText('Evidence is not available yet.');
});

test('AC4: Close renders only with onclose and calls it', async ({ page }) => {
	let panes = await open(page, 'without-close-page');
	await expect(panes.getByRole('button', { name: 'Close inspector' })).toHaveCount(0);
	await expect(panes.getByRole('link', { name: 'Open ticket' })).toHaveCount(0);

	panes = await open(page, 'with-close-board');
	const close = panes.first().getByRole('button', { name: 'Close inspector' });
	await expect(close).toBeVisible();
	await expect(panes.getByRole('button', { name: 'Close inspector' })).toHaveCount(2);
	await shot(page, 'ac4-with-close');
	const before = (await calls(page, 'onclose')).length;
	await close.click();
	expect((await calls(page, 'onclose')).length).toBe(before + 1);
	await expect(page).toHaveURL(/with-close-board/);
});

test('AC5: the waiting-with-question story shows the open question', async ({ page }) => {
	const pane = (await open(page, 'waiting-with-question')).first();
	await expect(pane).toContainText('Should the reply composer submit on Enter or on Cmd+Enter?');
	const tabs = pane.getByRole('tablist');
	await expect(tabs).toBeVisible();
	await shot(page, 'ac5-open-question');
});

test('AC6: no Beacon Yellow surface; badges use the five signal tones', async ({ page }) => {
	const names = [
		'running',
		'waiting-with-question',
		'paused',
		'failed',
		'ready-for-handoff',
		'complete',
		'cancelled',
		'rerun-past-execution',
		'error'
	];
	for (const name of names) {
		await test.step(name, async () => {
			for (const pane of await (await open(page, name)).all()) {
				const result = await inspector(pane).evaluate((root) => {
					const probe = (cls: string) => {
						const el = document.createElement('span');
						el.className = cls;
						root.append(el);
						const bg = getComputedStyle(el).backgroundColor;
						el.remove();
						return bg;
					};
					const beacon = probe('bg-primary');
					const tones = ['run', 'wait', 'standby', 'fault', 'clear'].map((t) =>
						probe(`bg-signal-${t}`)
					);
					const surfaces = [...root.querySelectorAll<HTMLElement>('*')].filter(
						(el) =>
							!el.closest('[data-testid="timeline"]') &&
							getComputedStyle(el).backgroundColor === beacon
					);
					const badges = [...root.querySelectorAll<HTMLElement>('[data-slot="status-badge"]')].map(
						(el) => getComputedStyle(el).backgroundColor
					);
					return {
						beaconSurfaces: surfaces.map((el) => el.outerHTML.slice(0, 120)),
						offTone: badges.filter((bg) => !tones.includes(bg))
					};
				});
				expect.soft(result.beaconSurfaces).toEqual([]);
				expect.soft(result.offTone).toEqual([]);
			}
		});
	}
});
