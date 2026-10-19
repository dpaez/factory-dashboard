import { expect, test, type Page } from '@playwright/test';

// QA for ticket #20, task 02: Tabs and AlertDialog primitives in Storybook.
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const story = (id: string, theme = 'light') =>
	`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;
// storybook.e2e.ts runs build-storybook in parallel, which can abort a dev-server load.
const open = async (page: Page, url: string) => {
	for (let attempt = 0; ; attempt++) {
		try {
			return await page.goto(url);
		} catch (e) {
			if (attempt >= 2 || !String(e).includes('ERR_ABORTED')) throw e;
		}
	}
};

const tab = (page: Page, name: string) => page.getByRole('tab', { name }).first();
const panel = (page: Page) => page.getByRole('tabpanel').first();
const DIALOG = 'Cancel this execution?';

test('AC3: ArrowRight/ArrowLeft move and activate tabs, skipping a disabled trigger', async ({
	page
}) => {
	await open(page, story('ui-tabs--default'));
	const tasks = tab(page, 'Tasks');
	const activity = tab(page, 'Activity');
	await expect(tasks).toHaveAttribute('aria-selected', 'true');
	await tasks.focus();
	await page.keyboard.press('ArrowRight');
	await expect(activity).toBeFocused();
	await expect(activity).toHaveAttribute('aria-selected', 'true');
	await expect(panel(page)).toContainText('The work stage started');
	await shot(page, 'ac3-tabs-activity-active');
	await page.keyboard.press('ArrowLeft');
	await expect(tasks).toBeFocused();
	await expect(panel(page)).toContainText('Two tasks are planned');

	await open(page, story('ui-tabs--disabled-trigger'));
	const evidence = tab(page, 'Evidence');
	const usage = tab(page, 'Usage');
	await expect(evidence).toBeDisabled();
	await tab(page, 'Activity').focus();
	await page.keyboard.press('ArrowRight');
	await expect(usage).toBeFocused();
	await expect(usage).toHaveAttribute('aria-selected', 'true');
	await expect(evidence).toHaveAttribute('aria-selected', 'false');
	await expect(panel(page)).toContainText('This execution has used');
	await shot(page, 'ac3-tabs-disabled-skipped');
});

test('AC4: a keyboard-focused tab trigger matches :focus-visible with a visible ring', async ({
	page
}) => {
	await open(page, story('ui-tabs--focus'));
	const tasks = tab(page, 'Tasks');
	// Let the story's play function finish, then start from an unfocused trigger.
	await expect(tasks).toBeFocused();
	await page.locator('body').click({ position: { x: 1, y: 1 } });
	await expect(tasks).not.toBeFocused();
	const style = () =>
		tasks.evaluate((el) => {
			const s = getComputedStyle(el);
			return { border: s.borderColor, shadow: s.boxShadow };
		});
	// Wait for the blur transition to finish before sampling the unfocused style.
	await expect.poll(async () => (await style()).shadow).not.toMatch(/ 2px\b/);
	const before = await style();
	await page.keyboard.press('Tab');
	await expect(tasks).toBeFocused();
	expect(await tasks.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
	await expect.poll(async () => (await style()).border).not.toBe(before.border);
	await expect.poll(async () => (await style()).shadow).not.toBe(before.shadow);
	await shot(page, 'ac4-tabs-focus-visible');
});

for (const theme of ['light', 'dark'] as const) {
	test(`AC5: activating the trigger opens a named, described alertdialog (${theme})`, async ({
		page
	}) => {
		await open(page, story('ui-alertdialog--closed', theme));
		const trigger = page.getByRole('button', { name: 'Cancel execution', expanded: false });
		await expect(trigger).toBeVisible();
		await expect(page.getByRole('alertdialog')).toHaveCount(0);
		await trigger.click();
		const dialog = page.getByRole('alertdialog', { name: DIALOG });
		await expect(dialog).toBeVisible();
		await expect(dialog).toHaveAccessibleDescription(/discards the work in progress/);
		await shot(page, `ac5-alertdialog-open-${theme}`);
	});
}

test('AC6 + AC7: focus enters and stays in the dialog; Escape closes it and restores focus', async ({
	page
}) => {
	await open(page, story('ui-alertdialog--closed'));
	const trigger = page.getByRole('button', { name: 'Cancel execution', expanded: false });
	await expect(trigger).toBeVisible();
	await trigger.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('alertdialog', { name: DIALOG });
	await expect(dialog).toBeVisible();
	const inDialog = () =>
		dialog.evaluate((el) => el.contains(document.activeElement) && document.activeElement !== null);
	await expect.poll(inDialog).toBe(true);
	for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
		await page.keyboard.press(key);
		expect(await inDialog(), `focus inside after ${key}`).toBe(true);
	}
	await page.keyboard.press('Escape');
	await expect(page.getByRole('alertdialog')).toHaveCount(0);
	await expect(trigger).toBeFocused();
	await shot(page, 'ac7-alertdialog-closed-focus-restored');
});

for (const theme of ['light', 'dark'] as const) {
	test(`AC8: destructive pending dialog shows a disabled busy action and operable Cancel (${theme})`, async ({
		page
	}) => {
		await open(page, story(`ui-alertdialog--destructive-pending-${theme}`, theme));
		const dialog = page.getByRole('alertdialog', { name: DIALOG });
		await expect(dialog).toBeVisible();
		const action = dialog.getByRole('button', { name: 'Cancelling…' });
		await expect(action).toBeDisabled();
		await expect(action).toHaveAttribute('aria-busy', 'true');
		const cancel = dialog.getByRole('button', { name: 'Keep running' });
		await expect(cancel).toBeEnabled();
		await shot(page, `ac8-destructive-pending-${theme}`);
		await cancel.click();
		await expect(page.getByRole('alertdialog')).toHaveCount(0);
	});
}
