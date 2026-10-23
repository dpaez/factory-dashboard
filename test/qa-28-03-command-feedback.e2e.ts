import { expect, test, type Locator, type Page } from '@playwright/test';

import { acceptedRetry } from '../src/lib/factory/fixtures/commands.ts';
import { ticketDetailActiveInQa } from '../src/lib/factory/fixtures/tickets.ts';

// QA for ticket #28, task 03: CommandFeedback stories (Storybook) and the shell
// region (built app plus fake factory). Never a real factory.
test.describe.configure({ retries: 1 });
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const storyId = (id: string) => `components-factory-commandfeedback--${id}`;

/** Open a story side by side, wait for its play function, and return both panes. */
const open = async (page: Page, id: string) => {
	await page.goto(`${SB}/iframe.html?id=${storyId(id)}&viewMode=story&globals=theme:side-by-side`);
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

/** Replace callback args with recorders that push `[name, ...args]` into window.__calls. */
const record = (page: Page, id: string, names: string[]) =>
	page.evaluate(
		([sid, list]) => {
			const w = window as unknown as {
				__calls: unknown[][];
				__STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void };
			};
			w.__calls = [];
			const updatedArgs = Object.fromEntries(
				list.map((n) => [n, (...a: unknown[]) => w.__calls.push([n, ...a])])
			);
			w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', { storyId: sid, updatedArgs });
		},
		[storyId(id), names] as const
	);
const calls = (page: Page) =>
	page.evaluate(() => (window as unknown as { __calls: unknown[][] }).__calls);

const live = (pane: Locator) => pane.locator('[aria-live="polite"]');
const rows = (pane: Locator) => pane.getByRole('listitem');

test('AC1: Pending shows the label, the ticket key in mono, Sending, and no Retry delivery', async ({
	page
}) => {
	const pane = (await open(page, 'pending')).first();
	const row = rows(pane);
	await expect(row).toHaveCount(1);
	await expect.soft(row).toContainText('Retry');
	await expect.soft(row).toContainText('Sending');
	const key = row.getByText(acceptedRetry.ticket, { exact: true });
	await expect.soft(key).toHaveCount(1);
	const font = await key.evaluate((el) => getComputedStyle(el).fontFamily);
	expect.soft(font.toLowerCase()).toMatch(/mono/);
	await expect.soft(pane.getByRole('button', { name: 'Retry delivery' })).toHaveCount(0);
	await shot(page, 'ac1-pending');
});

test('AC2: Accepted awaiting says waiting for the factory, never done/success/complete', async ({
	page
}) => {
	const panes = await open(page, 'accepted-awaiting');
	for (const i of [0, 1]) {
		const pane = panes.nth(i);
		await expect.soft(rows(pane)).toContainText('Accepted, waiting for the factory');
		await expect.soft(pane).not.toContainText(/done|success|complete/i);
	}
	await shot(page, 'ac2-accepted-awaiting');
});

test('AC3: Confirmed is announced in the live region and leaves no row', async ({ page }) => {
	const pane = (await open(page, 'confirmed')).first();
	await expect.soft(live(pane)).toContainText('The factory recorded it.');
	await expect.soft(rows(pane)).toHaveCount(0);
	await shot(page, 'ac3-confirmed');
});

test('AC4: each Rejected variant has Dismiss and no Retry delivery', async ({ page }) => {
	const pane = (await open(page, 'rejected')).first();
	const variants = [
		'The ticket changed; its current state is shown.',
		'Action access required',
		'Fix the highlighted fields'
	];
	await expect(rows(pane)).toHaveCount(3);
	for (const text of variants) {
		const row = rows(pane).filter({ hasText: text });
		await expect.soft(row).toHaveCount(1);
		await expect.soft(row).toContainText('Rejected');
		await expect.soft(row.getByRole('button', { name: 'Dismiss' })).toHaveCount(1);
		await expect.soft(row.getByRole('button', { name: 'Retry delivery' })).toHaveCount(0);
	}
	await shot(page, 'ac4-rejected');
});

