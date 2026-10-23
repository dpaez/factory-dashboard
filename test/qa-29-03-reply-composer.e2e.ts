import { expect, test, type Locator, type Page } from '@playwright/test';

import { ticketDetailAgentQuestion } from '../src/lib/factory/fixtures/tickets.ts';

// QA for ticket #29, task 03: ReplyComposer and its durable drafts, in Storybook.
test.describe.configure({ retries: 1 });
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const BAR = 'components-factory-replycomposer';
const QUESTION = ticketDetailAgentQuestion.attention[0]!;
const SEND = 'Send reply & resume';

type Preview = {
	__STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } };
	__STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void };
	__calls: unknown[][];
};

/** Open a story, wait for its play function to finish, and return its light and dark panes. */
const open = async (page: Page, slug: string) => {
	for (let attempt = 0; ; attempt++) {
		try {
			await page.goto(`${SB}/iframe.html?id=${BAR}--${slug}&viewMode=story&globals=theme:side-by-side`);
			break;
		} catch (e) {
			if (attempt >= 2 || !String(e).includes('ERR_ABORTED')) throw e;
		}
	}
	await expect
		.poll(
			() =>
				page
					.evaluate(() => (window as unknown as Preview).__STORYBOOK_PREVIEW__?.currentRender?.phase)
					.catch(() => undefined),
			{ timeout: 30_000 }
		)
		.toBe('finished');
	return page.locator('#storybook-root [data-theme-pane]');
};

/** Replace the story's onsubmit with a recorder into window.__calls. */
const recordSubmit = (page: Page, slug: string) =>
	page.evaluate((sid) => {
		const w = window as unknown as Preview;
		w.__calls = [];
		w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
			storyId: sid,
			updatedArgs: { onsubmit: (a: string) => w.__calls.push(['onsubmit', a]) }
		});
	}, `${BAR}--${slug}`);
const calls = async (page: Page) => {
	const list = await page.evaluate(() => (window as unknown as Preview).__calls);
	if (!list) throw new Error('the story reloaded and lost its recorders');
	return list;
};

const field = (pane: Locator) => pane.getByRole('textbox', { name: 'Your answer' });
const send = (pane: Locator) => pane.getByRole('button', { name: SEND });

test('AC1: the question and its context are visible above the answer field', async ({ page }) => {
	const panes = await open(page, 'with-task-context');
	for (const i of [0, 1]) {
		const pane = panes.nth(i);
		const question = pane.getByText(QUESTION.question);
		await expect(question).toBeVisible();
		await expect(pane.getByText('Task 03 · round 2')).toBeVisible();
		await expect(pane.getByText('Agent question')).toBeVisible();
		const q = (await question.boundingBox())!;
		const f = (await field(pane).boundingBox())!;
		expect(q.y + q.height).toBeLessThanOrEqual(f.y);
		await expect(field(pane)).toHaveAccessibleDescription(new RegExp(QUESTION.question.slice(0, 30)));
	}
	await shot(page, 'ac1-question-with-context');
});

test('AC2: a blank or whitespace-only answer cannot be sent', async ({ page }) => {
	const pane = (await open(page, 'empty')).first();
	await recordSubmit(page, 'empty');
	await field(pane).fill('');
	await expect(send(pane)).toBeDisabled();
	await field(pane).fill('   \n  ');
	await expect(send(pane)).toBeDisabled();
	await send(pane).click({ force: true });
	await field(pane).press('Control+Enter');
	await field(pane).press('Meta+Enter');
	await expect(pane.getByRole('alert')).toHaveText('Write an answer before sending.');
	await expect(field(pane)).toHaveAttribute('aria-invalid', 'true');
	expect(await calls(page)).toEqual([]);
	await shot(page, 'ac2-blank-answer-blocked');
	// Positive control: a real answer does reach onsubmit.
	await field(pane).fill('Use Cmd+Enter.');
	await send(pane).click();
	await expect.poll(() => calls(page)).toEqual([['onsubmit', 'Use Cmd+Enter.']]);
});

test('AC3: a rejected reply stays in the field, editable, with the explanation', async ({ page }) => {
	const pane = (await open(page, 'rejected-reply-stays-editable')).first();
	await field(pane).fill('My real answer.');
	await send(pane).click();
	// The story's parent rejects the send as a validation error.
	await expect(pane.getByTestId('reply-explanation')).toBeVisible();
	await expect(pane.getByTestId('reply-field-error')).toBeVisible();
	await expect(field(pane)).toHaveValue('My real answer.');
	await expect(field(pane)).toBeEditable();
	await field(pane).press('End');
	await field(pane).pressSequentially(' Edited.');
	await expect(field(pane)).toHaveValue('My real answer. Edited.');
	await expect(send(pane)).toBeEnabled();
	await shot(page, 'ac3-rejected-reply-editable');
});

test('AC4: a draft comes back after a remount; another question starts empty', async ({ page }) => {
	const pane = (await open(page, 'draft-restored-after-remount')).first();
	const toggle = (name: string) => pane.getByRole('button', { name }).click();
	await field(pane).fill('Draft written by QA.');
	await toggle('Unmount composer');
	await expect(pane.getByRole('textbox')).toHaveCount(0);
	await toggle('Mount composer');
	await expect(field(pane)).toHaveValue('Draft written by QA.');
	await toggle('Show another question');
	await expect(field(pane)).toHaveValue('');
	await toggle('Show the first question');
	await expect(field(pane)).toHaveValue('Draft written by QA.');
	await shot(page, 'ac4-draft-restored');
});

test('AC6: stale rejection and answered-elsewhere explain the conflict and keep the draft', async ({
	page
}) => {
	let pane = (await open(page, 'stale')).first();
	await expect(pane.getByText(/refused this reply because the ticket changed/)).toBeVisible();
	await expect(field(pane)).not.toHaveValue('');
	await expect(field(pane)).toBeEditable();
	await shot(page, 'ac6-stale-conflict');

	pane = (await open(page, 'answered-elsewhere')).first();
	await recordSubmit(page, 'answered-elsewhere');
	await expect(pane.getByText(/no longer open: it was answered or closed elsewhere/)).toBeVisible();
	await expect(field(pane)).not.toHaveValue('');
	await expect(send(pane)).toBeDisabled();
	await field(pane).press('Control+Enter');
	expect(await calls(page)).toEqual([]);
	await shot(page, 'ac6-answered-elsewhere');
});

const STATES = [
	'question-shown',
	'empty',
	'draft-present',
	'submitting',
	'accepted',
	'confirmed',
	'rejected-validation',
	'rejected-other',
	'stale',
	'answered-elsewhere',
	'unconfirmed',
	'no-agent-waiting',
	'read-only'
];

test('AC7: every listed state has a story rendering the composer in light and dark', async ({
	page
}) => {
	test.setTimeout(120_000);
	for (const slug of STATES) {
		const panes = await open(page, slug);
		await expect.soft(panes, slug).toHaveCount(2);
		await expect.soft(panes.nth(0), slug).toHaveAttribute('data-theme-pane', 'light');
		await expect.soft(panes.nth(1), slug).toHaveAttribute('data-theme-pane', 'dark');
		for (const i of [0, 1]) {
			await expect.soft(field(panes.nth(i)), `${slug} pane ${i}`).toBeVisible();
			await expect.soft(panes.nth(i).getByTestId('reply-question'), slug).toBeVisible();
		}
	}
	await open(page, 'no-agent-waiting');
	await shot(page, 'ac7-no-agent-waiting-light-dark');
});
