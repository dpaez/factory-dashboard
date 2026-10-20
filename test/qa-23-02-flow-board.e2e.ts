import { expect, test, type Page } from '@playwright/test';

// QA for ticket #23, task 02: Flow board components, driven in Storybook.
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const BOARD = 'components-factory-flowboard';
const story = (id: string, theme: string) =>
	`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;
const root = (page: Page) => page.locator('#storybook-root');
/** Open a story and wait until its own play function has finished. */
const open = async (page: Page, id: string, theme = 'light') => {
	await page.goto(story(id, theme));
	await expect
		.poll(
			() =>
				page.evaluate(
					() =>
						(
							window as unknown as {
								__STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } };
							}
						).__STORYBOOK_PREVIEW__?.currentRender?.phase
				),
			{ timeout: 30_000 }
		)
		.toBe('finished');
};
const lane = (page: Page, name: string) =>
	root(page).getByRole('group', { name: new RegExp(`^${name}\\b`) });

/** Replace story args the way the Controls panel does, so the component re-renders. */
const updateArgs = (page: Page, storyId: string, updated: string) =>
	page.evaluate(
		([id, src]) => {
			const w = window as unknown as {
				__STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void };
			};
			const updatedArgs = new Function('w', `return (${src})(w)`)(window);
			w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', { storyId: id, updatedArgs });
		},
		[storyId, updated] as const
	);

/** Record every key passed to onselect, and reflect it into selectedKey like a caller would. */
const recordSelection = (page: Page, storyId: string) =>
	updateArgs(
		page,
		storyId,
		`(w) => { w.__sel = []; return { onselect: (k) => { w.__sel.push(k);
			w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', { storyId: ${JSON.stringify(storyId)}, updatedArgs: { selectedKey: k } }); } }; }`
	);
const selections = (page: Page) =>
	page.evaluate(() => (window as unknown as { __sel: string[] }).__sel);

test('AC1: FlowBoard stories render every required state in light and dark', async ({ page }) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
	const LANES = ['Plan', 'Work', 'QA', 'Review', 'Handoff'];

	const cases: [string, (page: Page) => Promise<void>][] = [
		[
			'every-lane-populated',
			async (p) => {
				for (const name of [...LANES, 'Other'])
					await expect.soft(lane(p, name).getByRole('button').first()).toBeVisible();
			}
		],
		[
			'some-lanes-empty',
			async (p) => {
				await expect.soft(lane(p, 'Review')).toContainText('No tickets in Review');
				await expect.soft(lane(p, 'Work').getByRole('button')).not.toHaveCount(0);
			}
		],
		[
			'all-lanes-empty',
			async (p) => {
				for (const name of LANES)
					await expect.soft(lane(p, name)).toContainText(`No tickets in ${name}`);
			}
		],
		[
			'loading',
			async (p) => {
				for (const name of LANES)
					await expect.soft(lane(p, name)).toContainText(`Loading ${name} lane`);
			}
		],
		[
			'error',
			async (p) => {
				await expect.soft(root(p).getByRole('alert')).toHaveCount(5);
				await expect.soft(root(p).getByRole('alert').first()).toContainText('did not answer');
			}
		],
		[
			'ticket-in-qa',
			async (p) => {
				await expect.soft(lane(p, 'QA').getByRole('button')).not.toHaveCount(0);
			}
		],
		[
			'paused-ticket-in-work',
			async (p) => {
				await expect.soft(lane(p, 'Work')).toContainText('Paused');
				await expect.soft(lane(p, 'Work').getByRole('button', { pressed: true })).toHaveCount(1);
			}
		],
		[
			'long-titles',
			async (p) => {
				// The long title wraps onto several lines and stays inside its lane.
				const card = root(p)
					.getByRole('button')
					.filter({ hasText: 'Make the dashboard show every ticket' });
				const fit = await card.evaluate((el) => {
					const laneEl = el.closest('[role="group"]')!.getBoundingClientRect();
					const box = el.getBoundingClientRect();
					const title = el.querySelector('span > span:nth-child(2)') as HTMLElement;
					const lh = parseFloat(getComputedStyle(title).lineHeight);
					return {
						lines: Math.round(title.getBoundingClientRect().height / lh),
						inside: box.right <= laneEl.right + 1 && el.scrollWidth <= el.clientWidth + 1
					};
				});
				expect.soft(fit.lines, 'long title wraps').toBeGreaterThan(1);
				expect.soft(fit.inside, 'long title stays in the card').toBe(true);
			}
		],
		[
			'unknown-stage-in-other',
			async (p) => {
				await expect.soft(lane(p, 'Other').getByRole('button')).toHaveCount(1);
				await expect.soft(lane(p, 'Other')).toContainText('stage triage');
			}
		]
	];

	await page.setViewportSize({ width: 1440, height: 900 });
	for (const [name, check] of cases) {
		for (const theme of ['light', 'dark'] as const) {
			await open(page, `${BOARD}--${name}`, theme);
			await expect(root(page).getByRole('group').first()).toBeVisible({ timeout: 20_000 });
			await expect.soft(page.locator('.sb-errordisplay')).toBeHidden();
			await expect
				.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
				.toBe(theme);
			await check(page);
		}
		await page.goto(story(`${BOARD}--${name}`, 'side-by-side'));
		await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
		await expect(root(page).getByRole('group').first()).toBeVisible();
		await shot(page, `ac1-${name}`);
	}
	expect(errors).toEqual([]);
});

test('AC2: every card is Tab-reachable, Enter and Space select it, nothing is draggable or nested', async ({
	page
}) => {
	const id = `${BOARD}--every-lane-populated`;
	await page.setViewportSize({ width: 1440, height: 900 });
	await open(page, id, 'light');
	const all = root(page).locator('[data-ticket-key]');
	await expect(all.first()).toBeVisible({ timeout: 20_000 });
	await recordSelection(page, id);

	const keys = await all.evaluateAll((els) =>
		els.map((el) => (el as HTMLElement).dataset.ticketKey!)
	);
	expect(keys.length).toBe(15);

	// Every card is a button with no interactive or draggable descendants.
	const structure = await all.evaluateAll((els) =>
		els.map((el) => ({
			role: el.tagName === 'BUTTON' || el.getAttribute('role') === 'button',
			nested: el.querySelectorAll('a, button, [role="button"], [role="link"], input').length,
			draggable: [el, ...el.querySelectorAll('*')].some(
				(n) => (n as HTMLElement).draggable || n.getAttribute('draggable') === 'true'
			)
		}))
	);
	for (const s of structure) expect.soft(s).toEqual({ role: true, nested: 0, draggable: false });
	await expect(root(page).locator('[draggable="true"]')).toHaveCount(0);

	// Tab from the top reaches each card, in order.
	// Click blank page padding so sequential focus starts at the top of the document.
	await page.mouse.click(2, 2);
	for (const key of keys) {
		await page.keyboard.press('Tab');
		await expect(all.and(page.locator(`[data-ticket-key="${key}"]`))).toBeFocused();
	}

	// Enter and Space each select the focused card.
	const plan = lane(page, 'Plan').getByRole('button').first();
	const review = lane(page, 'Review').getByRole('button').first();
	await plan.focus();
	await page.keyboard.press('Enter');
	await expect(plan).toHaveAttribute('aria-pressed', 'true');
	await review.focus();
	await page.keyboard.press('Space');
	await expect(review).toHaveAttribute('aria-pressed', 'true');
	await expect(plan).toHaveAttribute('aria-pressed', 'false');
	expect(await selections(page)).toEqual([keys[0], keys[8]]);
	await shot(page, 'ac2-space-selected-review-card');
});

test('AC3: the focused, selected card stays focused and selected after it moves from Work to Review', async ({
	page
}) => {
	const id = `${BOARD}--every-lane-populated`;
	await page.setViewportSize({ width: 1440, height: 900 });
	await open(page, id, 'light');
	await expect(root(page).locator('[data-ticket-key]').first()).toBeVisible({ timeout: 20_000 });
	await recordSelection(page, id);

	const work = lane(page, 'Work').getByRole('button').nth(1);
	const key = (await work.getAttribute('data-ticket-key'))!;
	await work.focus();
	await page.keyboard.press('Enter');
	await expect(work).toHaveAttribute('aria-pressed', 'true');
	await expect(work).toBeFocused();

	// The factory reports the ticket in Review: move its card across lanes.
	await updateArgs(
		page,
		id,
		`(w) => {
			const p = w.__STORYBOOK_PREVIEW__;
			const lanes = structuredClone(p.storyStoreValue.args.get(${JSON.stringify(id)}).lanes.map((l) => ({ ...l, cards: [...l.cards] })));
			const from = lanes.find((l) => l.id === 'work');
			const card = from.cards.find((c) => c.key === ${JSON.stringify(key)});
			from.cards = from.cards.filter((c) => c !== card);
			lanes.find((l) => l.id === 'review').cards.unshift({ ...card, stage: 'Review', rawStage: 'review' });
			return { lanes };
		}`
	);

	const moved = lane(page, 'Review').locator(`[data-ticket-key="${key}"]`);
	await expect(moved).toBeVisible();
	await expect(lane(page, 'Work').locator(`[data-ticket-key="${key}"]`)).toHaveCount(0);
	await expect(moved).toBeFocused();
	await expect(moved).toHaveAttribute('aria-pressed', 'true');
	await shot(page, 'ac3-moved-card-focused-in-review');
});

test('AC4: unknown cost reads Unavailable and a plan card without tasks reads Planning tasks', async ({
	page
}) => {
	await open(page, 'components-factory-ticketcard--cost-unavailable', 'light');
	const card = root(page).getByRole('button');
	await expect(card).toContainText('Unavailable', { timeout: 20_000 });
	await expect(card).not.toContainText('$0.00');
	await expect(card).not.toContainText('—');

	await open(page, 'components-factory-ticketcard--planning-tasks', 'light');
	await expect(card).toContainText('Planning tasks', { timeout: 20_000 });
	await expect(card).not.toContainText('0/0');

	// On the board, no card shows a zero or dash cost, and no plan card shows 0/0.
	await page.setViewportSize({ width: 1440, height: 900 });
	await open(page, `${BOARD}--every-lane-populated`, 'light');
	const all = root(page).locator('[data-ticket-key]');
	await expect(all.first()).toBeVisible({ timeout: 20_000 });
	for (const text of await all.allTextContents()) {
		expect.soft(text).toMatch(/\$\d+\.\d{2}|Unavailable/);
		expect.soft(text).not.toContain('—');
		expect.soft(text).not.toMatch(/\b0\/0\b/);
	}
	await expect(lane(page, 'Plan')).toContainText('Planning tasks');
	await expect(lane(page, 'Plan')).toContainText('Unavailable');
	await shot(page, 'ac4-board-cost-and-planning');
});

test('AC5: Handoff shows Preparing vs Ready for handoff; QA heading shows optional only without QA activity', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await open(page, `${BOARD}--preparing-and-ready-for-handoff`, 'light');
	const handoff = lane(page, 'Handoff');
	await expect(handoff.getByRole('button')).toHaveCount(2, { timeout: 20_000 });
	await expect(handoff.getByRole('button').filter({ hasText: 'Preparing handoff' })).toHaveCount(1);
	await expect(handoff.getByRole('button').filter({ hasText: 'Ready for handoff' })).toHaveCount(1);
	await expect(lane(page, 'QA').getByRole('heading')).toContainText('optional');
	await shot(page, 'ac5-handoff-and-qa-optional');

	await open(page, `${BOARD}--ticket-in-qa`, 'light');
	await expect(lane(page, 'QA').getByRole('button')).not.toHaveCount(0, { timeout: 20_000 });
	await expect(lane(page, 'QA').getByRole('heading')).not.toContainText('optional');
});

