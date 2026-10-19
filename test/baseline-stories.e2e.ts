import { expect, test, type Page } from '@playwright/test';

// QA for ticket #18, task 02: baseline stories for the 12 existing components.
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

// Sidebar title for each component listed in the task's Outcome.
const COMPONENTS: Record<string, string> = {
	'info-card': 'Components/InfoCard',
	'info-cost-card': 'Components/InfoCostCard',
	'work-card': 'Components/WorkCard',
	'light-card': 'Components/LightCard',
	timeline: 'Components/Timeline',
	'agent-message': 'Components/AgentMessage',
	'usage-list': 'Components/UsageList',
	'tickets-table-status-cell': 'Components/TicketsTable/StatusCell',
	'tickets-table-title-cell': 'Components/TicketsTable/TitleCell',
	'tickets-table-cost-cell': 'Components/TicketsTable/CostCell',
	'toggle-mode': 'Components/ToggleMode',
	logo: 'Components/Logo'
};

type Entry = { id: string; title: string; name: string; type: string; importPath: string };
const storiesByComponent = async (page: Page) => {
	const res = await page.request.get(`${SB}/index.json`);
	const { entries } = (await res.json()) as { entries: Record<string, Entry> };
	return Object.values(entries).filter((e) => e.type === 'story');
};

test('AC1: each of the 12 components has a story file next to it and appears in the sidebar', async ({
	page
}) => {
	const stories = await storiesByComponent(page);
	for (const [file, title] of Object.entries(COMPONENTS)) {
		const own = stories.filter((s) => s.title === title);
		expect.soft(own.length, `${title} has stories`).toBeGreaterThan(0);
		for (const s of own) {
			expect
				.soft(s.importPath, `${title} story file`)
				.toMatch(new RegExp(`/${file}\\.stories\\.svelte$`));
		}
	}

	await page.goto(`${SB}/?path=/story/components-logo--default`);
	const sidebar = page.locator('#storybook-explorer-tree');
	await expect(sidebar.getByText('Logo', { exact: true })).toBeVisible();
	const expand = async (name: string) => {
		const node = sidebar.getByRole('button', { name, exact: true });
		if ((await node.getAttribute('aria-expanded')) === 'false') await node.click();
	};
	await expand('TicketsTable');
	for (const name of ['StatusCell', 'TitleCell', 'CostCell']) await expand(name);
	for (const title of Object.values(COMPONENTS)) {
		const leaf = title.split('/').at(-1)!;
		await expect.soft(sidebar.getByText(leaf, { exact: true }).first()).toBeVisible();
	}
	await shot(page, 'ac1-sidebar');
});

test('AC2: every baseline story renders in light, in dark, and side by side', async ({ page }) => {
	test.setTimeout(300_000);
	const titles = new Set(Object.values(COMPONENTS));
	const stories = (await storiesByComponent(page)).filter((s) => titles.has(s.title));
	expect(stories.length).toBeGreaterThanOrEqual(12);

	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));

	for (const s of stories) {
		for (const theme of ['light', 'dark'] as const) {
			await page.goto(`${SB}/iframe.html?id=${s.id}&viewMode=story&globals=theme:${theme}`);
			const root = page.locator('#storybook-root');
			// storybook.e2e.ts runs build-storybook in parallel, which can slow a cold story render past 5s.
			await expect.soft(root, `${s.id} ${theme} renders`).not.toBeEmpty({ timeout: 20_000 });
			await expect.soft(page.locator('.sb-errordisplay'), `${s.id} ${theme} no error`).toBeHidden();
			await expect.soft
				.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), {
					message: `${s.id} ${theme} color scheme`
				})
				.toBe(theme);
		}
	}

	// The test run uses the side-by-side theme: one light pane and one dark pane.
	const firstPerComponent = Object.values(COMPONENTS).map((title) =>
		stories.find((s) => s.title === title)!
	);
	for (const s of firstPerComponent) {
		await page.goto(`${SB}/iframe.html?id=${s.id}&viewMode=story&globals=theme:side-by-side`);
		const panes = page.locator('[data-theme-pane]');
		await expect(panes).toHaveCount(2);
		const schemes = await panes.evaluateAll((els) =>
			els.map((el) => getComputedStyle(el).colorScheme)
		);
		expect.soft(schemes, `${s.id} side by side`).toEqual(['light', 'dark']);
		await shot(page, `ac2-${s.title.split('/').slice(1).join('-').toLowerCase()}`);
	}
	expect(errors).toEqual([]);
});

test('AC4: clicking toggle-mode in Storybook switches the theme without errors', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});

	await page.goto(`${SB}/?path=/story/components-togglemode--default&globals=theme:light`);
	const preview = page.frameLocator('#storybook-preview-iframe');
	const scheme = () => preview.locator('html').evaluate((el) => getComputedStyle(el).colorScheme);
	const toggle = preview.getByRole('button', { name: 'Toggle theme' });
	await expect(toggle).toBeVisible();
	await expect.poll(scheme).toBe('light');

	await toggle.click();
	await expect.poll(scheme).toBe('dark');
	await shot(page, 'ac4-toggle-dark');

	await toggle.click();
	await expect.poll(scheme).toBe('light');
	await shot(page, 'ac4-toggle-light');
	expect(errors).toEqual([]);
});
