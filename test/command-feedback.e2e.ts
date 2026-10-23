import { expect, test, type Page } from '@playwright/test';

import { ticketDetailActiveInQa } from '../src/lib/factory/fixtures/tickets.ts';

// CommandFeedback: mounted once in the shell (built app plus fake factory) and
// its stories in Storybook. Neither reaches a real factory.
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const collectErrors = (page: Page) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`);
	});
	return errors;
};

test('every page renders one empty feedback region below the header', async ({ page }) => {
	const errors = collectErrors(page);
	for (const path of ['/', '/tickets', `/tickets/${ticketDetailActiveInQa.key}`]) {
		await page.goto(path);
		await expect(page.locator('header')).toBeVisible();
		const region = page.locator('[data-slot="command-feedback"]');
		await expect(region).toHaveCount(1);
		await expect(region).toHaveAttribute('data-empty', 'true');
		await expect(region.locator('[aria-live="polite"]')).toHaveCount(1);
		await expect(region.locator('[aria-live="polite"]')).toHaveText('');
		await expect(region.locator('[data-slot="command-intent"]')).toHaveCount(0);
		// Below the header, and nothing visible takes space when empty.
		const box = await region.boundingBox();
		const header = await page.locator('header').boundingBox();
		expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
		expect(box!.height).toBe(0);
		await shot(page, `command-feedback-empty-${path.split('/')[1] || 'root'}`);
	}
	expect(errors).toEqual([]);
});

/** Open a story side by side, wait for its play function, and return both panes. */
const open = async (page: Page, id: string) => {
	await page.goto(
		`${SB}/iframe.html?id=components-factory-commandfeedback--${id}&viewMode=story&globals=theme:side-by-side`
	);
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

const STORIES = [
	['pending', 'Sending', ['submitting']],
	['accepted-awaiting', 'Accepted, waiting for the factory', ['accepted']],
	['confirmed', 'The factory recorded it.', []],
	['rejected', 'Action access required', ['rejected', 'rejected', 'rejected']],
	['unconfirmed', "The factory's answer was lost", ['unconfirmed']]
] as const;

test('CommandFeedback stories render in light and dark', async ({ page }) => {
	test.setTimeout(120_000);
	for (const [id, text, phases] of STORIES) {
		const panes = await open(page, id);
		await expect.soft(panes.nth(0)).toHaveAttribute('data-theme-pane', 'light');
		await expect.soft(panes.nth(1)).toHaveAttribute('data-theme-pane', 'dark');
		for (const i of [0, 1]) {
			const pane = panes.nth(i);
			const region = pane.locator('[data-slot="command-feedback"]');
			await expect.soft(region).toContainText(text);
			const rows = region.locator('[data-slot="command-intent"]');
			await expect.soft(rows).toHaveCount(phases.length);
			for (const [n, phase] of phases.entries()) {
				const row = rows.nth(n);
				await expect.soft(row).toHaveAttribute('data-phase', phase);
				await expect.soft(row).toHaveCSS('border-radius', '0px');
				await expect.soft(row).toHaveCSS('box-shadow', 'none');
			}
		}
		const unconfirmed = panes.first().getByRole('button', { name: 'Retry delivery' });
		await expect.soft(unconfirmed).toHaveCount(id === 'unconfirmed' ? 1 : 0);
		await shot(page, `command-feedback-${id}`);
	}
});