test('AC6: BoardSummary shows in progress, agents running and ready to start as Unavailable', async ({
	page
}) => {
	await open(page, 'components-factory-boardsummary--counts', 'light');
	const summary = root(page).getByRole('list', { name: 'Board summary' });
	await expect(summary).toBeVisible({ timeout: 20_000 });
	await expect(summary.getByRole('listitem')).toHaveText([
		/12\s*in progress/,
		/2\s*agents running/,
		/Unavailable\s*ready to start/
	]);
	await shot(page, 'ac6-board-summary');
});

/** From page load, record every background colour each matching element shows, per frame. */
const sampleFromLoad = (page: Page, selector: string) =>
	page.addInitScript((sel) => {
		const w = window as unknown as { __bg: Record<string, string[]> };
		w.__bg = {};
		const tick = () => {
			document.querySelectorAll(sel).forEach((el, i) => {
				const c = getComputedStyle(el).backgroundColor;
				const list = (w.__bg[i] ??= []);
				if (list.at(-1) !== c) list.push(c);
			});
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}, selector);
const samples = (page: Page) =>
	page.evaluate(() => (window as unknown as { __bg: Record<string, string[]> }).__bg);
const resetSamples = (page: Page) =>
	page.evaluate(() => ((window as unknown as { __bg: Record<string, string[]> }).__bg = {}));
const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

const addToReview = (id: string) => `(w) => {
	const lanes = w.__STORYBOOK_PREVIEW__.storyStoreValue.args.get(${JSON.stringify(id)}).lanes.map((l) => ({ ...l, cards: [...l.cards] }));
	const card = lanes.find((l) => l.id === 'work').cards[0];
	lanes.find((l) => l.id === 'review').cards.push({ ...card, key: card.key + '-moved' });
	return { lanes };
}`;

for (const reduced of [false, true]) {
	test(`AC7: WorkCard and lane counts ${reduced ? 'never flash with reduced motion' : 'flash only on change, never on first render'}`, async ({
		page
	}) => {
		if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });

		// WorkCard: a story with no interaction holds still from first render.
		await sampleFromLoad(page, '#storybook-root [data-slot="card"]');
		await open(page, 'components-workcard--plan-stage');
		await pause(page, 600);
		expect(Object.values(await samples(page)), 'no WorkCard flash on first render').toEqual([
			expect.any(Array)
		]);
		expect((await samples(page))[0]).toHaveLength(1);

		// WorkCard: a count change flashes, then returns to rest.
		await open(page, 'components-workcard--count-change');
		const value = root(page).getByRole('paragraph');
		const before = Number(await value.textContent());
		await resetSamples(page);
		await root(page).getByRole('button', { name: 'Add a ticket' }).click();
		await expect(value).toHaveText(String(before + 1));
		await pause(page, 900);
		const card = (await samples(page))[0]!;
		if (reduced) expect(card, 'no WorkCard flash with reduced motion').toHaveLength(1);
		else {
			expect(card.length, 'WorkCard flashes on change').toBeGreaterThan(2);
			expect(card.at(-1), 'WorkCard returns to rest').toBe(card[0]);
		}

		// Lane counts: no flash on first render, a flash when a lane gains a card.
		const id = `${BOARD}--some-lanes-empty`;
		await page.setViewportSize({ width: 1440, height: 900 });
		await sampleFromLoad(page, '#storybook-root [data-slot="lane-count"]');
		await open(page, id);
		await pause(page, 600);
		for (const list of Object.values(await samples(page)))
			expect(list, 'no lane-count flash on first render').toHaveLength(1);

		await resetSamples(page);
		await updateArgs(page, id, addToReview(id));
		await expect(lane(page, 'Review').getByRole('heading')).toContainText('1');
		await pause(page, 900);
		const lanes = await samples(page);
		const review = lanes[3]!; // Plan, Work, QA, Review, Handoff
		if (reduced) expect(review, 'no lane-count flash with reduced motion').toHaveLength(1);
		else {
			expect(review.length, 'Review count flashes on change').toBeGreaterThan(2);
			// Back at rest: transparent again (the browser may serialize it as rgba or oklab).
			expect(review.at(-1)).toMatch(/^rgba\(0, 0, 0, 0\)$|\/ 0\)$/);
		}
		for (const i of ['0', '2', '4'])
			expect(lanes[i], `unchanged lane ${i} does not flash`).toHaveLength(1);
	});
}

