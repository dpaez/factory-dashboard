import type { Locator, Page } from '@playwright/test';

import {
	ticketDetailActiveInQa,
	ticketDetailAgentQuestion,
	ticketDetailCancelled,
	ticketDetailComplete,
	feedbackRoundOne,
	feedbackRoundTwo,
	ticketDetailFailed,
	ticketDetailFeedbackRound,
	ticketDetailFeedbackRoundMergedPr,
	ticketDetailManualApproval,
	ticketDetailMultiExecution,
	ticketDetailPaused,
	ticketDetailReadyForHandoff,
	ticketDetailReadyForHandoffAfterRound,
	ticketDetailTwoFeedbackRounds
} from '../src/lib/factory/fixtures/tickets.ts';
import { pendingFeedback } from '../src/lib/factory/fixtures/feedback.ts';
import { problemCodeHostUnavailable } from '../src/lib/factory/fixtures/problems.ts';
import type { FakeCommandRequest, FakeFactoryOptions } from './fake-factory.ts';
import { expect, gotoLive, test, type FakeFixture } from './fixtures.ts';

// The Inspector's commands from both placements, the board (`/?ticket=`) and
// the ticket page, through the built app's /api/factory/commands/* to the fake
// factory. Also the shell's empty command feedback region. The endpoint's
// status codes and bodies are proved by
// src/routes/api/factory/commands/[command]/server.test.ts and api-endpoints.e2e.ts.

const PAUSED = ticketDetailPaused.key;
const FAILED = ticketDetailFailed.key;
const HANDOFF = ticketDetailReadyForHandoff.key;
const QUESTION = ticketDetailAgentQuestion.key;
const MULTI = ticketDetailMultiExecution.key;
const READ_ONLY = "Action access required: this dashboard's token cannot send commands.";
const ACTIONS = ['Cancel execution', 'Retry', 'Stop agent', 'Rerun', 'Mark complete'];

type Placement = { name: string; url: (key: string, query?: string) => string };
const PLACEMENTS: Placement[] = [
	{ name: 'ticket page', url: (key, query = '') => `/tickets/${key}${query && `?${query}`}` },
	{ name: 'board inspector', url: (key, query = '') => `/?ticket=${key}${query && `&${query}`}` }
];
const slug = (placement: Placement) => placement.name.replace(' ', '-');

const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const region = (page: Page) => inspector(page).locator('[data-slot="ticket-commands"]');
const bar = (page: Page) => region(page).locator('[data-slot="ticket-actions"]');
const action = (page: Page, name: string) => bar(page).getByRole('button', { name, exact: true });
const composer = (page: Page) => region(page).locator('[data-slot="reply-composer"]');

/**
 * Every browser request goes to the app's own origin, every POST to
 * `/api/factory/commands/*`, and neither a request nor a command answer names
 * the token or the factory's address. Returns the problems seen and every
 * command answer body the browser read.
 */
function guard(page: Page, origin: string, fake: FakeFixture) {
	const problems: string[] = [];
	const answers: unknown[] = [];
	const host = new URL(fake.url).host;
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.origin !== origin) problems.push(`off-origin ${request.url()}`);
		if (request.method() === 'POST' && !url.pathname.startsWith('/api/factory/commands/')) {
			problems.push(`POST ${url.pathname}`);
		}
		if (JSON.stringify(request.headers()).includes(fake.token)) {
			problems.push(`token in request ${url.pathname}`);
		}
	});
	page.on('response', async (response) => {
		const url = new URL(response.url());
		if (!url.pathname.startsWith('/api/factory/commands/')) return;
		const text = await response.text().catch(() => '');
		for (const leak of [fake.token, host, 'Bearer', '/v1/']) {
			if (text.includes(leak)) problems.push(`${url.pathname} answer leaks ${leak}`);
		}
		answers.push(JSON.parse(text));
	});
	return { problems, answers };
}

/** Wait for the fake to have received `count` more commands than `before`, and return them. */
async function received(fake: FakeFixture, before: number, count = 1) {
	await expect.poll(() => fake.commands().length).toBe(before + count);
	return fake.commands().slice(before) as FakeCommandRequest[];
}

const confirmed = (control: Locator) => expect(control).toBeEnabled({ timeout: 15_000 });

