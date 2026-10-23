import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Locator, type Page } from '@playwright/test';

import {
	ticketDetailAgentQuestion,
	ticketDetailFailed,
	ticketDetailMultiExecution,
	ticketDetailPaused,
	ticketDetailReadyForHandoff
} from '../src/lib/factory/fixtures/tickets.ts';
import {
	FAKE_FACTORY_TOKEN,
	startFakeFactory,
	type FakeCommandRequest,
	type FakeFactoryOptions
} from './fake-factory';
import { gotoLive } from './live';

// The Inspector's commands, on the board and on /tickets/[key], against the
// built app and its own fake factory per scenario.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const PAUSED = ticketDetailPaused.key;
const FAILED = ticketDetailFailed.key;
const HANDOFF = ticketDetailReadyForHandoff.key;
const QUESTION = ticketDetailAgentQuestion.key;
const MULTI = ticketDetailMultiExecution.key;
const READ_ONLY = "Action access required: this dashboard's token cannot send commands.";

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions = {}) {
	let fake: Server;
	let app: ChildProcess;
	const base = `http://localhost:${appPort}`;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, options));
		app = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(appPort),
				FACTORY_API_URL: `http://127.0.0.1:${fakePort}`,
				FACTORY_API_TOKEN: FAKE_FACTORY_TOKEN,
				ORIGIN: base
			},
			stdio: 'ignore'
		});
		await expect
			.poll(
				async () => {
					try {
						return (await fetch(`${base}/robots.txt`)).status > 0;
					} catch {
						return false;
					}
				},
				{ timeout: 30_000 }
			)
			.toBe(true);
	});
	test.afterAll(async () => {
		app?.kill();
		await new Promise((resolve) => fake?.close(resolve));
	});
	return {
		base,
		commands: async (): Promise<FakeCommandRequest[]> =>
			(await (await fetch(`http://127.0.0.1:${fakePort}/__fake/commands`)).json()) as never
	};
}

type Placement = { name: string; url: (base: string, key: string) => string };
const PLACEMENTS: Placement[] = [
	{ name: 'ticket page', url: (base, key) => `${base}/tickets/${key}` },
	{ name: 'board inspector', url: (base, key) => `${base}/?ticket=${key}` }
];

const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const region = (page: Page) => inspector(page).locator('[data-slot="ticket-commands"]');
const bar = (page: Page) => region(page).locator('[data-slot="ticket-actions"]');
const action = (page: Page, name: string) => bar(page).getByRole('button', { name, exact: true });

/**
 * Every browser request goes to the app's own origin, every command to
 * `/api/factory/commands/*`, and no answer the browser reads names the token
 * or the factory's address.
 */
function guard(page: Page, base: string) {
	const problems: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.origin !== base) problems.push(`off-origin ${request.url()}`);
		if (request.method() === 'POST' && !url.pathname.startsWith('/api/factory/commands/')) {
			problems.push(`POST ${url.pathname}`);
		}
		const headers = JSON.stringify(request.headers());
		if (headers.includes(FAKE_FACTORY_TOKEN)) problems.push(`token in request ${url.pathname}`);
	});
	page.on('response', async (response) => {
		const url = new URL(response.url());
		if (!url.pathname.startsWith('/api/factory/commands/')) return;
		const text = await response.text().catch(() => '');
		for (const leak of [FAKE_FACTORY_TOKEN, '127.0.0.1', 'Bearer', '/v1/']) {
			if (text.includes(leak)) problems.push(`${url.pathname} answer leaks ${leak}`);
		}
	});
	return problems;
}

/** Wait for the fake to have received `count` more commands than `before`, and return them. */
async function received(commands: () => Promise<FakeCommandRequest[]>, before: number, count = 1) {
	await expect.poll(async () => (await commands()).length).toBe(before + count);
	return (await commands()).slice(before);
}

const confirmed = (control: Locator) => expect(control).toBeEnabled({ timeout: 15_000 });