test('AC8: numbers, refs and times are tabular mono; cards are square, shadowless, and beacon-free', async ({
	page
}) => {
	for (const theme of ['light', 'dark'] as const) {
		await page.setViewportSize({ width: 1440, height: 900 });
		await open(page, `${BOARD}--every-lane-populated`, theme);
		const all = root(page).locator('[data-ticket-key]');
		await expect(all.first()).toBeVisible({ timeout: 20_000 });
		const report = await page.evaluate(() => {
			const fill = document.querySelector('[data-slot="progress-indicator"]')!;
			const beacon = getComputedStyle(fill).backgroundColor;
			const isMono = (el: Element) => {
				const s = getComputedStyle(el);
				return /mono/i.test(s.fontFamily) && s.fontVariantNumeric.includes('tabular-nums');
			};
			const leafWith = (root: Element, re: RegExp) =>
				[...root.querySelectorAll('*')].filter(
					(el) =>
						re.test((el.textContent ?? '').trim()) &&
						![...el.children].some((c) => re.test((c.textContent ?? '').trim()))
				);
			const problems: string[] = [];
			for (const card of document.querySelectorAll('[data-ticket-key]')) {
				const key = (card as HTMLElement).dataset.ticketKey;
				const s = getComputedStyle(card);
				// Ring utilities are 0-offset, 0-blur box-shadows; anything else is a real shadow.
				for (const part of s.boxShadow === 'none' ? [] : s.boxShadow.split(/,(?![^(]*\))/))
					if (!/0px 0px 0px/.test(part)) problems.push(`${key} shadow ${part}`);
				if (s.borderRadius !== '0px') problems.push(`${key} radius ${s.borderRadius}`);
				for (const el of [card, ...card.querySelectorAll('*')]) {
					if ((el as HTMLElement).dataset.slot === 'progress-indicator') continue;
					const es = getComputedStyle(el);
					if (es.backgroundColor === beacon || es.color === beacon)
						problems.push(`${key} beacon on ${el.tagName}`);
				}
				for (const re of [
					/\/[\w-]+#\d+$/,
					/^Updated /,
					/^\$\d|^Unavailable$/,
					/^\d+\/\d+ approved$/
				])
					for (const el of leafWith(card, re))
						if (!isMono(el)) problems.push(`${key} not mono: ${el.textContent}`);
			}
			for (const el of document.querySelectorAll('[data-slot="lane-count"]')) {
				if (!isMono(el)) problems.push(`lane count not mono: ${el.textContent}`);
				if (getComputedStyle(el).backgroundColor === beacon)
					problems.push(`lane count beacon at rest: ${el.textContent}`);
			}
			return problems;
		});
		expect(report, theme).toEqual([]);
	}

	await open(page, 'components-factory-boardsummary--counts', 'light');
	const value = root(page).getByRole('listitem').first().locator('span').first();
	await expect(value).toBeVisible({ timeout: 20_000 });
	const mono = await value.evaluate((el) => {
		const s = getComputedStyle(el);
		return /mono/i.test(s.fontFamily) && s.fontVariantNumeric.includes('tabular-nums');
	});
	expect(mono, 'summary numbers are tabular mono').toBe(true);
});
