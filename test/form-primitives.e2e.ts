import { expect, test, type Page } from '@playwright/test';

// QA for ticket #20, task 01: Input, Textarea and Label primitives in Storybook.
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const story = (id: string, theme = 'light') =>
	`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;
// storybook.e2e.ts runs build-storybook in parallel, which can abort a dev-server load.
const open = async (page: Page, url: string) => {
	for (let attempt = 0; ; attempt++) {
		try {
			return await page.goto(url);
		} catch (e) {
			if (attempt >= 2 || !String(e).includes('ERR_ABORTED')) throw e;
		}
	}
};

const FIELDS = [
	{ kind: 'input', label: 'Ticket title', error: 'Ticket title cannot be empty' },
	{ kind: 'textarea', label: 'Reply to the factory', error: 'Reply cannot be empty' }
] as const;
const STATES = ['default', 'focus', 'disabled', 'invalid'] as const;

const field = (page: Page, label: string) => page.getByRole('textbox', { name: label }).first();

test('AC3: Input and Textarea stories show a labelled field for default, focus, disabled and invalid', async ({
	page
}) => {
	const res = await page.request.get(`${SB}/index.json`);
	const { entries } = (await res.json()) as { entries: Record<string, { type: string }> };
	for (const { kind, label, error } of FIELDS) {
		for (const state of STATES) {
			const id = `ui-${kind}--${state}`;
			expect.soft(entries[id]?.type, `${id} exists`).toBe('story');
			await open(page, story(id, 'side-by-side'));
			await expect.soft(page.getByText(label, { exact: true }).first()).toBeVisible();
			await expect.soft(field(page, label)).toBeVisible();
			if (state === 'invalid') await expect.soft(page.getByText(error).first()).toBeVisible();
			await shot(page, `ac3-${kind}-${state}`);
		}
	}
});

for (const { kind, label, error } of FIELDS) {
	test(`AC4: ${kind} invalid story describes the field with its visible message`, async ({
		page
	}) => {
		await open(page, story(`ui-${kind}--invalid`));
		const f = field(page, label);
		const message = page.getByText(error);
		await expect(message).toBeVisible();
		await expect(f).toHaveAttribute('aria-invalid', 'true');
		const messageId = await message.getAttribute('id');
		expect(messageId).toBeTruthy();
		await expect(f).toHaveAttribute('aria-describedby', messageId!);
		await expect(f).toHaveAccessibleDescription(error);
	});

	test(`AC5: clicking the Label focuses the ${kind}`, async ({ page }) => {
		await open(page, story(`ui-${kind}--default`));
		const f = field(page, label);
		await expect(f).toBeVisible();
		await page.locator('body').click({ position: { x: 1, y: 1 } });
		await expect(f).not.toBeFocused();
		await page.getByText(label, { exact: true }).click();
		await expect(f).toBeFocused();
	});

	test(`AC6: Tab focuses the ${kind} with a visible focus ring`, async ({ page }) => {
		await open(page, story(`ui-${kind}--focus`));
		const f = field(page, label);
		// Let the story's own play function finish, then start from an unfocused field.
		await expect(f).toBeFocused();
		await page.locator('body').click({ position: { x: 1, y: 1 } });
		await expect(f).not.toBeFocused();
		const style = () =>
			f.evaluate((el) => {
				const s = getComputedStyle(el);
				return { border: s.borderColor, shadow: s.boxShadow };
			});
		const before = await style();
		await shot(page, `ac6-${kind}-unfocused`);

		await page.keyboard.press('Tab');
		await expect(f).toBeFocused();
		expect(await f.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
		await expect.poll(async () => (await style()).border).not.toBe(before.border);
		await expect.poll(async () => (await style()).shadow).not.toBe(before.shadow);
		await shot(page, `ac6-${kind}-focused`);
	});

	test(`AC7: the disabled ${kind} is disabled and skipped by Tab`, async ({ page }) => {
		await open(page, story(`ui-${kind}--disabled`));
		const f = field(page, label);
		await expect(f).toBeDisabled();
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await expect(f).not.toBeFocused();
	});
}
