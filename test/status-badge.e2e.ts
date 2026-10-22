import { expect, test, type Page } from '@playwright/test';
import { ticketDetailActiveInWork } from '../src/lib/factory/fixtures/tickets.ts';

// QA for ticket #19, task 02: StatusBadge and the status cells that delegate to it.
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const story = (id: string, theme: string) =>
	`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;
const BADGE = 'components-factory-statusbadge';
const badges = (page: Page) => page.locator('#storybook-root [data-signal]');

const EXECUTION: [string, string, string][] = [
	['queued', 'Queued', 'wait'],
	['active', 'Active', 'run'],
	['waiting-for-user', 'Waiting for user', 'wait'],
	['paused', 'Paused', 'standby'],
	['resuming', 'Resuming', 'run'],
	['resume-failed', 'Resume failed', 'fault'],
	['failed', 'Failed', 'fault'],
	['ready-for-handoff', 'Ready for handoff', 'wait'],
	['complete', 'Complete', 'clear'],
	['cancelled', 'Cancelled', 'standby']
];

test('AC1: each execution status has its own badge story showing its label and tone', async ({
	page
}) => {
	for (const [slug, label, signal] of EXECUTION) {
		await page.goto(story(`${BADGE}--${slug}`, 'light'));
		const badge = badges(page);
		await expect.soft(badge, slug).toHaveText(label);
		await expect.soft(badge, slug).toHaveAttribute('data-signal', signal);
	}
});

test('AC2: every task status × stage renders a labelled badge', async ({ page }) => {
	await page.goto(story(`${BADGE}--task-matrix`, 'light'));
	const statuses = ['Pending', 'Active', 'Blocked', 'Done', 'Cancelled'];
	const stages = ['plan', 'work', 'QA', 'review', 'wrapup'];
	const expected = statuses.flatMap((s) => [s, ...stages.map((st) => `${s} · ${st}`)]);
	await expect(badges(page)).toHaveCount(expected.length);
	await expect(badges(page)).toHaveText(expected, { useInnerText: true });
	await page.goto(story(`${BADGE}--task-matrix`, 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac2-task-matrix');
});

test('AC3: an unknown status renders a Standby badge with the raw value', async ({ page }) => {
	await page.goto(story(`${BADGE}--unknown-value`, 'light'));
	await expect(badges(page)).toHaveText('archived');
	await expect(badges(page)).toHaveAttribute('data-signal', 'standby');
	await page.goto(story('components-taskstable-statuscell--unknown-value', 'light'));
	await expect(badges(page)).toHaveText('archived');
	await expect(badges(page)).toHaveAttribute('data-signal', 'standby');
});

// Lightness of a computed color: oklch L directly, else relative luminance of rgb.
const lightness = (color: string): number => {
	const ok = color.match(/^oklch\(([\d.]+)(%?)/);
	if (ok) return Number(ok[1]) / (ok[2] ? 100 : 1);
	const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number);
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

test('AC4: badge colors come from --signal-* tokens with Two-Ink text, in light and dark', async ({
	page
}) => {
	for (const theme of ['light', 'dark'] as const) {
		await page.goto(story(`${BADGE}--all-signals`, theme));
		// The Storybook dev server can reload the iframe while it optimizes deps, and
		// the decorator applies the theme in an effect: measure once both settle.
		await page.waitForLoadState('networkidle');
		await expect(badges(page).first()).toBeVisible();
		await expect(page.locator('html')).toHaveClass(
			theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/
		);
		const rows = await badges(page).evaluateAll((els) =>
			els.map((el) => {
				const signal = el.getAttribute('data-signal')!;
				// Resolve the token the same way the browser resolves the badge's own colors.
				const probe = document.createElement('span');
				probe.style.backgroundColor = `var(--signal-${signal})`;
				probe.style.color = `var(--signal-${signal}-foreground)`;
				el.parentElement!.appendChild(probe);
				const want = getComputedStyle(probe);
				const got = getComputedStyle(el);
				const row = {
					label: el.textContent,
					signal,
					bg: got.backgroundColor,
					wantBg: want.backgroundColor,
					fg: got.color,
					wantFg: want.color
				};
				probe.remove();
				return row;
			})
		);
		expect(new Set(rows.map((r) => r.signal))).toEqual(
			new Set(['run', 'wait', 'standby', 'fault', 'clear'])
		);
		for (const r of rows) {
			const what = `${theme} ${r.label} (${r.signal})`;
			expect.soft(r.bg, `${what} background`).toBe(r.wantBg);
			expect.soft(r.fg, `${what} text`).toBe(r.wantFg);
			const darkInk = ['run', 'wait', 'standby'].includes(r.signal);
			if (darkInk) expect.soft(lightness(r.fg), `${what} dark ink`).toBeLessThan(0.3);
			else expect.soft(lightness(r.fg), `${what} light ink`).toBeGreaterThan(0.9);
		}
	}
	// Each theme's tokens differ, so equality in both themes means the theme's token is used.
	await page.goto(story(`${BADGE}--all-signals`, 'side-by-side'));
	await expect(page.locator('[data-theme-pane]')).toHaveCount(2);
	await shot(page, 'ac4-all-signals');
});

// AC7: the real detail page against the fake factory (Playwright's preview server).
// The fixture's tasks cover every API task status; the chip comes straight from `{status, stage}`.
const EXPECTED: Record<string, [string, string]> = {
	'01': ['Done', 'clear'],
	'02': ['Active · review', 'run'],
	'03': ['Pending', 'standby'],
	'04': ['Blocked · QA', 'fault'],
	'05': ['Cancelled · work', 'standby']
};

test('AC7: API task statuses render chips with correct tones on the ticket detail page', async ({
	page
}) => {
	await page.goto(`/tickets/${encodeURIComponent(ticketDetailActiveInWork.key)}`);
	expect(ticketDetailActiveInWork.tasks.map((task) => task.id)).toEqual(Object.keys(EXPECTED));
	for (const task of ticketDetailActiveInWork.tasks) {
		const [label, signal] = EXPECTED[task.id]!;
		const chip = page.locator(`[data-task="${task.id}"] [data-signal]`);
		await expect.soft(chip, task.status).toHaveText(label);
		await expect.soft(chip, task.status).toHaveAttribute('data-signal', signal);
	}
	await shot(page, 'ac7-ticket-detail-api-chips');
});
