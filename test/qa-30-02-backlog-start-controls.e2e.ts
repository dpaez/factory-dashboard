import { expect, test, type Page } from '@playwright/test';

// QA for ticket #30, task 02: Start on BacklogCard and IssuePreview, driven through Storybook.
const SB = 'http://localhost:6006';
const SHOTS =
	process.env.QA_SCREENSHOTS ??
	'/Users/deka/Projects/geut/factory-dashboard/.factory/tickets/dpaez-factory-dashboard-30-964882a5/qa/02/screenshots';
const shot = (page: Page, name: string) =>
	page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => undefined);
const story = (id: string, theme: string) =>
	`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;
const root = (page: Page) => page.locator('#storybook-root');
const CARD = 'components-factory-backlogcard';
const PREVIEW = 'components-factory-issuepreview';
const BOTH = [CARD, PREVIEW];

/** Open a story and wait until its own play function has finished. */
const open = async (page: Page, id: string, theme = 'light') => {
	// A cold Storybook may reload the iframe while it optimizes deps: let that settle first.
	await page.goto(story(id, theme)).catch(async (error: Error) => {
		if (!/ERR_ABORTED/.test(error.message)) throw error;
		await page.goto(story(id, theme));
	});
	await page.waitForLoadState('networkidle');
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

/** Replace callback args with recorders that push `[name, ...args]` into window.__calls. */
const record = async (page: Page, storyId: string, names: string[]) => {
	await page.evaluate(
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
	// Let the re-render with the recorders settle.
	await page.waitForTimeout(300);
};
class RecordersLost extends Error {}
/** The recorded calls; throws RecordersLost if the iframe reloaded and dropped the recorders. */
const calls = async (page: Page) => {
	const recorded = await page.evaluate(
		() => (window as unknown as { __calls?: unknown[][] }).__calls ?? null
	);
	if (recorded === null) throw new RecordersLost('The story iframe reloaded.');
	return recorded;
};

/**
 * Open a story, install recorders and run `act`. A cold Storybook dev server can
 * reload the iframe mid-test while it optimizes deps, dropping the recorders:
 * then start the interaction over, up to three times.
 */
const recorded = async (
	page: Page,
	id: string,
	names: string[],
	act: () => Promise<void>,
	theme = 'light'
) => {
	for (let attempt = 1; ; attempt++) {
		await open(page, id, theme);
		await record(page, id, names);
		try {
			await act();
			return;
		} catch (error) {
			if (!(error instanceof RecordersLost) || attempt === 3) throw error;
		}
	}
};

/** The Beacon Yellow token, resolved in the page. */
const primaryFill = (page: Page) =>
	page.evaluate(() => {
		const probe = document.createElement('div');
		probe.className = 'bg-primary';
		document.body.append(probe);
		const value = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return value;
	});

test('AC1: a ready card and its preview show an enabled Beacon Yellow Start that emits that card', async ({
	page
}) => {
	for (const component of BOTH) {
		const id = `${component}--start-eligible`;
		await recorded(page, id, ['onstart', 'onselect'], async () => {
			const start = root(page).getByRole('button', { name: 'Start', exact: true });
			await expect(start).toBeEnabled();
			const fill = await start.evaluate((el) => getComputedStyle(el).backgroundColor);
			expect(fill, component).toBe(await primaryFill(page));
			await start.click();
			const first = await calls(page);
			expect(
				first.map((c) => c[0]),
				component
			).toEqual(['onstart']);
			const emitted = first[0]![1] as { id: string; title: string };
			await expect(root(page)).toContainText(emitted.title);
			if (component === CARD) {
				// The card's own selection button still selects the same issue, and does not start.
				await root(page)
					.getByRole('button', { name: /factory-dashboard#/ })
					.click();
				const after = await calls(page);
				expect(after.map((c) => c[0])).toEqual(['onstart', 'onselect']);
				expect(after[1]![1]).toBe(emitted.id);
			}
		});
		await shot(page, `ac1-${component === CARD ? 'card' : 'preview'}-eligible`);
	}
});

test('AC2: blocked, umbrella and read-only Starts are disabled with a visible, described reason', async ({
	page
}) => {
	const reasons: Record<string, RegExp> = {
		blocked: /^Blocked by .+\. Start it once the blockers? closes?\.$/,
		umbrella: /^Umbrella issue: start its sub-issues instead\.$/,
		'read-only': /^Action access required/
	};
	for (const [slug, reason] of Object.entries(reasons)) {
		for (const component of BOTH) {
			await open(page, `${component}--start-${slug}`);
			const start = root(page).getByRole('button', { name: 'Start', exact: true });
			await expect.soft(start, `${component} ${slug}`).toBeDisabled();
			await expect.soft(start, `${component} ${slug}`).toHaveAccessibleDescription(reason);
			// The reason is visible text, not only an accessible description.
			await expect.soft(root(page).getByText(reason), `${component} ${slug}`).toBeVisible();
			if (component === CARD) await shot(page, `ac2-card-${slug}`);
		}
	}
});

test('AC3: while submitting, Starting… ignores repeated clicks and Enter', async ({ page }) => {
	for (const component of BOTH) {
		const id = `${component}--start-submitting`;
		await recorded(page, id, ['onstart'], async () => {
			const start = root(page).getByRole('button', { name: 'Starting…' });
			await expect(start).toBeVisible();
			await expect(start).toHaveAttribute('aria-busy', 'true');
			// aria-disabled keeps it focusable; force the clicks so they really reach the button.
			await start.click({ force: true });
			await start.dblclick({ force: true });
			await start.focus();
			await expect(start).toBeFocused();
			await page.keyboard.press('Enter');
			await page.keyboard.press('Enter');
			expect(await calls(page), component).toEqual([]);
		});
		if (component === CARD) await shot(page, 'ac3-card-submitting');
	}
});

test('AC4: while accepted, the card and preview show Start accepted and no running or stage state', async ({
	page
}) => {
	for (const component of BOTH) {
		const id = `${component}--start-accepted`;
		await recorded(page, id, ['onstart'], async () => {
			const accepted = root(page).getByRole('button', { name: 'Start accepted' });
			await expect(accepted).toBeVisible();
			await expect(root(page)).not.toContainText(
				/running|planning|in progress|\bplan\b|\bwork\b|\breview\b|\bqa\b/i
			);
			await accepted.click({ force: true });
			expect(await calls(page), component).toEqual([]);
		});
		await shot(page, `ac4-${component === CARD ? 'card' : 'preview'}-accepted`);
	}
});

test('AC5: a rejected start keeps the card with the reason inline; an unconfirmed start offers Resend', async ({
	page
}) => {
	const rejected: Record<string, string> = {
		'rejected-umbrella-issue': 'This is an umbrella issue; start one of its sub-issues.',
		'rejected-tracker-unavailable': 'The tracker could not be reached. Try again.',
		'rejected-conflict': 'Conflict: the factory cannot start this issue in its current state.'
	};
	for (const component of BOTH) {
		for (const [slug, message] of Object.entries(rejected)) {
			await open(page, `${component}--start-${slug}`);
			// The issue is still there, with the reason inline and Start usable again.
			await expect.soft(root(page).getByText(message), `${component} ${slug}`).toBeVisible();
			await expect
				.soft(
					root(page).getByRole('button', { name: 'Start', exact: true }),
					`${component} ${slug}`
				)
				.toBeEnabled();
			if (component === CARD) {
				await expect
					.soft(root(page).getByRole('button', { name: /factory-dashboard#/ }))
					.toBeVisible();
			}
		}
		if (component === CARD) await shot(page, 'ac5-card-rejected-conflict');

		const id = `${component}--start-unconfirmed`;
		await recorded(page, id, ['onstart', 'onresend'], async () => {
			await expect(root(page).getByText(/answer was lost/)).toBeVisible();
			await expect(root(page).getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
			await root(page).getByRole('button', { name: 'Resend' }).click();
			expect(
				(await calls(page)).map((c) => c[0]),
				component
			).toEqual(['onresend']);
		});
		await shot(page, `ac5-${component === CARD ? 'card' : 'preview'}-unconfirmed`);
	}
});

test('AC6: every start state renders in light and dark for the card and the preview', async ({
	page
}) => {
	const states = [
		'eligible',
		'blocked',
		'umbrella',
		'submitting',
		'accepted',
		'rejected-umbrella-issue',
		'rejected-tracker-unavailable',
		'rejected-conflict',
		'unconfirmed',
		'read-only'
	];
	for (const component of BOTH) {
		for (const slug of states) {
			await open(page, `${component}--start-${slug}`, 'side-by-side');
			const panes = page.locator('[data-theme-pane]');
			await expect.soft(panes, `${component} ${slug}`).toHaveCount(2);
			for (const pane of [panes.first(), panes.last()]) {
				await expect
					.soft(
						pane.getByRole('button', { name: /^(Start|Starting…|Start accepted|Resend)$/ }),
						`${component} ${slug}`
					)
					.toBeVisible();
			}
		}
	}
	await open(page, `${CARD}--start-rejected-conflict`, 'side-by-side');
	await shot(page, 'ac6-card-conflict-light-dark');
	await open(page, `${PREVIEW}--start-submitting`, 'side-by-side');
	await shot(page, 'ac6-preview-submitting-light-dark');
});
