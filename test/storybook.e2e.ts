import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const story = (id: string, theme: string) =>
	`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;

const rootVars = (page: Page) =>
	page.evaluate(() => {
		const s = getComputedStyle(document.documentElement);
		return { primary: s.getPropertyValue('--primary').trim(), scheme: s.colorScheme };
	});

test('AC1: pnpm storybook serves the manager and a badge story iframe', async ({ page }) => {
	const root = await page.goto(`${SB}/`);
	expect(root?.status()).toBe(200);
	await expect(
		page.getByRole('link', { name: /Badge/i }).or(page.getByText('Badge')).first()
	).toBeVisible();

	const frame = await page.goto(story('ui-badge--default', 'light'));
	expect(frame?.status()).toBe(200);
	await expect(page.getByText('Running')).toBeVisible();
	await shot(page, 'ac1-badge-default');
});

test('AC2: pnpm build-storybook writes storybook-static/index.html, ignored by git', () => {
	test.setTimeout(300_000);
	execFileSync('pnpm', ['build-storybook'], { stdio: 'pipe' });
	expect(existsSync('storybook-static/index.html')).toBe(true);
	const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
		encoding: 'utf8'
	});
	expect(status).not.toContain('storybook-static');
});

test('AC6: the Theme toolbar switches the story between light and dark', async ({ page }) => {
	await page.goto(`${SB}/?path=/story/ui-button--all-variants`);
	const preview = page.frameLocator('#storybook-preview-iframe');
	await expect(preview.getByRole('button', { name: 'outline' })).toBeVisible();

	await page.getByRole('button', { name: /Color theme/ }).click();
	await page.getByRole('option', { name: 'Dark', exact: true }).click();
	await expect
		.poll(() => preview.locator('html').evaluate((el) => getComputedStyle(el).colorScheme))
		.toBe('dark');
	await shot(page, 'ac6-toolbar-dark');

	await page.getByRole('button', { name: /Color theme/ }).click();
	await page.getByRole('option', { name: 'Light', exact: true }).click();
	await expect
		.poll(() => preview.locator('html').evaluate((el) => getComputedStyle(el).colorScheme))
		.toBe('light');
	await shot(page, 'ac6-toolbar-light');
});

for (const id of ['ui-badge--all-variants', 'ui-button--all-variants']) {
	test(`AC6: ${id} renders once in light and once in dark (test-run theme)`, async ({ page }) => {
		await page.goto(story(id, 'side-by-side'));
		const label = page.getByText('secondary', { exact: true });
		await expect(label).toHaveCount(2);
		const schemes = await label.evaluateAll((els) =>
			els.map((el) => getComputedStyle(el).getPropertyValue('--primary').trim())
		);
		expect(schemes[0]).not.toBe(schemes[1]);
		await shot(page, `ac6-${id}-side-by-side`);
	});
}

test('AC7: stories use Beacon Yellow, square buttons and JetBrains Mono', async ({ page }) => {
	await page.goto(story('ui-button--all-variants', 'light'));
	const button = page.getByRole('button', { name: 'default' });
	await expect(button).toBeVisible();
	expect((await rootVars(page)).primary).toBe('oklch(0.852 0.199 91.936)');
	await expect(button).toHaveCSS('border-radius', '0px');

	await page.goto(story('ui-button--all-variants', 'dark'));
	await expect(page.getByRole('button', { name: 'default' })).toBeVisible();
	await expect.poll(async () => (await rootVars(page)).primary).toBe('oklch(0.795 0.184 86.047)');

	await page.goto(story('ui-badge--all-variants', 'light'));
	const mono = page.getByText('font-mono', { exact: true });
	await expect(mono).toBeVisible();
	await expect(mono).toHaveCSS('font-family', /JetBrains Mono/);
	expect(
		await page.evaluate(async () => {
			await document.fonts.ready;
			return document.fonts.check('12px "JetBrains Mono Variable"');
		})
	).toBe(true);
	await shot(page, 'ac7-badge-tokens');
});
