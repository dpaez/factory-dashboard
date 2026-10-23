import { expect, test, type Page } from '@playwright/test';

// QA for ticket #22, task 02: ConnectionStatus stories in Storybook.
test.describe.configure({ retries: 1 });
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const story = (id: string) => `components-factory-connectionstatus--${id}`;

/** Open a story side by side, wait for its play function, and return both panes. */
const open = async (page: Page, id: string) => {
	await page.goto(`${SB}/iframe.html?id=${story(id)}&viewMode=story&globals=theme:side-by-side`);
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

const STATES = [
	['connecting', 'Connecting'],
	['live', 'Live'],
	['reconnecting', 'Reconnecting'],
	['disconnected', 'Disconnected'],
	['authentication-failed', 'Authentication failed']
] as const;

test('AC1: each connection state has a story rendered in light and dark', async ({ page }) => {
	for (const [id, label] of STATES) {
		const panes = await open(page, id);
		await expect.soft(panes.nth(0)).toHaveAttribute('data-theme-pane', 'light');
		await expect.soft(panes.nth(1)).toHaveAttribute('data-theme-pane', 'dark');
		for (const i of [0, 1]) {
			await expect.soft(panes.nth(i).getByText(label, { exact: true })).toBeVisible();
		}
		await shot(page, `ac1-${id}`);
	}
});

test('AC2: authentication failed reads differently from disconnected', async ({ page }) => {
	const auth = (await open(page, 'authentication-failed')).first();
	await expect.soft(auth).toContainText('Authentication failed');
	await expect.soft(auth).toContainText("The factory refused the dashboard's token.");
	await expect.soft(auth).not.toContainText('Disconnected');
	await expect.soft(auth.locator('svg.lucide-key-round')).toHaveCount(1);
	await expect.soft(auth.locator('svg.lucide-unplug')).toHaveCount(0);

	const disc = (await open(page, 'disconnected')).first();
	await expect.soft(disc).toContainText('Disconnected');
	await expect.soft(disc).toContainText('The event stream stopped. Data may be out of date.');
	await expect.soft(disc).not.toContainText('Authentication failed');
	await expect.soft(disc.locator('svg.lucide-unplug')).toHaveCount(1);
	await expect.soft(disc.locator('svg.lucide-key-round')).toHaveCount(0);
});

test('AC3: non-live shows Last refresh with a monospace time, or Unavailable', async ({ page }) => {
	const pane = (await open(page, 'reconnecting')).first();
	await expect(pane).toContainText('Last refresh');
	const time = pane.locator('time');
	await expect(time).toHaveText('2026-10-21 14:32 UTC');
	const font = await time.evaluate((el) => getComputedStyle(el).fontFamily);
	expect(font.toLowerCase()).toMatch(/mono/);
	await shot(page, 'ac3-reconnecting-last-refresh');

	const never = (await open(page, 'disconnected-never-refreshed')).first();
	await expect.soft(never).toContainText('Last refresh');
	await expect.soft(never.getByText('Unavailable', { exact: true })).toBeVisible();
	await expect.soft(never.locator('time')).toHaveCount(0);
	await shot(page, 'ac3-never-refreshed');

	const live = (await open(page, 'live')).first();
	await expect.soft(live).not.toContainText('Last refresh');
});

test('AC4: Retry calls onretry in disconnected and auth failed; Live has no Retry', async ({
	page
}) => {
	const live = (await open(page, 'live')).first();
	await expect.soft(live.getByRole('button', { name: 'Retry' })).toHaveCount(0);

	for (const id of ['disconnected', 'authentication-failed']) {
		await page.goto(`${SB}/?path=/story/${story(id)}&panel=storybook/actions/panel`);
		const preview = page.frameLocator('#storybook-preview-iframe');
		const retry = preview
			.locator('[data-theme-pane]')
			.first()
			.getByRole('button', { name: 'Retry' });
		await expect(retry).toBeVisible({ timeout: 30_000 });
		await page.getByRole('tab', { name: /^Actions/ }).click();
		const actions = page.getByRole('tabpanel');
		const before = await actions.getByText('onretry').count();
		await retry.click();
		await expect
			.soft(actions.getByText('onretry'))
			.toHaveCount(before + 1, { timeout: 15_000 });
		await shot(page, `ac4-${id}-onretry-action`);
	}
});
