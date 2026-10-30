import { expect, test } from './fixtures.ts';

// The Flow board fills the viewport. A long lane scrolls inside itself;
// the page does not. Below lg the lanes stack and peek one card.

test('a long backlog scrolls inside its lane and the page stays put', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 640 });
	await page.goto('/');
	const lane = page.locator('[data-slot="backlog-lane"]');
	await expect(lane.locator('[data-slot="backlog-card"]')).not.toHaveCount(0);

	const metrics = await lane.locator('[data-slot="lane-scroll"]').evaluate((node) => ({
		laneScrolls: node.scrollHeight > node.clientHeight + 1,
		pageFits: document.documentElement.scrollHeight <= window.innerHeight + 1,
		scrollY: window.scrollY
	}));
	expect(metrics.laneScrolls).toBe(true);
	expect(metrics.pageFits).toBe(true);
	expect(metrics.scrollY).toBe(0);

	const board = page.locator('[data-slot="flow-board"]');
	const boardScroll = await board.evaluate((node) => {
		const style = getComputedStyle(node);
		return {
			overflowX: style.overflowX,
			overflowY: style.overflowY,
			wider: node.scrollWidth > node.clientWidth + 1
		};
	});
	expect(boardScroll).toEqual({ overflowX: 'hidden', overflowY: 'hidden', wider: false });

	for (const name of ['Plan', 'Work', 'QA', 'Review', 'Handoff']) {
		await expect(
			page.getByRole('heading', { name: new RegExp(`^${name}\\b`), level: 2 })
		).toBeInViewport();
	}

	await expect(page.getByRole('button', { name: 'See more' })).toHaveCount(0);
	await expect(page.locator('[data-slot="attention-more"]')).toBeHidden();
	await expect(
		page.locator('[data-slot="attention-strip"]').getByRole('list', { name: 'Attention reasons' })
	).toBeVisible();

	await page.getByRole('button', { name: 'Hide backlog' }).click();
	// The lane stays mounted for the small-screen stack and is hidden on this row.
	await expect(page.locator('[data-slot="backlog-lane"]')).toBeHidden();
	await expect(page.getByRole('button', { name: 'Show backlog' })).toBeVisible();
	await page.getByRole('button', { name: 'Show backlog' }).click();
	await expect(page.locator('[data-slot="backlog-lane"]')).toBeVisible();
});

test('a phone stacks one column and See more opens a shared height', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');

	const header = page.locator('#flow-board-heading').locator('..');
	await expect(header).toBeVisible();
	const headerBox = await header.boundingBox();
	expect(headerBox).not.toBeNull();
	expect(headerBox!.height).toBeLessThan(56);

	const strip = page.locator('[data-slot="attention-strip"]');
	await expect(strip.getByRole('button', { name: 'See more' })).toBeVisible();
	await expect(strip.getByRole('list', { name: 'Attention reasons' })).toBeHidden();
	await strip.getByRole('button', { name: 'See more' }).click();
	await expect(strip.getByRole('list', { name: 'Attention reasons' })).toBeVisible();
	await expect(strip.getByRole('button', { name: /^Open next/ })).toBeVisible();
	await strip.getByRole('button', { name: 'See less' }).click();
	await expect(strip.getByRole('list', { name: 'Attention reasons' })).toBeHidden();

	const lanes = page.locator('[data-lane]');
	const xs = await lanes.evaluateAll((nodes) =>
		nodes.map((node) => Math.round(node.getBoundingClientRect().x))
	);
	expect(new Set(xs).size).toBe(1);

	const plan = page.locator('[data-lane="plan"]');
	await expect(plan.locator('[data-slot="ticket-card"]').nth(1)).toBeHidden();
	await plan.getByRole('button', { name: 'See more' }).click();

	const work = page.locator('[data-lane="work"]');
	await work.getByRole('button', { name: 'See more' }).click();

	const [planBox, workBox] = await Promise.all([plan.boundingBox(), work.boundingBox()]);
	expect(planBox).not.toBeNull();
	expect(workBox).not.toBeNull();
	expect(Math.round(planBox!.height)).toBe(Math.round(workBox!.height));

	const scrolls = await plan.locator('[data-slot="lane-scroll"]').evaluate((node) => {
		node.scrollTop = 40;
		return node.scrollTop > 0 && node.scrollHeight > node.clientHeight + 1;
	});
	expect(scrolls).toBe(true);

	await plan.getByRole('button', { name: 'See less' }).click();
	await expect(plan.locator('[data-slot="ticket-card"]').nth(1)).toBeHidden();
});

test('a tablet shows two columns', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await page.goto('/');

	const xs = await page
		.locator('[data-lane]')
		.evaluateAll((nodes) => [
			...new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().x)))
		]);
	expect(xs).toHaveLength(2);
});