test('AC5: Unconfirmed explains the lost answer and Retry delivery calls onretry with the id', async ({
	page
}) => {
	const pane = (await open(page, 'unconfirmed')).first();
	const row = rows(pane);
	await expect(row).toHaveCount(1);
	await expect.soft(row).toContainText('Unconfirmed');
	await expect
		.soft(row)
		.toContainText("The factory's answer was lost; the command may have been applied.");
	await shot(page, 'ac5-unconfirmed');
	await record(page, 'unconfirmed', ['onretry', 'ondismiss']);
	await row.getByRole('button', { name: 'Retry delivery' }).click();
	await expect
		.poll(() => calls(page))
		.toEqual([['onretry', '00000000-0000-4000-8000-000000000007']]);
});

test('AC6: one polite live region; unresolved rows stay after the notice clears', async ({
	page
}) => {
	for (const id of ['pending', 'unconfirmed']) {
		const pane = (await open(page, id)).first();
		await expect.soft(pane.locator('[aria-live]')).toHaveCount(1);
		await expect.soft(live(pane)).toHaveCount(1);
	}
	// Mixed: notice cleared (null), unresolved rows still listed.
	const pane = (await open(page, 'mixed')).first();
	await expect.soft(pane.locator('[aria-live]')).toHaveCount(1);
	await expect.soft(live(pane)).toHaveText('');
	await expect.soft(rows(pane)).toHaveCount(4);
	await expect.soft(rows(pane).filter({ hasText: 'Unconfirmed' })).toHaveCount(1);
	await expect.soft(rows(pane).filter({ hasText: 'Rejected' })).toHaveCount(1);
	await shot(page, 'ac6-mixed-notice-cleared');
});

test('AC7/AC9: every story renders in light and dark, square, no shadow, no Beacon Yellow', async ({
	page
}) => {
	test.setTimeout(180_000);
	const ids = [
		'empty',
		'pending',
		'accepted-awaiting',
		'confirmed',
		'rejected',
		'rejected-dismiss',
		'unconfirmed',
		'mixed'
	];
	for (const id of ids) {
		const panes = await open(page, id);
		await expect.soft(panes.nth(0)).toHaveAttribute('data-theme-pane', 'light');
		await expect.soft(panes.nth(1)).toHaveAttribute('data-theme-pane', 'dark');
		for (const i of [0, 1]) {
			const pane = panes.nth(i);
			await expect.soft(live(pane)).toHaveCount(1);
			// Every element: no shadow, no beacon hue; every surface (all but the
			// signal chip, a pill per DESIGN.md badge-signal) has square corners.
			const bad = await pane.evaluate((root) => {
				const out: string[] = [];
				for (const el of root.querySelectorAll('*')) {
					const s = getComputedStyle(el);
					const chip = el.closest('[data-slot="status-badge"]');
					// A focus ring is a spread-only layer (0 offset, 0 blur); anything else is elevation.
					const elevation = s.boxShadow
						.split(/,(?![^(]*\))/)
						.map((l) => l.trim())
						.filter((l) => l !== 'none' && !l.startsWith('rgba(0, 0, 0, 0)'))
						.filter((l) => !/\) 0px 0px 0px \d+(\.\d+)?px$/.test(l));
					if (elevation.length) out.push(`shadow ${el.tagName} ${elevation.join(' | ')}`);
					if (!chip && s.borderRadius !== '0px')
						out.push(`radius ${el.tagName} ${s.borderRadius}`);
					for (const c of [s.color, s.backgroundColor, s.borderColor])
						if (/0\.85\d* 0\.19\d* 9[12]|0\.79\d* 0\.18\d* 86/.test(c))
							out.push(`beacon ${el.tagName} ${c}`);
				}
				return out;
			});
			expect.soft(bad, `${id} pane ${i}`).toEqual([]);
		}
	}
});

test('AC8: every app page renders the empty feedback region with no console errors', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`);
	});
	for (const path of ['/', '/tickets', `/tickets/${ticketDetailActiveInQa.key}`]) {
		await page.goto(path);
		await expect(page.getByRole('banner')).toBeVisible();
		await expect.soft(page.locator('[aria-live="polite"][role="status"]')).toHaveCount(1);
		const region = page.getByRole('status').filter({ hasText: /^$/ });
		await expect.soft(region).toHaveCount(1);
		await expect.soft(page.getByRole('listitem').filter({ hasText: 'Retry delivery' })).toHaveCount(0);
		await expect.soft(page.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
		if (path === '/') await shot(page, 'ac8-app-empty-region');
	}
	expect(errors).toEqual([]);
});
