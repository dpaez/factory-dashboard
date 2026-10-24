import { expect, test, type Page } from '@playwright/test';

// QA for ticket #30, task 04: the TicketComposer, driven through Storybook.
const SB = 'http://localhost:6006';
const SHOTS =
	process.env.QA_SCREENSHOTS ??
	'/Users/deka/Projects/geut/factory-dashboard/.factory/tickets/dpaez-factory-dashboard-30-964882a5/qa/04/screenshots';
const shot = (page: Page, name: string) =>
	page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => undefined);
const PREFIX = 'components-factory-ticketcomposer';
const story = (slug: string, theme: string) =>
	`${SB}/iframe.html?id=${PREFIX}--${slug}&viewMode=story&globals=theme:${theme}`;
const root = (page: Page) => page.locator('#storybook-root');

const REF = 'dpaez/factory-dashboard#30';
const ID = 'dark-mode-audit';
const BRIEF = 'Audit every story in dark mode and list contrast failures.';

/** Open a story and wait until its own play function has finished. */
const open = async (page: Page, slug: string, theme = 'light') => {
	await page.goto(story(slug, theme)).catch(async (error: Error) => {
		if (!/ERR_ABORTED/.test(error.message)) throw error;
		await page.goto(story(slug, theme));
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

/** Replace onsubmit with a recorder that pushes each payload into window.__sent. */
const record = async (page: Page, slug: string) => {
	await page.evaluate((id) => {
		const w = window as unknown as {
			__sent: unknown[];
			__STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void };
		};
		w.__sent = [];
		w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
			storyId: id,
			updatedArgs: { onsubmit: (input: unknown) => w.__sent.push(input) }
		});
	}, `${PREFIX}--${slug}`);
	await page.waitForTimeout(300);
};
class RecorderLost extends Error {}
/** The recorded payloads; throws RecorderLost if the iframe reloaded and dropped the recorder. */
const sent = async (page: Page) => {
	const list = await page.evaluate(
		() => (window as unknown as { __sent?: unknown[] }).__sent ?? null
	);
	if (list === null) throw new RecorderLost('The story iframe reloaded.');
	return list;
};
/** Open a story with a recorder and run `act`; start over if a cold Storybook reloads the iframe. */
const recorded = async (page: Page, slug: string, act: () => Promise<void>) => {
	for (let attempt = 1; ; attempt++) {
		await open(page, slug);
		await record(page, slug);
		try {
			return await act();
		} catch (error) {
			if (!(error instanceof RecorderLost) || attempt === 3) throw error;
		}
	}
};

const tab = (page: Page, name: string) => root(page).getByRole('tab', { name });
const refField = (page: Page) => root(page).getByRole('textbox', { name: 'Issue reference' });
const idField = (page: Page) => root(page).getByRole('textbox', { name: 'ID', exact: true });
const textField = (page: Page) => root(page).getByRole('textbox', { name: 'Brief', exact: true });
const startPlanning = (page: Page) => root(page).getByRole('button', { name: 'Start planning' });

test('AC1: issue mode sends exactly {ref}, brief mode exactly {id, text}', async ({ page }) => {
	await recorded(page, 'empty-issue-mode', async () => {
		// Fill both modes' drafts, then submit from each mode.
		await refField(page).fill(`  ${REF} `);
		await tab(page, 'Written brief').click();
		await idField(page).fill(ID);
		await textField(page).fill(BRIEF);
		await tab(page, 'Issue reference').click();
		await startPlanning(page).click();
		expect(await sent(page)).toStrictEqual([{ ref: REF }]);

		await tab(page, 'Written brief').click();
		await startPlanning(page).click();
		expect(await sent(page)).toStrictEqual([{ ref: REF }, { id: ID, text: BRIEF }]);
	});
	await shot(page, 'ac1-brief-mode-filled');
});

test('AC2: Start planning submits on click and Enter; Starting… ignores repeated submits', async ({
	page
}) => {
	await recorded(page, 'empty-issue-mode', async () => {
		await refField(page).fill(REF);
		await refField(page).press('Enter');
		expect(await sent(page)).toStrictEqual([{ ref: REF }]);
		await startPlanning(page).click();
		expect(await sent(page)).toStrictEqual([{ ref: REF }, { ref: REF }]);
	});

	await recorded(page, 'submitting', async () => {
		const starting = root(page).getByRole('button', { name: 'Starting…' });
		await expect(starting).toBeDisabled();
		await expect(starting).toHaveAttribute('aria-busy', 'true');
		await starting.click({ force: true });
		await starting.dblclick({ force: true });
		await idField(page).press('Enter');
		await idField(page).press('Enter');
		expect(await sent(page)).toStrictEqual([]);
	});
	await shot(page, 'ac2-submitting');
});