test.describe('from both placements', () => {
	for (const placement of PLACEMENTS) {
		test(`${placement.name}: retry, rerun and complete each post their command once`, async ({
			page,
			app,
			fake,
			shot
		}) => {
			const { problems } = guard(page, app.url, fake);

			await gotoLive(page, placement.url(FAILED));
			await expect(region(page)).toBeVisible();
			for (const [label, path] of [
				['Retry', `/v1/tickets/${FAILED}/retries`],
				['Rerun', `/v1/tickets/${FAILED}/reruns`]
			] as const) {
				const before = fake.commands().length;
				await action(page, label).click();
				const [sent] = await received(fake, before);
				expect(sent).toMatchObject({ method: 'POST', path });
				expect(sent!.body).toBeUndefined();
				expect(sent!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
				await confirmed(action(page, label));
				expect(fake.commands()).toHaveLength(before + 1);
			}

			await gotoLive(page, placement.url(HANDOFF));
			const before = fake.commands().length;
			await action(page, 'Mark complete').click();
			const [sent] = await received(fake, before);
			expect(sent).toMatchObject({ path: `/v1/tickets/${HANDOFF}/complete` });
			expect(sent!.body).toBeUndefined();
			await confirmed(action(page, 'Mark complete'));
			expect(fake.commands()).toHaveLength(before + 1);
			await shot(`commands-${slug(placement)}`);
			expect(problems).toEqual([]);
		});

		test(`${placement.name}: Keep execution and Escape send nothing; Cancel execution posts cancel`, async ({
			page,
			app,
			fake,
			shot
		}) => {
			const { problems } = guard(page, app.url, fake);
			await gotoLive(page, placement.url(PAUSED));
			const dialog = page.getByRole('alertdialog');

			await action(page, 'Cancel execution').click();
			await expect(dialog).toContainText('The worktree, branch and pull request are kept.');
			await shot(`commands-cancel-dialog-${slug(placement)}`);
			await dialog.getByRole('button', { name: 'Keep execution' }).click();
			await expect(dialog).toBeHidden();
			await action(page, 'Cancel execution').click();
			await expect(dialog).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();
			await page.waitForTimeout(300);
			expect(fake.commands()).toEqual([]);

			await action(page, 'Cancel execution').click();
			await dialog.getByRole('button', { name: 'Cancel execution' }).click();
			const [sent] = await received(fake, 0);
			expect(sent).toMatchObject({ path: `/v1/tickets/${PAUSED}/cancel` });
			expect(sent!.body).toBeUndefined();
			// The dialog closes once the cancel is confirmed.
			await expect(dialog).toBeHidden({ timeout: 15_000 });
			expect(fake.commands()).toHaveLength(1);
			expect(problems).toEqual([]);
		});

		test(`${placement.name}: Stop with several runs posts the chosen run`, async ({
			page,
			app,
			fake
		}) => {
			const { problems } = guard(page, app.url, fake);
			await gotoLive(page, placement.url(PAUSED));
			const stop = action(page, 'Stop agent');
			await expect(stop).toBeDisabled();
			await expect(bar(page).locator('[data-reason="stop"]')).toHaveText(
				'Choose which run to stop.'
			);
			await bar(page).locator('input[type="radio"][value="run_work_running"]').check();
			await expect(stop).toBeEnabled();
			await stop.click();
			const [sent] = await received(fake, 0);
			expect(sent).toMatchObject({ path: '/v1/runs/run_work_running/stop' });
			expect(sent!.body).toBeUndefined();
			await page.waitForTimeout(300);
			expect(fake.commands()).toHaveLength(1);
			expect(problems).toEqual([]);
		});

		test(`${placement.name}: a reply draft survives reload and navigation; the reply posts once and clears it`, async ({
			page,
			app,
			fake,
			shot
		}) => {
			const { problems } = guard(page, app.url, fake);
			await gotoLive(page, placement.url(QUESTION));
			const field = composer(page).getByLabel('Your answer');
			const send = composer(page).getByRole('button', { name: 'Send reply & resume' });

			// An empty reply posts nothing.
			await expect(send).toBeDisabled();
			await field.focus();
			await page.keyboard.press('Control+Enter');
			await expect(composer(page).getByTestId('reply-blank')).toBeVisible();

			const answer = `Answered from the ${placement.name}.`;
			await field.fill(answer);
			// The draft survives a reload, and a navigation away and back.
			await page.reload();
			await expect(field).toHaveValue(answer);
			await gotoLive(page, '/tickets');
			await page.goBack();
			await expect(field).toHaveValue(answer);
			expect(fake.commands()).toEqual([]);

			await send.click();
			const [sent] = await received(fake, 0);
			expect(sent).toMatchObject({ path: `/v1/tickets/${QUESTION}/replies`, body: { answer } });
			await expect(composer(page).getByTestId('reply-confirmed')).toBeVisible({ timeout: 15_000 });
			await expect(field).toHaveValue('');
			await shot(`commands-reply-cleared-${slug(placement)}`);
			// Cleared for good: a reload does not bring it back.
			await gotoLive(page, placement.url(QUESTION));
			await expect(field).toHaveValue('');
			expect(fake.commands()).toHaveLength(1);
			expect(problems).toEqual([]);
		});

		test(`${placement.name}: a past execution shows no command controls`, async ({ page }) => {
			await gotoLive(page, placement.url(MULTI));
			await expect(action(page, 'Cancel execution')).toBeVisible();

			await gotoLive(page, placement.url(MULTI, 'execution=1'));
			await expect(inspector(page)).toHaveAttribute('data-execution', '1');
			await expect(page.getByTestId('past-execution')).toBeVisible();
			await expect(region(page)).toHaveCount(0);
			for (const name of ACTIONS) {
				await expect(inspector(page).getByRole('button', { name, exact: true })).toHaveCount(0);
			}
			await expect(page.locator('[data-slot="ticket-actions"]')).toHaveCount(0);
			await expect(page.locator('[data-slot="reply-composer"]')).toHaveCount(0);
			await expect(inspector(page).getByRole('textbox', { name: 'Your answer' })).toHaveCount(0);
		});
	}
});

test.describe('the reread after a command', () => {
	// A retry makes the ticket active, so Retry disappears once the change is reread.
	test.use({
		fakeOptions: { commandEffects: { retry: { status: 'active', statusReason: null } } }
	});

	for (const [placement, key] of [
		[PLACEMENTS[0]!, FAILED],
		[PLACEMENTS[1]!, PAUSED]
	] as const) {
		test(`${placement.name}: Retry disappears after the retry is confirmed`, async ({
			page,
			fake
		}) => {
			await gotoLive(page, placement.url(key));
			await action(page, 'Retry').click();
			await received(fake, 0);
			await expect(action(page, 'Retry')).toHaveCount(0, { timeout: 15_000 });
		});
	}
});

test.describe('read-only access', () => {
	test.use({ fakeOptions: { canAct: false } });

	for (const placement of PLACEMENTS) {
		test(`${placement.name}: after a 403 every action is disabled with the access explanation, and nothing leaks`, async ({
			page,
			app,
			fake,
			shot
		}) => {
			const { problems, answers } = guard(page, app.url, fake);
			await gotoLive(page, placement.url(PAUSED));
			const before = await page.content();
			await action(page, 'Retry').click();
			await received(fake, 0);

			await expect(bar(page).getByTestId('access-explanation')).toHaveText(READ_ONLY);
			for (const label of ['Stop agent', 'Retry', 'Cancel execution']) {
				await expect(action(page, label)).toBeDisabled();
				await expect(action(page, label)).toHaveAccessibleDescription(
					new RegExp(READ_ONLY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
				);
			}
			await shot(`commands-read-only-${slug(placement)}`);

			// The browser sees the dashboard's normalized failure, not the upstream problem body.
			expect(answers).toHaveLength(1);
			const body = answers[0] as { ok: boolean; failure: Record<string, unknown> };
			expect(Object.keys(body).sort()).toEqual(['failure', 'ok']);
			expect(body).toMatchObject({ ok: false, failure: { type: 'insufficient_scope' } });
			for (const key of Object.keys(body.failure)) {
				expect(['type', 'title', 'detail', 'fieldErrors', 'retryable']).toContain(key);
			}
			for (const text of [before, await page.content()]) {
				expect(text).not.toContain(fake.token);
				expect(text).not.toContain(new URL(fake.url).host);
			}
			expect(problems).toEqual([]);
		});
	}
});

test.describe('a reply confirmed while the operator is elsewhere', () => {
	// The reply stays pending for a while, and the factory then closes the question.
	const answered = ticketDetailAgentQuestion.attention.map((item) =>
		item.status === 'open' ? { ...item, status: 'resolved' as const } : item
	);
	const options: FakeFactoryOptions = {
		commandDelayMs: 1_500,
		commandEffects: {
			reply: { status: 'active', statusReason: null, needsUser: false, attention: answered }
		}
	};
	test.use({ fakeOptions: options });
	const QUESTION_ID = ticketDetailAgentQuestion.attention.find(
		(item) => item.status === 'open'
	)!.id;
	const storageKey = `reply:${QUESTION}:${ticketDetailAgentQuestion.execution}:${QUESTION_ID}`;
	const stored = (page: Page) => page.evaluate((key) => sessionStorage.getItem(key), storageKey);

	for (const placement of PLACEMENTS) {
		test(`${placement.name}: navigating away while pending still clears the draft`, async ({
			page,
			app,
			fake
		}) => {
			const { problems } = guard(page, app.url, fake);
			await gotoLive(page, placement.url(QUESTION));
			const answer = `Answered from the ${placement.name}, then left.`;
			await composer(page).getByLabel('Your answer').fill(answer);
			expect(await stored(page)).toBe(answer);

			await composer(page).getByRole('button', { name: 'Send reply & resume' }).click();
			await expect(composer(page)).toHaveAttribute('data-phase', 'submitting');
			// Leave in the same session: the coordinator lives on, the Inspector does not.
			await page.getByRole('link', { name: 'Tickets', exact: true }).click();
			await expect(page).toHaveURL('/tickets');
			await expect(inspector(page)).toHaveCount(0);

			const [sent] = await received(fake, 0);
			expect(sent).toMatchObject({ path: `/v1/tickets/${QUESTION}/replies`, body: { answer } });
			await expect(page.locator('[data-slot="command-feedback"] [aria-live="polite"]')).toHaveText(
				'Reply: The factory recorded it.',
				{ timeout: 15_000 }
			);
			expect(await stored(page)).toBeNull();

			// Back on the ticket: the question is closed and no draft comes back.
			await page.goBack();
			await expect(inspector(page)).toHaveAttribute('data-ticket-key', QUESTION);
			await expect(composer(page)).toHaveCount(0);
			expect(await stored(page)).toBeNull();
			await page.reload();
			expect(await stored(page)).toBeNull();
			expect(fake.commands()).toHaveLength(1);
			expect(problems).toEqual([]);
		});
	}
});

test('every page renders one empty command feedback region below the header, with no console errors', async ({
	page,
	shot
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`);
	});
	for (const path of ['/', '/tickets', `/tickets/${ticketDetailActiveInQa.key}`]) {
		await page.goto(path);
		await expect(page.getByRole('banner')).toBeVisible();
		const feedback = page.locator('[data-slot="command-feedback"]');
		await expect(feedback).toHaveCount(1);
		await expect(feedback).toHaveAttribute('data-empty', 'true');
		await expect(feedback.locator('[aria-live="polite"]')).toHaveCount(1);
		await expect(feedback.locator('[aria-live="polite"]')).toHaveText('');
		await expect(page.locator('[aria-live="polite"][role="status"]')).toHaveCount(1);
		await expect(feedback.locator('[data-slot="command-intent"]')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Retry delivery' })).toHaveCount(0);
		// Below the header, and nothing visible takes space when empty.
		const box = await feedback.boundingBox();
		const header = await page.locator('header').boundingBox();
		expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
		expect(box!.height).toBe(0);
		await shot(`command-feedback-empty-${path.split('/')[1] || 'root'}`);
	}
	expect(errors).toEqual([]);
});

test.describe('Feedback round', () => {
	const NOTE_LABEL = 'Note for the round (optional)';
	const box = (page: Page) => region(page).locator('[data-slot="feedback-rounds"]');
	const note = (page: Page) => box(page).getByRole('textbox', { name: NOTE_LABEL });
	const round = (page: Page) => box(page).getByTestId('feedback-start');
	const ROUND_PATH = `/v1/tickets/${HANDOFF}/feedback-rounds`;
	const lifecycle = (page: Page) =>
		inspector(page).getByTestId('timeline').getByRole('progressbar');
	/** The lifecycle bar's value read once, without retrying, so a bar still animating up from Plan fails. */
	const lifecycleNow = (page: Page) => lifecycle(page).getAttribute('aria-valuenow');
	const banner = (page: Page) => inspector(page).getByTestId('feedback-round');
	/** How many times the fake answered the handoff ticket's detail. */
	const detailReads = (fake: FakeFixture) =>
		fake
			.requests()
			.filter((r) => r.method === 'GET' && r.path.split('?')[0] === `/v1/tickets/${HANDOFF}`)
			.length;

	for (const placement of PLACEMENTS) {
		test(`${placement.name}: a round posts with no note, then with the typed note`, async ({
			page,
			app,
			fake,
			shot
		}) => {
			const { problems } = guard(page, app.url, fake);
			await gotoLive(page, placement.url(HANDOFF));
			await expect(round(page)).toBeEnabled();
			await expect(note(page)).toBeEditable();
			await expect(note(page)).toHaveValue('');
			// Wrapup is step 5 of 6 from the first render, not a bar animating up from Plan.
			expect(await lifecycleNow(page)).toBe(String(Math.round((5 / 6) * 100)));
			await expect(lifecycle(page)).toHaveAccessibleName('Lifecycle: wrapup');
			await expect(banner(page)).toHaveCount(0);
			await shot(`ac1-feedback-round-enabled-${slug(placement)}`);

			await round(page).click();
			const [bare] = await received(fake, 0);
			expect(bare).toMatchObject({ method: 'POST', path: ROUND_PATH });
			expect(bare!.body).toBeUndefined();
			await confirmed(round(page));

			await note(page).fill('Address the naming comments.');
			await round(page).click();
			const [noted] = await received(fake, 1);
			expect(noted).toMatchObject({
				path: ROUND_PATH,
				body: { note: 'Address the naming comments.' }
			});
			await confirmed(round(page));
			expect(fake.commands()).toHaveLength(2);
			expect(problems).toEqual([]);
		});
	}

	test('in QA with an open pull request: the round is disabled with its reason and a click sends nothing', async ({
		page,
		fake,
		shot
	}) => {
		await gotoLive(page, PLACEMENTS[0]!.url(ticketDetailActiveInQa.key));
		await expect(round(page)).toBeDisabled();
		await expect(box(page).locator('[data-reason="feedback"]')).toHaveText(
			'A feedback round starts at handoff, while its pull request is open.'
		);
		await round(page).click({ force: true });
		await page.waitForTimeout(500);
		expect(fake.commands()).toHaveLength(0);
		await shot('f1-feedback-round-disabled-in-qa');
	});

	for (const [label, key] of [
		['in work', PAUSED],
		['in wrapup before handoff', ticketDetailManualApproval.key]
	] as const) {
		test(`${label} without a pull request: there is no Feedback rounds box`, async ({ page }) => {
			await gotoLive(page, PLACEMENTS[0]!.url(key));
			await expect(region(page)).toBeVisible();
			await expect(box(page)).toHaveCount(0);
			await expect(bar(page).getByRole('button', { name: /feedback round/i })).toHaveCount(0);
		});
	}

	test.describe('while the round is pending', () => {
		test.use({ fakeOptions: { commandDelayMs: 1_500 } });

		test('the action is disabled with the pending reason and a second click sends nothing', async ({
			page,
			fake,
			shot
		}) => {
			await gotoLive(page, PLACEMENTS[0]!.url(HANDOFF));
			await round(page).click();
			await expect(round(page)).toBeDisabled();
			await expect(box(page).locator('[data-reason="feedback"]')).toHaveText(
				/Sending…|Accepted, waiting for the factory\./
			);
			await shot('ac6-feedback-round-pending');
			await round(page).click({ force: true });
			await received(fake, 0);
			await confirmed(round(page));
			expect(fake.commands()).toHaveLength(1);
		});
	});

	test.describe('a 409 refusal', () => {
		const detail =
			'No new feedback on https://github.com/dpaez/factory-dashboard/pull/42 since the last push (2 skipped: outdated). Add a note to start a round anyway.';
		test.use({
			fakeOptions: {
				failCommand: {
					commands: ['feedback'],
					problem: { status: 409, title: 'Invalid state', type: 'invalid_state', detail }
				}
			}
		});

		for (const placement of PLACEMENTS) {
			test(`${placement.name}: shows the factory's message verbatim, keeps the note and rereads the ticket`, async ({
				page,
				fake,
				shot
			}) => {
				await gotoLive(page, placement.url(HANDOFF));
				await note(page).fill('Look again.');
				const reads = detailReads(fake);
				await round(page).click();
				await received(fake, 0);
				await expect(box(page).locator('[data-failure="feedback"]')).toHaveText(detail, {
					timeout: 15_000
				});
				await expect(note(page)).toHaveValue('Look again.');
				await expect.poll(() => detailReads(fake)).toBeGreaterThan(reads);
				await shot(`ac7-feedback-round-refused-${slug(placement)}`);
			});
		}
	});

	test.describe('a 502 code host refusal', () => {
		test.use({
			fakeOptions: {
				failCommand: { commands: ['feedback'], problem: problemCodeHostUnavailable }
			}
		});

		for (const placement of PLACEMENTS) {
			test(`${placement.name}: says the code host could not be read, with its detail, and rereads the ticket`, async ({
				page,
				fake,
				shot
			}) => {
				await gotoLive(page, placement.url(HANDOFF));
				const reads = detailReads(fake);
				await round(page).click();
				await received(fake, 0);
				const failure = box(page).locator('[data-failure="feedback"]');
				await expect(failure).toContainText('Code host unavailable', { timeout: 15_000 });
				await expect(failure).toContainText(problemCodeHostUnavailable.detail);
				await expect.poll(() => detailReads(fake)).toBeGreaterThan(reads);
				await shot(`ac8-feedback-round-code-host-${slug(placement)}`);
			});
		}
	});

	test.describe('an accepted round', () => {
		const { stage, status, needsUser, progress, tasks } = ticketDetailFeedbackRound;
		test.use({
			fakeOptions: { commandEffects: { feedback: { stage, status, needsUser, progress, tasks } } }
		});

		for (const placement of PLACEMENTS) {
			test(`${placement.name}: the ticket reads as in work, with Feedback round 1 after the planned tasks`, async ({
				page,
				fake,
				shot
			}) => {
				await gotoLive(page, placement.url(HANDOFF));
				await round(page).click();
				await received(fake, 0);
				await expect(inspector(page).getByTestId('stage')).toHaveText('work', { timeout: 15_000 });
				// Back in work, the round waits for the next handoff: the box shows
				// round 1 read-only, with no start control.
				await expect(box(page).getByTestId('earlier-rounds')).toBeVisible();
				await expect(round(page)).toHaveCount(0);
				await expect(box(page).locator('[data-reason="feedback"]')).toHaveText(
					'A feedback round starts at handoff, while its pull request is open.'
				);
				const rows = inspector(page).getByTestId('tasks').locator('[data-task]');
				await expect(rows).toHaveCount(3);
				await expect(rows.last()).toHaveAttribute('data-task', 'F1');
				await expect(rows.last()).toContainText('Feedback round 1');
				await expect(rows.last()).not.toContainText('03.');
				await expect(rows.first()).toContainText('01. Color tokens');
				// Back to work, the bar jumps to step 2 of 6 at once.
				expect(await lifecycleNow(page)).toBe(String(Math.round((2 / 6) * 100)));
				await expect(lifecycle(page)).toHaveAccessibleName('Lifecycle: work');
				await expect(banner(page)).toBeVisible();
				await expect(banner(page)).toHaveAttribute('data-round', '1');
				await expect(banner(page)).toContainText('Feedback round 1');
				await expect(banner(page)).toContainText('Addressing review feedback on PR #');
				await banner(page).scrollIntoViewIfNeeded();
				await expect(banner(page)).toBeInViewport();
				await shot(`ac9-feedback-round-in-work-${slug(placement)}`);
			});
		}
	});
});

