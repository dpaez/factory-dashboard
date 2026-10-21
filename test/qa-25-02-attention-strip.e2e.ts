import { expect, test, type Page } from '@playwright/test';

// QA for ticket #25, task 02: AttentionStrip, driven through its Storybook stories.
// The Storybook dev iframe sometimes reloads under full-suite load, dropping window.__calls.
test.describe.configure({ retries: 1 });
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const STRIP = 'components-factory-attentionstrip';
const story = (slug: string, theme: string) =>
	`${SB}/iframe.html?id=${STRIP}--${slug}&viewMode=story&globals=theme:${theme}`;
const root = (page: Page) => page.locator('#storybook-root');
const strip = (page: Page) =>
	root(page)
		.getByRole('group', { name: /attention/i })
		.first();
const openNext = (page: Page) => strip(page).getByRole('button', { name: /^Open next/ });

/** Open a story and wait until its own play function has finished. */
const open = async (page: Page, slug: string, theme = 'light') => {
	await page.goto(story(slug, theme));
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
};

type Item = { key: string; displayRef: string };
type W = {
	__calls: string[];
	__STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void };
	__STORYBOOK_PREVIEW__: {
		storyStoreValue: { args: { get: (id: string) => Record<string, unknown> } };
	};
};

/** Replace onselect with a recorder that pushes the key into window.__calls. */
const record = (page: Page, slug: string) =>
	page.evaluate((id) => {
		const w = window as unknown as W;
		w.__calls = [];
		w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
			storyId: id,
			updatedArgs: { onselect: (key: string) => w.__calls.push(key) }
		});
	}, `${STRIP}--${slug}`);
const calls = (page: Page) => page.evaluate(() => (window as unknown as W).__calls);
const queueOf = (page: Page, slug: string) =>
	page.evaluate((id) => {
		const args = (window as unknown as W).__STORYBOOK_PREVIEW__.storyStoreValue.args.get(id);
		return (args.attention as { queue: Item[] }).queue.map(({ key, displayRef }) => ({
			key,
			displayRef
		}));
	}, `${STRIP}--${slug}`);

const groups = (page: Page) => strip(page).getByRole('listitem');

