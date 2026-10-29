import { expect, test } from './fixtures.ts';

// The Flow board fills the viewport. A long lane scrolls inside itself;
// the page does not.

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

	await page.getByRole('button', { name: 'Hide backlog' }).click();
	await expect(page.locator('[data-slot="backlog-lane"]')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Show backlog' })).toBeVisible();
	await page.getByRole('button', { name: 'Show backlog' }).click();
	await expect(page.locator('[data-slot="backlog-lane"]')).toBeVisible();
});