test.describe('Feedback rounds box: the pending comments', () => {
	const box = (page: Page) => region(page).locator('[data-slot="feedback-rounds"]');
	const list = (page: Page) => box(page).getByTestId('pending-feedback-list');
	const rows = (page: Page) => list(page).getByRole('listitem');
	const start = (page: Page) => box(page).getByTestId('feedback-start');
	const note = (page: Page) =>
		box(page).getByRole('textbox', { name: 'Note for the round (optional)' });
	const count = (page: Page) => box(page).getByTestId('feedback-count');
	const position = (page: Page) => box(page).getByTestId('feedback-position');
	const pager = (page: Page) => box(page).getByRole('group', { name: 'Pending comments pages' });
	const ROUND_PATH = `/v1/tickets/${HANDOFF}/feedback-rounds`;
	const feedbackReads = (fake: FakeFixture, key = HANDOFF) =>
		fake
			.requests()
			.filter((r) => r.method === 'GET' && r.path.split('?')[0] === `/v1/tickets/${key}/feedback`)
			.length;
	const detailReads = (fake: FakeFixture) =>
		fake
			.requests()
			.filter((r) => r.method === 'GET' && r.path.split('?')[0] === `/v1/tickets/${HANDOFF}`)
			.length;
	const [thread, review, comment] = pendingFeedback.candidates;

	for (const placement of PLACEMENTS) {
		test(`${placement.name}: lists each pending comment with a checkbox, kind, author, location, summary, ref and link`, async ({
			page,
			shot
		}) => {
			await gotoLive(page, placement.url(HANDOFF));
			await expect(box(page)).toBeVisible();
			await expect(box(page).getByRole('heading', { name: 'Feedback rounds' })).toBeVisible();
			await expect(bar(page).getByRole('button', { name: /feedback round/i })).toHaveCount(0);
			await expect(rows(page)).toHaveCount(3);

			const first = rows(page).nth(0);
			await expect(first.getByRole('checkbox')).toBeChecked();
			await expect(first).toContainText('Review thread');
			await expect(first).toContainText(thread!.author);
			await expect(first.getByTestId('location')).toHaveText(thread!.location!);
			await expect(first).toContainText(thread!.summary);
			await expect(first).toContainText(thread!.ref);
			await expect(
				first.getByRole('link', { name: `Open ${thread!.ref} on GitHub` })
			).toHaveAttribute('href', thread!.url!);
			for (const [index, item, kind] of [
				[1, review!, 'Review'],
				[2, comment!, 'Comment']
			] as const) {
				const row = rows(page).nth(index);
				await expect(row.getByRole('checkbox')).toBeChecked();
				await expect(row).toContainText(kind);
				await expect(row).toContainText(item.author);
				await expect(row).toContainText(item.summary);
				await expect(row).toContainText(item.ref);
				await expect(row.getByTestId('location')).toHaveCount(0);
				await expect(row.getByRole('link')).toHaveAttribute('href', item.url!);
			}
			await expect(start(page)).toHaveText('Start round with 3 comments');
			await shot(`ac2-pending-comments-${slug(placement)}`);
		});
	}

	test('starting with every comment ticked posts no only; with some unticked it posts exactly the ticked refs and the note', async ({
		page,
		fake
	}) => {
		await gotoLive(page, PLACEMENTS[0]!.url(HANDOFF));
		await expect(start(page)).toHaveText('Start round with 3 comments');
		await start(page).click();
		const [all] = await received(fake, 0);
		expect(all).toMatchObject({ path: ROUND_PATH });
		expect(all!.body).toBeUndefined();
		await confirmed(start(page));

		await rows(page).nth(1).getByRole('checkbox').uncheck();
		await expect(start(page)).toHaveText('Start round with 2 comments');
		await note(page).fill('Only the thread and the comment.');
		await start(page).click();
		const [some] = await received(fake, 1);
		expect(some).toMatchObject({ path: ROUND_PATH });
		expect(some!.body).toEqual({
			only: [thread!.ref, comment!.ref],
			note: 'Only the thread and the comment.'
		});
		await confirmed(start(page));
		expect(fake.commands()).toHaveLength(2);
	});

	test('Refresh rereads the pending list', async ({ page, fake }) => {
		await gotoLive(page, PLACEMENTS[0]!.url(HANDOFF));
		await expect(rows(page)).toHaveCount(3);
		const reads = feedbackReads(fake);
		await box(page).getByRole('button', { name: 'Refresh' }).click();
		await expect.poll(() => feedbackReads(fake)).toBe(reads + 1);
		await expect(rows(page)).toHaveCount(3);
	});

	test.describe('thirty comments', () => {
		test.use({ fakeOptions: { pendingFeedbackCohort: 'many' } });

		test('5 per page over 6 pages, a fixed height, ticks kept across pages, select all and none on every page', async ({
			page,
			fake,
			shot
		}) => {
			await gotoLive(page, PLACEMENTS[1]!.url(HANDOFF));
			await expect(rows(page)).toHaveCount(5);
			await expect(position(page)).toHaveText('1–5 of 30');
			await expect(count(page)).toHaveText('30 of 30 ticked');
			await expect(start(page)).toHaveText('Start round with 30 comments');
			const previous = pager(page).getByRole('button', { name: 'Previous' });
			const next = pager(page).getByRole('button', { name: 'Next' });
			await expect(previous).toBeDisabled();
			const height = (await box(page).boundingBox())!.height;

			await rows(page).nth(0).getByRole('checkbox').uncheck();
			await expect(start(page)).toHaveText('Start round with 29 comments');
			await shot('ac3-pending-comments-page-1');
			for (let p = 2; p <= 6; p++) {
				await next.click();
				await expect(position(page)).toHaveText(`${(p - 1) * 5 + 1}–${p * 5} of 30`);
				await expect(rows(page)).toHaveCount(5);
				expect((await box(page).boundingBox())!.height).toBe(height);
			}
			await expect(next).toBeDisabled();
			await rows(page).nth(4).getByRole('checkbox').uncheck();
			await expect(start(page)).toHaveText('Start round with 28 comments');
			await shot('ac3-pending-comments-page-6');
			for (let p = 5; p >= 1; p--) await previous.click();
			await expect(position(page)).toHaveText('1–5 of 30');
			await expect(rows(page).nth(0).getByRole('checkbox')).not.toBeChecked();
			await expect(rows(page).nth(1).getByRole('checkbox')).toBeChecked();
			expect((await box(page).boundingBox())!.height).toBe(height);

			// Select none and select all reach every page.
			await box(page).getByRole('button', { name: 'Select none' }).click();
			await expect(count(page)).toHaveText('0 of 30 ticked');
			await expect(start(page)).toHaveText('Start round with 0 comments');
			await expect(start(page)).toBeDisabled();
			await expect(box(page)).toContainText('Tick at least one comment to start a round.');
			await next.click();
			await next.click();
			for (const checkbox of await rows(page).getByRole('checkbox').all()) {
				await expect(checkbox).not.toBeChecked();
			}
			await shot('ac6-nothing-ticked-disabled');
			await start(page).click({ force: true });
			await page.waitForTimeout(300);
			expect(fake.commands()).toHaveLength(0);

			await box(page).getByRole('button', { name: 'Select all' }).click();
			await expect(count(page)).toHaveText('30 of 30 ticked');
			await expect(start(page)).toHaveText('Start round with 30 comments');
			await expect(start(page)).toBeEnabled();
			await next.click();
			for (const checkbox of await rows(page).getByRole('checkbox').all()) {
				await expect(checkbox).toBeChecked();
			}
		});
	});

	test.describe('skipped and truncated', () => {
		test.use({ fakeOptions: { pendingFeedbackCohort: 'skippedTruncated' } });

		test('skipped comments show as one line naming their authors, and the truncation', async ({
			page,
			shot
		}) => {
			await gotoLive(page, PLACEMENTS[0]!.url(HANDOFF));
			await expect(rows(page)).toHaveCount(3);
			await expect(box(page).getByTestId('feedback-skipped')).toHaveText(
				'2 skipped: drive-by-user, someone-else (not collaborators or codeHost.feedback.authors) · only the newest 100 of each list were read'
			);
			await shot('ac7-skipped-truncated');
		});
	});

	test.describe('nothing pending', () => {
		test.use({ fakeOptions: { pendingFeedbackCohort: 'none' } });

		test('says so, and a typed note still starts a round with no only', async ({
			page,
			fake,
			shot
		}) => {
			await gotoLive(page, PLACEMENTS[0]!.url(HANDOFF));
			await expect(box(page).getByTestId('nothing-pending')).toHaveText(
				'No pending feedback on the pull request. A note still starts a round.'
			);
			await expect(start(page)).toBeDisabled();
			await note(page).fill('Tidy the naming.');
			await expect(start(page)).toHaveText('Start round with the note');
			await expect(start(page)).toBeEnabled();
			await shot('ac8-nothing-pending');
			await start(page).click();
			const [sent] = await received(fake, 0);
			expect(sent).toMatchObject({ path: ROUND_PATH });
			expect(sent!.body).toEqual({ note: 'Tidy the naming.' });
		});
	});

	test.describe('a refusal', () => {
		for (const [label, problem] of [
			[
				'409',
				{
					status: 409,
					title: 'Invalid state',
					type: 'invalid_state',
					detail: 'No new feedback since the last push. Add a note to start a round anyway.'
				}
			],
			['502', problemCodeHostUnavailable]
		] as const) {
			test.describe(label, () => {
				test.use({ fakeOptions: { failCommand: { commands: ['feedback'], problem } } });

				test(`${label}: keeps the ticks and the note, and rereads the ticket and the pending list`, async ({
					page,
					fake,
					shot
				}) => {
					await gotoLive(page, PLACEMENTS[1]!.url(HANDOFF));
					await expect(rows(page)).toHaveCount(3);
					await rows(page).nth(0).getByRole('checkbox').uncheck();
					await note(page).fill('Look again.');
					const details = detailReads(fake);
					const reads = feedbackReads(fake);
					await start(page).click();
					const [sent] = await received(fake, 0);
					expect(sent!.body).toEqual({ only: [review!.ref, comment!.ref], note: 'Look again.' });
					await expect(box(page).locator('[data-failure="feedback"]')).toContainText(
						problem.detail,
						{ timeout: 15_000 }
					);
					await expect.poll(() => detailReads(fake)).toBeGreaterThan(details);
					await expect.poll(() => feedbackReads(fake)).toBeGreaterThan(reads);
					await expect(note(page)).toHaveValue('Look again.');
					await expect(rows(page).nth(0).getByRole('checkbox')).not.toBeChecked();
					await expect(count(page)).toHaveText('2 of 3 ticked');
					await shot(`ac10-refused-${label}`);
				});
			});
		}
	});

	test.describe('a failed pending read', () => {
		test.use({ fakeOptions: { failPendingFeedback: problemCodeHostUnavailable } });

		test("shows the factory's message with a retry, and no token or factory address", async ({
			page,
			fake,
			shot
		}) => {
			await gotoLive(page, PLACEMENTS[0]!.url(HANDOFF));
			const failure = box(page).getByTestId('pending-feedback-failure');
			await expect(failure.getByRole('alert')).toHaveText(problemCodeHostUnavailable.detail);
			const reads = feedbackReads(fake);
			await failure.getByRole('button', { name: 'Retry' }).click();
			await expect.poll(() => feedbackReads(fake)).toBe(reads + 1);
			await expect(failure.getByRole('alert')).toHaveText(problemCodeHostUnavailable.detail);
			const html = await page.content();
			expect(html).not.toContain(fake.token);
			expect(html).not.toContain(new URL(fake.url).host);
			const answer = await page.request.get(`/api/factory/tickets/${HANDOFF}/feedback`);
			const text = await answer.text();
			expect(text).not.toContain(fake.token);
			expect(text).not.toContain(new URL(fake.url).host);
			await shot('ac11-pending-read-failed');
		});
	});

	for (const [name, label, key, reason] of [
		['merged', 'a merged pull request', ticketDetailComplete.key, 'The pull request is merged.'],
		['closed', 'a closed pull request', ticketDetailCancelled.key, 'The pull request is closed.'],
		[
			'in-qa',
			'in QA, outside ready_for_handoff',
			ticketDetailActiveInQa.key,
			'A feedback round starts at handoff, while its pull request is open.'
		]
	] as const) {
		test(`${label}: starting is unavailable with its reason and no pending read is made`, async ({
			page,
			fake,
			shot
		}) => {
			await gotoLive(page, PLACEMENTS[0]!.url(key));
			await expect(box(page)).toBeVisible();
			await expect(start(page)).toBeDisabled();
			await expect(box(page).locator('[data-reason="feedback"]')).toHaveText(reason);
			await expect(list(page)).toHaveCount(0);
			await page.waitForTimeout(300);
			expect(feedbackReads(fake, key)).toBe(0);
			await shot(`ac12-unavailable-${name}`);
		});
	}

	test.describe('a read-only token', () => {
		test.use({ fakeOptions: { canAct: false } });

		test('the list shows and starting is disabled with the access reason', async ({
			page,
			fake,
			shot
		}) => {
			await gotoLive(page, PLACEMENTS[0]!.url(HANDOFF));
			await expect(rows(page)).toHaveCount(3);
			await start(page).click();
			await received(fake, 0);
			await expect(box(page).locator('[data-reason="feedback"]')).toHaveText(READ_ONLY, {
				timeout: 15_000
			});
			await expect(start(page)).toBeDisabled();
			await expect(rows(page)).toHaveCount(3);
			await shot('ac12-read-only');
			await start(page).click({ force: true });
			await page.waitForTimeout(300);
			expect(fake.commands()).toHaveLength(1);
		});
	});
});