test('AC3: validation, umbrella, tracker and conflict errors sit next to their field', async ({
	page
}) => {
	const cases: [slug: string, field: (p: Page) => ReturnType<typeof refField>, RegExp][] = [
		['empty-brief-mode', idField, /Enter an ID\./],
		['empty-brief-mode', textField, /Write the brief\./],
		['server-validation-reference', refField, /./],
		['server-validation-id-and-brief', idField, /./],
		['server-validation-id-and-brief', textField, /./],
		['umbrella-issue', refField, /umbrella issue; start one of its sub-issues/],
		['tracker-unavailable', refField, /tracker could not be reached/],
		['conflict-reference', refField, /cannot start this issue/],
		['conflict-id', idField, /cannot start a ticket with this ID/]
	];
	for (const [slug, field, message] of cases) {
		if (slug === 'empty-brief-mode') {
			// Client validation: submitting empty required fields sends nothing.
			await recorded(page, slug, async () => {
				await startPlanning(page).click();
				expect.soft(await sent(page), slug).toStrictEqual([]);
			});
		} else await open(page, slug);
		const input = field(page);
		await expect.soft(input, slug).toHaveAttribute('aria-invalid', 'true');
		await expect.soft(input, slug).toHaveAccessibleDescription(message);
		// The message is visible text right after the field's hint, not only a description.
		const error = root(page).locator(`[id="${await input.getAttribute('id')}-error"]`);
		await expect.soft(error, slug).toBeVisible();
		await expect.soft(error, slug).toHaveText(message);
		if (slug === 'umbrella-issue' || slug === 'conflict-id' || slug === 'empty-brief-mode')
			await shot(page, `ac3-${slug === 'empty-brief-mode' ? 'client-validation' : slug}`);
	}
	// A conflict on the ID does not mark the brief.
	await open(page, 'conflict-id');
	await expect(textField(page)).not.toHaveAttribute('aria-invalid', 'true');
});

test('AC4: after a failure the reference, ID and brief are still in their fields', async ({
	page
}) => {
	// A real round trip: type a brief, submit, the factory rejects it with a conflict.
	await open(page, 'brief-kept-after-a-rejection');
	await idField(page).fill(ID);
	await textField(page).fill(BRIEF);
	await startPlanning(page).click();
	await expect(idField(page)).toHaveAttribute('aria-invalid', 'true');
	await expect(idField(page)).toHaveValue(ID);
	await expect(textField(page)).toHaveValue(BRIEF);
	await expect(startPlanning(page)).toBeEnabled();
	await shot(page, 'ac4-brief-kept-after-rejection');

	for (const slug of [
		'server-validation-reference',
		'umbrella-issue',
		'tracker-unavailable',
		'conflict-reference',
		'other-failure'
	]) {
		await open(page, slug);
		await expect.soft(refField(page), slug).toHaveValue(REF);
	}
	for (const slug of ['server-validation-id-and-brief', 'conflict-id', 'unconfirmed']) {
		await open(page, slug);
		await expect.soft(idField(page), slug).toHaveValue(ID);
		await expect.soft(textField(page), slug).toHaveValue(BRIEF);
	}
});

test('AC5: every composer state and error renders in light and dark', async ({ page }) => {
	const slugs = [
		'empty-issue-mode',
		'empty-brief-mode',
		'filled-issue-mode-sends-only-the-reference',
		'filled-brief-mode-sends-only-the-id-and-brief',
		'client-validation',
		'server-validation-reference',
		'server-validation-id-and-brief',
		'umbrella-issue',
		'tracker-unavailable',
		'conflict-reference',
		'conflict-id',
		'other-failure',
		'submitting',
		'accepted',
		'unconfirmed',
		'read-only'
	];
	const index = (await (await page.request.get(`${SB}/index.json`)).json()) as {
		entries: Record<string, { title: string }>;
	};
	const ids = Object.keys(index.entries).filter((id) => id.startsWith(`${PREFIX}--`));
	for (const slug of slugs) expect.soft(ids, slug).toContain(`${PREFIX}--${slug}`);

	for (const slug of slugs) {
		await open(page, slug, 'side-by-side');
		const panes = page.locator('[data-theme-pane]');
		await expect.soft(panes, slug).toHaveCount(2);
		for (const pane of [panes.first(), panes.last()]) {
			await expect.soft(pane.getByRole('tab', { name: 'Issue reference' }), slug).toBeVisible();
			await expect
				.soft(pane.getByRole('button', { name: /^(Start planning|Starting…|Resend)$/ }), slug)
				.toBeVisible();
		}
	}
	await open(page, 'tracker-unavailable', 'side-by-side');
	await shot(page, 'ac5-tracker-unavailable-light-dark');
	await open(page, 'unconfirmed', 'side-by-side');
	await shot(page, 'ac5-unconfirmed-light-dark');
	await open(page, 'read-only', 'dark');
	await shot(page, 'ac5-read-only-dark');
});