test('AC1: each reason has its own story showing only that reason', async ({ page }) => {
	const cases: [string, string][] = [
		['question', 'Question'],
		['limit', 'Limit'],
		['approval', 'Approval'],
		['waiting-for-a-reply', 'Waiting for a reply'],
		['paused', 'Paused'],
		['failed', 'Failed'],
		['ready-for-handoff', 'Ready for handoff']
	];
	for (const [slug, label] of cases) {
		await open(page, slug);
		await expect.soft(strip(page), slug).toContainText('1 ticket needs attention');
		await expect.soft(groups(page), slug).toHaveCount(1);
		await expect.soft(groups(page).first(), slug).toContainText(label);
		await expect.soft(openNext(page), slug).toBeVisible();
	}
	await page.goto(story('question', 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac1-question-light-dark');
});

test('AC2: mixed, two reasons, partial, long values, empty, loading and error render light and dark', async ({
	page
}) => {
	await open(page, 'mixed');
	await expect(strip(page)).toContainText('7 tickets need attention');
	await expect(groups(page)).toHaveCount(6);

	await open(page, 'two-reasons-on-one-ticket');
	// Three reason groups, but the headline counts distinct tickets.
	await expect(groups(page)).toHaveCount(3);
	await expect(strip(page).getByRole('heading')).toContainText('2 tickets need attention');

	await open(page, 'partial-headline');
	await expect(strip(page).getByRole('heading')).toContainText('at least 3');
	await expect(strip(page).getByRole('heading')).toContainText('(partial)');

	await open(page, 'long-titles-and-references');
	await expect(openNext(page)).toBeVisible();
	const overflow = await strip(page).evaluate((el) => el.scrollWidth > el.clientWidth + 1);
	expect(overflow, 'long reference stays inside the strip').toBe(false);

	for (const slug of [
		'mixed',
		'two-reasons-on-one-ticket',
		'partial-headline',
		'long-titles-and-references',
		'empty',
		'loading',
		'error'
	]) {
		await page.goto(story(slug, 'side-by-side'));
		const panes = page.locator('[data-theme-pane]');
		await expect.soft(panes, slug).toHaveCount(2);
		await expect.soft(panes.getByRole('group', { name: /attention/i }), slug).toHaveCount(2);
		if (slug === 'mixed') await shot(page, 'ac2-mixed-light-dark');
		if (slug === 'long-titles-and-references') await shot(page, 'ac2-long-values-light-dark');
	}
});

test('AC3: empty reads No attention needed.; empty, loading and error show no button', async ({
	page
}) => {
	await open(page, 'empty');
	await expect(strip(page)).toHaveText('No attention needed.');
	await expect(root(page).getByRole('button')).toHaveCount(0);
	await page.goto(story('empty', 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac3-empty');

	await open(page, 'loading');
	await expect(strip(page).locator('[aria-busy="true"]')).toHaveCount(1);
	await expect(root(page).getByRole('button')).toHaveCount(0);

	await open(page, 'error');
	await expect(strip(page).getByRole('alert')).toContainText('Attention unavailable.');
	await expect(strip(page).getByRole('alert')).toContainText('The factory API did not answer.');
	await expect(root(page).getByRole('button')).toHaveCount(0);
	await page.goto(story('error', 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac3-error');
});

test('AC4 + AC6: Open next names its target, then presses walk the queue in priority order and wrap', async ({
	page
}) => {
	// A fresh render of Mixed: reload so the play function's presses do not count.
	await open(page, 'mixed');
	const queue = await queueOf(page, 'mixed');
	expect(queue).toHaveLength(7);
	// Handoffs come last in priority order.
	expect(queue.at(-1)!.displayRef).toBe('dpaez/factory-dashboard#14');
	await record(page, 'mixed');

	// The play test already pressed through the queue once; walk it again from wherever it is.
	const start = await openNext(page).getAttribute('data-target-key');
	const offset = queue.findIndex((item) => item.key === start);
	expect(offset).toBeGreaterThanOrEqual(0);
	const expected: string[] = [];
	for (let i = 0; i <= queue.length; i++) {
		const item = queue[(offset + i) % queue.length]!;
		// AC6: the button names the destination before the press.
		await expect(openNext(page)).toHaveAccessibleName(`Open next ${item.displayRef}`);
		await openNext(page).click();
		expected.push(item.key);
		await expect.poll(() => calls(page)).toEqual(expected);
	}
	await shot(page, 'ac4-mixed-open-next');
});

test('AC5: new, reordered or removed items never call onselect; a removed item is never next', async ({
	page
}) => {
	await open(page, 'mixed');
	await record(page, 'mixed');
	await openNext(page).click();
	expect(await calls(page)).toHaveLength(1);

	const target = await openNext(page).getAttribute('data-target-key');
	// Reorder the queue and remove the item the button currently targets.
	await page.evaluate(
		([id, removed]) => {
			const w = window as unknown as W;
			const attention = w.__STORYBOOK_PREVIEW__.storyStoreValue.args.get(id).attention as {
				queue: { key: string }[];
			};
			const queue = [...attention.queue].reverse().filter((item) => item.key !== removed);
			w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
				storyId: id,
				updatedArgs: { attention: { ...attention, queue } }
			});
		},
		[`${STRIP}--mixed`, target] as const
	);
	await expect(openNext(page)).not.toHaveAttribute('data-target-key', target!);
	await page.waitForTimeout(300);
	expect(await calls(page), 'new data does not select').toHaveLength(1);

	// Press through the whole new queue: the removed item never comes up.
	for (let i = 0; i < 8; i++) await openNext(page).click();
	const after = await calls(page);
	expect(after).toHaveLength(9);
	expect(after.slice(1)).not.toContain(target);
});

test('AC7: Beacon Yellow only on Open next; square, no shadow, visible focus ring; GLOSSARY copy', async ({
	page
}) => {
	for (const theme of ['light', 'dark']) {
		await open(page, 'mixed', theme);
		const button = openNext(page);
		await button.evaluate((el) => (el as HTMLElement).blur());
		await page.waitForTimeout(500); // let the focus-ring transition finish
		const report = await strip(page).evaluate((el) => {
			const btn = el.querySelector('button')!;
			const beacon = getComputedStyle(btn).backgroundColor;
			const all = [el, ...el.querySelectorAll('*')] as HTMLElement[];
			const s = getComputedStyle(btn);
			return {
				beaconUsers: all.filter((n) => getComputedStyle(n).backgroundColor === beacon).length,
				radius: s.borderTopLeftRadius,
				shadow: s.boxShadow,
				notProse: el.closest('.not-prose') !== null
			};
		});
		expect.soft(report.beaconUsers, theme).toBe(1);
		expect.soft(report.radius, theme).toBe('0px');
		// Unfocused: no visible shadow (Tailwind leaves transparent zero-size layers).
		expect
			.soft(report.shadow.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?/g, '').trim(), theme)
			.toMatch(/^(none)?$/);
		expect.soft(report.notProse, theme).toBe(true);

		await page.mouse.click(2, 2);
		await page.keyboard.press('Tab');
		await expect(button).toBeFocused();
		const focus = await button.evaluate((el) => {
			const s = getComputedStyle(el);
			return { outline: s.outlineStyle !== 'none' && s.outlineWidth !== '0px', ring: s.boxShadow };
		});
		expect.soft(focus.outline || focus.ring !== 'none', `${theme} focus ring`).toBe(true);
		if (theme === 'dark') await shot(page, 'ac7-focus-ring-dark');
	}
	for (const slug of ['mixed', 'two-reasons-on-one-ticket', 'partial-headline', 'empty', 'error']) {
		await open(page, slug);
		await expect.soft(root(page), slug).not.toContainText(/needs user|blocked/i);
	}
});
