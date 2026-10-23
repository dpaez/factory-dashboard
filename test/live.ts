import { expect, type Page } from '@playwright/test';

/**
 * Open a dashboard page and wait until it is hydrated, its live stream is
 * open, and the refetch that every stream open triggers has answered. The
 * stream never ends, so `networkidle` never arrives on a dashboard page.
 */
export async function gotoLive(page: Page, url: string): Promise<void> {
	const refetch = page.waitForResponse((response) => response.url().includes('__data.json'));
	await page.goto(url);
	await expect(page.locator('header [data-slot="connection-status"]')).toHaveAttribute(
		'data-state',
		'live'
	);
	await refetch;
}
