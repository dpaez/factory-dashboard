import { expect, test } from '@playwright/test';

test('home', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('FD')).toBeVisible();
  // expect to see a nav element with a link to the main page and Tickets
  await expect(page.getByRole('navigation')).toContainText('Main');
  await expect(page.getByRole('navigation')).toContainText('Tickets');
});