test.describe('commands from both placements', () => {
	const { base, commands } = scenario(7961, 4361);

	for (const placement of PLACEMENTS) {
		test(`${placement.name}: retry, complete and rerun post their command`, async ({ page }) => {
			const problems = guard(page, base);

			await gotoLive(page, placement.url(base, FAILED));
			await expect(region(page)).toBeVisible();
			for (const [label, path] of [
				['Retry', `/v1/tickets/${FAILED}/retries`],
				['Rerun', `/v1/tickets/${FAILED}/reruns`]
			] as const) {
				const before = (await commands()).length;
				await action(page, label).click();
				const [sent] = await received(commands, before);
				expect(sent).toMatchObject({ method: 'POST', path });
				expect(sent!.body).toBeUndefined();
				expect(sent!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
				await confirmed(action(page, label));
			}

			await gotoLive(page, placement.url(base, HANDOFF));
			const before = (await commands()).length;
			await action(page, 'Mark complete').click();
			const [sent] = await received(commands, before);
			expect(sent).toMatchObject({ path: `/v1/tickets/${HANDOFF}/complete` });
			expect(sent!.body).toBeUndefined();
			await shot(page, `inspector-commands-${placement.name.replace(' ', '-')}`);
			expect(problems).toEqual([]);
		});

		test(`${placement.name}: Keep execution sends nothing, Cancel execution posts cancel`, async ({
			page
		}) => {
			const problems = guard(page, base);
			await gotoLive(page, placement.url(base, PAUSED));
			const before = (await commands()).length;

			await action(page, 'Cancel execution').click();
			const dialog = page.getByRole('alertdialog');
			await expect(dialog).toContainText('The worktree, branch and pull request are kept.');
			await dialog.getByRole('button', { name: 'Keep execution' }).click();
			await expect(dialog).toBeHidden();
			await page.waitForTimeout(300);
			expect((await commands()).length).toBe(before);

			await action(page, 'Cancel execution').click();
			await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel execution' }).click();
			const [sent] = await received(commands, before);
			expect(sent).toMatchObject({ path: `/v1/tickets/${PAUSED}/cancel` });
			expect(sent!.body).toBeUndefined();
			// The dialog closes once the cancel is confirmed.
			await expect(page.getByRole('alertdialog')).toBeHidden({ timeout: 15_000 });
			expect(problems).toEqual([]);
		});

		test(`${placement.name}: Stop with several runs posts the chosen run`, async ({ page }) => {
			const problems = guard(page, base);
			await gotoLive(page, placement.url(base, PAUSED));
			const stop = action(page, 'Stop agent');
			await expect(stop).toBeDisabled();
			await expect(bar(page).locator('[data-reason="stop"]')).toHaveText(
				'Choose which run to stop.'
			);
			const before = (await commands()).length;
			await bar(page).locator('input[type="radio"][value="run_work_running"]').check();
			await expect(stop).toBeEnabled();
			await stop.click();
			const [sent] = await received(commands, before);
			expect(sent).toMatchObject({ path: '/v1/runs/run_work_running/stop' });
			expect(sent!.body).toBeUndefined();
			expect(problems).toEqual([]);
		});

		test(`${placement.name}: a reply posts its answer and clears the draft once confirmed`, async ({
			page
		}) => {
			const problems = guard(page, base);
			await gotoLive(page, placement.url(base, QUESTION));
			const composer = region(page).locator('[data-slot="reply-composer"]');
			const field = composer.getByLabel('Your answer');
			const send = composer.getByRole('button', { name: 'Send reply & resume' });
			const before = (await commands()).length;

			// An empty reply posts nothing.
			await expect(send).toBeDisabled();
			await field.focus();
			await page.keyboard.press('Control+Enter');
			await expect(composer.getByTestId('reply-blank')).toBeVisible();

			const answer = `Cmd+Enter, from the ${placement.name}.`;
			await field.fill(answer);
			// The draft survives a reload and a navigation away and back.
			await gotoLive(page, placement.url(base, QUESTION));
			await expect(field).toHaveValue(answer);
			await gotoLive(page, `${base}/tickets`);
			await gotoLive(page, placement.url(base, QUESTION));
			await expect(field).toHaveValue(answer);
			expect((await commands()).length).toBe(before);

			await send.click();
			const [sent] = await received(commands, before);
			expect(sent).toMatchObject({ path: `/v1/tickets/${QUESTION}/replies`, body: { answer } });
			await expect(composer.getByTestId('reply-confirmed')).toBeVisible({ timeout: 15_000 });
			await expect(field).toHaveValue('');
			// Cleared for good: a reload does not bring it back.
			await gotoLive(page, placement.url(base, QUESTION));
			await expect(field).toHaveValue('');
			expect(problems).toEqual([]);
		});

		test(`${placement.name}: a past execution shows no command controls`, async ({ page }) => {
			await gotoLive(page, placement.url(base, MULTI));
			await expect(action(page, 'Cancel execution')).toBeVisible();
			const past =
				placement.name === 'ticket page'
					? `${base}/tickets/${MULTI}?execution=1`
					: `${base}/?ticket=${MULTI}&execution=1`;
			await gotoLive(page, past);
			await expect(inspector(page)).toHaveAttribute('data-execution', '1');
			await expect(page.getByTestId('past-execution')).toBeVisible();
			await expect(region(page)).toHaveCount(0);
			await expect(page.locator('[data-slot="ticket-actions"]')).toHaveCount(0);
			await expect(page.locator('[data-slot="reply-composer"]')).toHaveCount(0);
		});
	}
});

test.describe('the reread after a command', () => {
	// A retry makes the ticket active, so Retry disappears once the change is reread.
	const { base, commands } = scenario(7962, 4362, {
		commandEffects: { retry: { status: 'active', statusReason: null } }
	});

	test('ticket page: Retry disappears after the retry is confirmed', async ({ page }) => {
		await gotoLive(page, `${base}/tickets/${FAILED}`);
		const before = (await commands()).length;
		await action(page, 'Retry').click();
		await received(commands, before);
		await expect(action(page, 'Retry')).toHaveCount(0, { timeout: 15_000 });
	});

	test('board inspector: Retry disappears after the retry is confirmed', async ({ page }) => {
		await gotoLive(page, `${base}/?ticket=${PAUSED}`);
		const before = (await commands()).length;
		await action(page, 'Retry').click();
		await received(commands, before);
		await expect(action(page, 'Retry')).toHaveCount(0, { timeout: 15_000 });
	});
});

test.describe('read-only access', () => {
	const { base, commands } = scenario(7963, 4363, { canAct: false });

	for (const placement of PLACEMENTS) {
		test(`${placement.name}: after a 403 every action is disabled with the access explanation`, async ({
			page
		}) => {
			const problems = guard(page, base);
			await gotoLive(page, placement.url(base, PAUSED));
			const before = (await commands()).length;
			await action(page, 'Retry').click();
			await received(commands, before);

			await expect(bar(page).getByTestId('access-explanation')).toHaveText(READ_ONLY);
			for (const label of ['Stop agent', 'Retry', 'Cancel execution']) {
				await expect(action(page, label)).toBeDisabled();
				await expect(action(page, label)).toHaveAccessibleDescription(
					new RegExp(READ_ONLY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
				);
			}
			await shot(page, `inspector-commands-read-only-${placement.name.replace(' ', '-')}`);
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
	const QUESTION_ID = ticketDetailAgentQuestion.attention.find(
		(item) => item.status === 'open'
	)!.id;
	const storageKey = `reply:${QUESTION}:${ticketDetailAgentQuestion.execution}:${QUESTION_ID}`;
	const stored = (page: Page) => page.evaluate((key) => sessionStorage.getItem(key), storageKey);

	for (const [index, placement] of PLACEMENTS.entries()) {
		// Each placement answers its own question, so each gets its own fake.
		test.describe(placement.name, () => {
			const { base, commands } = scenario(7964 + index, 4364 + index, options);
			test(`${placement.name}: navigating away while pending still clears the draft`, async ({
				page
			}) => {
				const problems = guard(page, base);
				await gotoLive(page, placement.url(base, QUESTION));
				const composer = region(page).locator('[data-slot="reply-composer"]');
				const answer = `Answered from the ${placement.name}, then left.`;
				await composer.getByLabel('Your answer').fill(answer);
				expect(await stored(page)).toBe(answer);

				const before = (await commands()).length;
				await composer.getByRole('button', { name: 'Send reply & resume' }).click();
				await expect(composer).toHaveAttribute('data-phase', 'submitting');
				// Leave in the same session: the coordinator lives on, the Inspector does not.
				await page.getByRole('link', { name: 'Tickets', exact: true }).click();
				await expect(page).toHaveURL(`${base}/tickets`);
				await expect(inspector(page)).toHaveCount(0);

				const [sent] = await received(commands, before);
				expect(sent).toMatchObject({ path: `/v1/tickets/${QUESTION}/replies`, body: { answer } });
				await expect(
					page.locator('[data-slot="command-feedback"] [aria-live="polite"]')
				).toHaveText('Reply: The factory recorded it.', { timeout: 15_000 });
				expect(await stored(page)).toBeNull();

				// Back on the ticket: the question is closed and no draft comes back.
				await page.goBack();
				await expect(inspector(page)).toHaveAttribute('data-ticket-key', QUESTION);
				await expect(region(page).locator('[data-slot="reply-composer"]')).toHaveCount(0);
				expect(await stored(page)).toBeNull();
				await page.reload();
				expect(await stored(page)).toBeNull();
				expect(problems).toEqual([]);
			});
		});
	}
});
