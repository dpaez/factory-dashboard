import type { Locator, Page } from '@playwright/test';

import {
	ticketDetailActiveInQa,
	ticketDetailAgentQuestion,
	ticketDetailFailed,
	ticketDetailMultiExecution,
	ticketDetailPaused,
	ticketDetailReadyForHandoff
} from '../src/lib/factory/fixtures/tickets.ts';
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
