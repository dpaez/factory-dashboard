import { expect, test, type Page } from '@playwright/test';

// QA for ticket #24, task 02: BacklogCard, BacklogLane, IssuePreview, BoardSummary, in Storybook.
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const story = (id: string, theme: string) =>
	`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;
const root = (page: Page) => page.locator('#storybook-root');
const CARD = 'components-factory-backlogcard';
const LANE = 'components-factory-backloglane';
const PREVIEW = 'components-factory-issuepreview';
const SUMMARY = 'components-factory-boardsummary';

/** Open a story and wait until its own play function has finished. */
const open = async (page: Page, id: string, theme = 'light') => {
	await page.goto(story(id, theme));
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
					// A cold dev server may reload the iframe once while it optimizes deps.
					.catch(() => undefined),
			{ timeout: 30_000 }
		)
		.toBe('finished');
};

/** Replace callback args with recorders that push `[name, ...args]` into window.__calls. */
const record = (page: Page, storyId: string, names: string[]) =>
	page.evaluate(
		([id, list]) => {
			const w = window as unknown as {
				__calls: unknown[][];
				__STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void };
			};
			w.__calls = [];
			const updatedArgs = Object.fromEntries(
				list.map((n) => [n, (...a: unknown[]) => w.__calls.push([n, ...a])])
			);
			w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', { storyId: id, updatedArgs });
		},
		[storyId, names] as const
	);
const calls = (page: Page) =>
	page.evaluate(() => (window as unknown as { __calls: unknown[][] }).__calls);

test('AC1: Ready, Blocked and Umbrella cards show their availability; no Start control', async ({
	page
}) => {
	const cases: [string, string, string, string[]][] = [
		['ready', 'Ready', 'standby', []],
		['blocked', 'Blocked', 'wait', ['Blocked by', 'dpaez/factory-dashboard#21, KAI-7']],
		['umbrella-with-sub-issues', 'Umbrella', 'standby', []]
	];
	for (const [slug, label, signal, texts] of cases) {
		await open(page, `${CARD}--${slug}`);
		const button = root(page).getByRole('button');
		await expect(button).toHaveCount(1);
		const badge = button.locator('[data-signal]');
		await expect.soft(badge, slug).toHaveText(label);
		await expect.soft(badge, slug).toHaveAttribute('data-signal', signal);
		for (const t of texts) await expect.soft(button, slug).toContainText(t);
		await expect.soft(root(page), slug).not.toContainText(/start/i);
		await expect.soft(root(page).getByRole('button', { name: /start/i })).toHaveCount(0);
	}
	const subs = root(page).getByRole('link');
	await expect(subs).toHaveCount(2);
	await expect(subs.first()).toContainText('dpaez/factory-dashboard#17');
	await page.goto(story(`${CARD}--umbrella-with-sub-issues`, 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac1-umbrella-card');
});

test('AC2: labels are uncoloured outline badges and many labels wrap inside a narrow lane', async ({
	page
}) => {
	await open(page, `${CARD}--many-labels`);
	const button = root(page).getByRole('button');
	const labels = button.getByText(/^(enhancement|ui|p2|area\/flow-board-and-backlog-lane)$/);
	await expect(labels).toHaveCount(4);
	const report = await button.evaluate((el) => {
		const card = el.parentElement!.getBoundingClientRect();
		const chips = [...el.querySelectorAll('[data-slot="issue-label"]')] as HTMLElement[];
		const tops = new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top)));
		return {
			count: chips.length,
			rows: tops.size,
			inside: chips.every((c) => c.getBoundingClientRect().right <= card.right + 1),
			noOverflow: el.scrollWidth <= el.clientWidth + 1,
			toned: chips.filter((c) => c.hasAttribute('data-signal')).length,
			// Uncoloured: every label shares one neutral fill and ink, whatever its name.
			styles: new Set(
				chips.map((c) => `${getComputedStyle(c).backgroundColor}|${getComputedStyle(c).color}`)
			).size,
			bordered: chips.every((c) => parseFloat(getComputedStyle(c).borderTopWidth) > 0)
		};
	});
	expect(report).toEqual({
		count: 9,
		rows: expect.any(Number),
		inside: true,
		noOverflow: true,
		toned: 0,
		styles: 1,
		bordered: true
	});
	expect(report.rows).toBeGreaterThan(1);
	await page.goto(story(`${CARD}--many-labels`, 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac2-many-labels');
});

test('AC3: the card is one button; Tab, Enter and Space select; sub-issue links follow it', async ({
	page
}) => {
	const id = `${CARD}--umbrella-with-sub-issues`;
	await open(page, id);
	await record(page, id, ['onselect']);
	const button = root(page).getByRole('button');
	await expect(button).toHaveCount(1);
	await expect(button.locator('a, button, input, select')).toHaveCount(0);
	const links = root(page).getByRole('link');

	await page.mouse.click(2, 2);
	await page.keyboard.press('Tab');
	await expect(button).toBeFocused();
	await page.keyboard.press('Enter');
	await page.keyboard.press('Space');
	expect(await calls(page)).toEqual([
		['onselect', 'issue_16'],
		['onselect', 'issue_16']
	]);
	await page.keyboard.press('Tab');
	await expect(links.nth(0)).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(links.nth(1)).toBeFocused();
});

test('AC4: choosing a label filters the lane and marks the count; All labels restores', async ({
	page
}) => {
	await page.setViewportSize({ width: 600, height: 1600 });
	const id = `${LANE}--label-filter-applied`;
	await open(page, id);
	const lane = root(page).getByRole('group', { name: /^Backlog/ });
	const cards = lane.locator('[data-issue-id]');
	await expect(cards).toHaveCount(8);
	await expect(lane.getByRole('heading')).not.toContainText('filtered');

	await lane.getByLabel('Filter by label').selectOption('epic');
	await expect(cards).toHaveCount(3);
	for (const text of await cards.allInnerTexts()) expect.soft(text).toContain('epic');
	await expect(lane.getByRole('heading')).toContainText('3 of 8');
	await expect(lane.getByRole('heading')).toContainText('filtered');
	await shot(page, 'ac4-filtered-epic');

	await lane.getByLabel('Filter by label').selectOption({ label: 'All labels' });
	await expect(cards).toHaveCount(8);
	await expect(lane.getByRole('heading')).not.toContainText('filtered');
});

test('AC5: an empty backlog reads Backlog clear.; loading shows card-shaped placeholders', async ({
	page
}) => {
	await open(page, `${LANE}--empty`);
	await expect(root(page)).toContainText('Backlog clear.');
	await page.goto(story(`${LANE}--empty`, 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac5-backlog-clear');

	await page.emulateMedia({ reducedMotion: 'reduce' });
	await open(page, `${LANE}--loading`);
	const lane = root(page).getByRole('group', { name: /^Backlog/ });
	await expect(lane).toHaveAttribute('aria-busy', 'true');
	await expect(lane).not.toContainText('Backlog clear.');
	const boxes = await lane.locator('[data-slot="card-placeholder"]').evaluateAll((els) =>
		els.map((el) => ({
			...el.getBoundingClientRect().toJSON(),
			anim: getComputedStyle(el).animationName
		}))
	);
	expect(boxes).toHaveLength(3);
	for (const b of boxes) {
		expect.soft(b.height).toBeGreaterThan(40);
		expect.soft(b.width).toBeGreaterThan(b.height);
		expect.soft(b.anim, 'no pulse with reduced motion').toBe('none');
	}
	await page.goto(story(`${LANE}--loading`, 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac5-loading');
});

test('AC6: a failed lane keeps stale issues with their time and offers Retry; Refresh and Retry fire', async ({
	page
}) => {
	await page.setViewportSize({ width: 600, height: 1600 });
	const id = `${LANE}--tracker-unavailable-with-stale-issues`;
	await open(page, id);
	await record(page, id, ['onretry', 'onrefresh']);
	const lane = root(page).getByRole('group', { name: /^Backlog/ });
	const alert = lane.getByRole('alert');
	await expect(alert).toContainText('Backlog unavailable.');
	await expect(alert).toContainText('GitHub did not answer.');
	await expect(alert).toContainText('Showing issues from 2026-10-13 11:00 UTC');
	await expect(lane.locator('[data-issue-id]')).toHaveCount(8);
	await alert.getByRole('button', { name: 'Retry' }).click();
	await lane.getByRole('button', { name: 'Refresh' }).click();
	expect(await calls(page)).toEqual([['onretry'], ['onrefresh']]);
	await shot(page, 'ac6-tracker-unavailable-stale');
});

test('AC7: the Issue preview shows its facts, tracker link and links; missing facts read Unavailable', async ({
	page
}) => {
	await open(page, `${PREVIEW}--with-description-and-author`);
	const preview = root(page).getByRole('article');
	await expect(preview.getByRole('heading', { level: 2 }).first()).toHaveText(
		'Keyboard shortcuts for the board'
	);
	await expect(preview).toContainText('dpaez/factory-dashboard#31');
	await expect(preview).toContainText('enhancement');
	await expect(preview).toContainText('ui');
	await expect(preview).toContainText('Ready');
	const tracker = preview.getByRole('link', { name: /Open in tracker/ });
	await expect(tracker).toHaveAttribute('target', '_blank');
	await expect(tracker).toHaveAttribute('rel', 'noopener noreferrer');
	await expect(tracker).toHaveAttribute(
		'href',
		'https://github.com/dpaez/factory-dashboard/issues/31'
	);
	await expect(preview).toContainText('dpaez');
	await expect(preview).toContainText('2026-10-01 09:30 UTC');
	await expect(preview).toContainText('2026-10-12 16:45 UTC');

	await open(page, `${PREVIEW}--without-description-and-author`);
	await expect(preview.getByRole('term')).toHaveText(['Author', 'Created', 'Updated']);
	await expect(preview.getByRole('definition')).toHaveText([
		'Unavailable',
		'Unavailable',
		'Unavailable'
	]);
	// Author, created, updated and the description.
	await expect(preview.getByText('Unavailable', { exact: true })).toHaveCount(4);
	await expect(preview.getByRole('heading', { name: 'Description' })).toBeVisible();
	await page.goto(story(`${PREVIEW}--without-description-and-author`, 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac7-preview-unavailable');

	await open(page, `${PREVIEW}--blocked`);
	const blocker = preview.getByRole('link', { name: /dpaez\/factory-dashboard#21/ });
	await expect(blocker).toHaveAttribute(
		'href',
		'https://github.com/dpaez/factory-dashboard/issues/21'
	);
	await expect(blocker).toHaveAttribute('target', '_blank');
	await expect(preview).toContainText('KAI-7');

	await open(page, `${PREVIEW}--umbrella-with-sub-issues`);
	await expect(preview.getByRole('link', { name: /dpaez\/factory-dashboard#(17|21)/ })).toHaveCount(
		2
	);
});

test('AC8: the description renders as sanitized markdown and the XSS payload is inert', async ({
	page
}) => {
	const dialogs: string[] = [];
	page.on('dialog', (d) => {
		dialogs.push(d.message());
		void d.dismiss();
	});
	await open(page, `${PREVIEW}--with-description-and-author`);
	const preview = root(page).getByRole('article');
	await expect(preview.getByRole('heading', { name: 'Why' })).toBeVisible();
	await expect(preview.getByRole('listitem').filter({ hasText: 'show labels' })).toBeVisible();
	// The markdown keeps visible hierarchy: a larger, bolder heading and bulleted, indented lists.
	const markdown = preview.locator('[data-slot="markdown"]');
	const styles = await markdown.evaluate((el) => {
		const h2 = getComputedStyle(el.querySelector('h2')!);
		const p = getComputedStyle(el.querySelector('p')!);
		const ul = getComputedStyle(el.querySelector('ul')!);
		return {
			headingLarger: parseFloat(h2.fontSize) > parseFloat(p.fontSize),
			headingWeight: Number(h2.fontWeight),
			listStyle: ul.listStyleType,
			listIndent: parseFloat(ul.paddingLeft)
		};
	});
	expect(styles.headingLarger).toBe(true);
	expect(styles.headingWeight).toBeGreaterThanOrEqual(600);
	expect(styles.listStyle).toBe('disc');
	expect(styles.listIndent).toBeGreaterThan(0);
	await expect(preview.getByRole('link', { name: 'Backlog lane' })).toHaveAttribute(
		'href',
		'https://github.com/dpaez/factory-dashboard/issues/24'
	);
	await expect(preview).toContainText('<script>alert("xss")</script>');
	await expect(preview.locator('script, img, [onerror], a[href^="javascript:"]')).toHaveCount(0);
	await page.waitForTimeout(300);
	expect(dialogs).toEqual([]);
	await page.goto(story(`${PREVIEW}--with-description-and-author`, 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac8-preview-markdown');
});

test('AC9: BoardSummary shows ready to start as a number, a partial form, or Unavailable', async ({
	page
}) => {
	const ready = () => root(page).getByRole('listitem').filter({ hasText: 'ready to start' });
	await open(page, `${SUMMARY}--counts`);
	await expect(ready()).toHaveText(/^\s*5\s*ready to start\s*$/);
	await open(page, `${SUMMARY}--partial-ready-to-start`);
	await expect(ready()).toContainText('at least 100');
	await expect(ready()).toContainText('(partial)');
	await shot(page, 'ac9-summary-partial');
	await open(page, `${SUMMARY}--ready-to-start-unavailable`);
	await expect(ready()).toHaveText(/^\s*Unavailable\s*ready to start\s*$/);
});