test.describe('Feedback rounds box: earlier rounds', () => {
	const box = (page: Page) => region(page).locator('[data-slot="feedback-rounds"]');
	const earlier = (page: Page) => box(page).getByTestId('earlier-rounds');
	const roundGroup = (page: Page, n: number) => earlier(page).locator(`[data-round="${n}"]`);
	const item = (page: Page, n: number, id: string) =>
		roundGroup(page, n).locator(`[data-item="${id}"]`);
	const pendingList = (page: Page) => box(page).getByTestId('pending-feedback-list');
	const start = (page: Page) => box(page).getByTestId('feedback-start');
	const note = (page: Page) =>
		box(page).getByRole('textbox', { name: 'Note for the round (optional)' });
	const feedbackReads = (fake: FakeFixture) =>
		fake
			.requests()
			.filter(
				(r) => r.method === 'GET' && r.path.split('?')[0] === `/v1/tickets/${HANDOFF}/feedback`
			).length;
	const [thread, review, operatorNote] = feedbackRoundOne.items;
	const [roundTwoComment] = feedbackRoundTwo.items;

	/** Round 1's three items: the thread and review with their links, the note without one. */
	async function expectRoundOne(page: Page) {
		await expect(roundGroup(page, 1)).toContainText('Feedback round 1');
		await expect(roundGroup(page, 1).locator('[data-item]')).toHaveCount(3);
		for (const it of [thread!, review!]) {
			const row = item(page, 1, it.id);
			await expect.soft(row).toContainText(it.id);
			await expect.soft(row).toContainText(it.author);
			await expect.soft(row.getByTestId('summary')).toHaveText(it.summary);
			await expect
				.soft(row.getByRole('link', { name: `Open ${it.ref} on GitHub` }))
				.toHaveAttribute('href', it.url!);
		}
		await expect
			.soft(item(page, 1, thread!.id).getByTestId('location'))
			.toHaveText(thread!.location!);
		const noteRow = item(page, 1, operatorNote!.id);
		await expect.soft(noteRow).toContainText("Operator's note");
		await expect.soft(noteRow).toContainText(operatorNote!.author);
		await expect.soft(noteRow.getByTestId('summary')).toHaveText(operatorNote!.summary);
		await expect.soft(noteRow.getByRole('link')).toHaveCount(0);
	}

	test.describe('round 1 done, back at handoff with the pull request open', () => {
		test.use({ fakeOptions: { details: [ticketDetailReadyForHandoffAfterRound] } });

		for (const placement of PLACEMENTS) {
			test(`${placement.name}: shows Feedback round 1 with its items, the note without a link, beside the pending list and the start control`, async ({
				page,
				shot
			}) => {
				await gotoLive(page, placement.url(HANDOFF));
				await expect(earlier(page)).toBeVisible();
				await expect(earlier(page).locator('[data-round]')).toHaveCount(1);
				await expectRoundOne(page);
				await expect(pendingList(page).getByRole('listitem')).toHaveCount(3);
				await expect(start(page)).toBeEnabled();
				await expect(note(page)).toBeEditable();
				await earlier(page).scrollIntoViewIfNeeded();
				await shot(`ac1-ac2-ac5-earlier-round-at-handoff-${slug(placement)}`);
			});
		}
	});

	test.describe('round 1 done, round 2 in work', () => {
		test.use({ fakeOptions: { details: [ticketDetailTwoFeedbackRounds] } });

		for (const placement of PLACEMENTS) {
			test(`${placement.name}: both rounds show with their own items, read-only, with no pending list and no start control`, async ({
				page,
				fake,
				shot
			}) => {
				await gotoLive(page, placement.url(HANDOFF));
				await expect(earlier(page).locator('[data-round]')).toHaveCount(2);
				await expectRoundOne(page);
				await expect(roundGroup(page, 2)).toContainText('Feedback round 2');
				await expect(roundGroup(page, 2).locator('[data-item]')).toHaveCount(1);
				const only = item(page, 2, roundTwoComment!.id);
				await expect(only).toContainText(roundTwoComment!.author);
				await expect(only.getByTestId('summary')).toHaveText(roundTwoComment!.summary);
				await expect(
					only.getByRole('link', { name: `Open ${roundTwoComment!.ref} on GitHub` })
				).toHaveAttribute('href', roundTwoComment!.url!);
				await expect(roundGroup(page, 2)).not.toContainText(thread!.summary);
				await expect(pendingList(page)).toHaveCount(0);
				await expect(start(page)).toHaveCount(0);
				await expect(note(page)).toHaveCount(0);
				expect(feedbackReads(fake)).toBe(0);
				await earlier(page).scrollIntoViewIfNeeded();
				await shot(`ac3-ac4-two-rounds-in-work-${slug(placement)}`);
			});
		}
	});

	test.describe('round 1 done, then the pull request merged', () => {
		test.use({ fakeOptions: { details: [ticketDetailFeedbackRoundMergedPr] } });

		test('ticket page: round 1 shows read-only, with no pending list and no start control', async ({
			page,
			fake,
			shot
		}) => {
			await gotoLive(page, PLACEMENTS[0]!.url(HANDOFF));
			await expect(earlier(page).locator('[data-round]')).toHaveCount(1);
			await expectRoundOne(page);
			await expect(pendingList(page)).toHaveCount(0);
			await expect(start(page)).toHaveCount(0);
			await expect(note(page)).toHaveCount(0);
			expect(feedbackReads(fake)).toBe(0);
			await earlier(page).scrollIntoViewIfNeeded();
			await shot('ac4-earlier-round-merged-pr');
		});
	});
});
