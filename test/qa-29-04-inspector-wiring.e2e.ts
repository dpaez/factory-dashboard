import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	ticketDetailAgentQuestion,
	ticketDetailFailed,
	ticketDetailMultiExecution,
	ticketDetailPaused
} from '../src/lib/factory/fixtures/tickets.ts';
import {
	FAKE_FACTORY_TOKEN,
	startFakeFactory,
	type FakeCommandRequest,
	type FakeFactoryOptions
} from './fake-factory';
import { gotoLive } from './live';

// QA for ticket #29, task 04: commands in both Inspector placements.
const QA_DIR =
	process.env.QA_DIR ??
	'/Users/deka/Projects/geut/factory-dashboard/.factory/tickets/dpaez-factory-dashboard-29-b8d88146/qa/04/screenshots';
const shot = (page: Page, name: string) =>
	page.screenshot({ path: `${QA_DIR}/${name}.png`, fullPage: true }).catch(() => undefined);

const FAILED = ticketDetailFailed.key;
const PAUSED = ticketDetailPaused.key;
const QUESTION = ticketDetailAgentQuestion.key;
const MULTI = ticketDetailMultiExecution.key;

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
			.poll(() => fetch(`${base}/robots.txt`).then((r) => r.ok, () => false), { timeout: 30_000 })
			.toBe(true);
	});
	test.afterAll(async () => {
		app?.kill();
		await new Promise((resolve) => fake?.close(resolve));
	});
	const commands = async (): Promise<FakeCommandRequest[]> =>
		(await (await fetch(`http://127.0.0.1:${fakePort}/__fake/commands`)).json()) as never;
	return { base, commands };
}

const PLACEMENTS = [
	{ name: 'ticket page', url: (base: string, key: string, q = '') => `${base}/tickets/${key}${q && `?${q}`}` },
	{ name: 'board', url: (base: string, key: string, q = '') => `${base}/?ticket=${key}${q && `&${q}`}` }
];

const inspector = (page: Page) => page.getByTestId('ticket-inspector');
const button = (page: Page, name: string) =>
	inspector(page).getByRole('button', { name, exact: true });

test.describe('normal access', () => {
	const { base, commands } = scenario(7971, 4371);

	for (const p of PLACEMENTS) {
		test(`AC1 (${p.name}): current execution shows the action bar, a past one shows none`, async ({
			page
		}) => {
			await gotoLive(page, p.url(base, MULTI));
			await expect(button(page, 'Cancel execution')).toBeVisible();
			await shot(page, `ac1-${p.name.replace(' ', '-')}-current-execution`);

			await gotoLive(page, p.url(base, MULTI, 'execution=1'));
			await expect(page.getByTestId('past-execution')).toBeVisible();
			for (const name of ['Cancel execution', 'Retry', 'Stop agent', 'Rerun', 'Mark complete']) {
				await expect(button(page, name)).toHaveCount(0);
			}
			await expect(inspector(page).getByRole('textbox', { name: 'Your answer' })).toHaveCount(0);
			await shot(page, `ac1-${p.name.replace(' ', '-')}-past-execution`);
		});

		test(`AC2 (${p.name}): Retry posts its route through /api/factory/commands`, async ({ page }) => {
			const posted: string[] = [];
			page.on('request', (r) => r.method() === 'POST' && posted.push(new URL(r.url()).pathname));
			await gotoLive(page, p.url(base, FAILED));
			const before = (await commands()).length;
			await button(page, 'Retry').click();
			await expect.poll(async () => (await commands()).length).toBe(before + 1);
			const sent = (await commands())[before]!;
			expect(sent).toMatchObject({ method: 'POST', path: `/v1/tickets/${FAILED}/retries` });
			expect(sent.body).toBeUndefined();
			expect(sent.idempotencyKey).toBeTruthy();
			expect(posted.every((path) => path.startsWith('/api/factory/commands/'))).toBe(true);
			expect(posted.length).toBeGreaterThan(0);
		});

		test(`AC3 (${p.name}): dismissing the cancel dialog with Escape sends nothing`, async ({
			page
		}) => {
			await gotoLive(page, p.url(base, PAUSED));
			const before = (await commands()).length;
			await button(page, 'Cancel execution').click();
			const dialog = page.getByRole('alertdialog');
			await expect(dialog).toBeVisible();
			await shot(page, `ac3-${p.name.replace(' ', '-')}-cancel-dialog`);
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();
			await button(page, 'Cancel execution').click();
			await dialog.getByRole('button', { name: 'Keep execution' }).click();
			await expect(dialog).toBeHidden();
			await page.waitForTimeout(500);
			expect((await commands()).length).toBe(before);
		});

		test(`AC4 (${p.name}): a reply draft survives reload and navigation, cleared once confirmed`, async ({
			page
		}) => {
			const field = inspector(page).getByRole('textbox', { name: 'Your answer' });
			const draft = `QA draft from the ${p.name}`;
			await gotoLive(page, p.url(base, QUESTION));
			await field.fill(draft);
			await page.reload();
			await expect(field).toHaveValue(draft);
			await gotoLive(page, `${base}/tickets`);
			await page.goBack();
			await expect(field).toHaveValue(draft);
			const before = (await commands()).length;
			await inspector(page).getByRole('button', { name: 'Send reply & resume' }).click();
			await expect.poll(async () => (await commands()).length).toBe(before + 1);
			expect((await commands())[before]).toMatchObject({
				path: `/v1/tickets/${QUESTION}/replies`,
				body: { answer: draft }
			});
			await expect(field).toHaveValue('', { timeout: 15_000 });
			await shot(page, `ac4-${p.name.replace(' ', '-')}-reply-cleared`);
			await page.reload();
			await expect(field).toHaveValue('');
		});
	}
});

test.describe('read-only token', () => {
	const { base } = scenario(7972, 4372, { canAct: false });
	const READ_ONLY = /Action access required/;

	for (const p of PLACEMENTS) {
		test(`AC5 (${p.name}): a 403 insufficient_scope disables every action with the explanation`, async ({
			page
		}) => {
			await gotoLive(page, p.url(base, PAUSED));
			await button(page, 'Retry').click();
			await expect(inspector(page).getByText(READ_ONLY).first()).toBeVisible();
			for (const name of ['Stop agent', 'Retry', 'Cancel execution']) {
				await expect(button(page, name)).toBeDisabled();
				await expect(button(page, name)).toHaveAccessibleDescription(READ_ONLY);
			}
			await shot(page, `ac5-${p.name.replace(' ', '-')}-read-only`);
		});

		test(`AC6 (${p.name}): no token, factory URL or raw upstream body reaches the browser`, async ({
			page
		}) => {
			const leaks: string[] = [];
			const SECRETS = [FAKE_FACTORY_TOKEN, '127.0.0.1', 'Bearer', '/v1/'];
			const bodies: unknown[] = [];
			page.on('request', (r) => {
				if (new URL(r.url()).origin !== base) leaks.push(`off-origin ${r.url()}`);
				if (JSON.stringify(r.headers()).includes(FAKE_FACTORY_TOKEN)) leaks.push(`token ${r.url()}`);
			});
			page.on('response', async (r) => {
				const text = await r.text().catch(() => '');
				if (new URL(r.url()).pathname.startsWith('/api/factory/commands/')) bodies.push(JSON.parse(text));
				for (const s of SECRETS) if (text.includes(s)) leaks.push(`${r.url()} has ${s}`);
			});
			await gotoLive(page, p.url(base, PAUSED));
			await button(page, 'Retry').click();
			await expect(inspector(page).getByText(READ_ONLY).first()).toBeVisible();
			const html = await page.content();
			for (const s of SECRETS) expect(html).not.toContain(s);
			expect(leaks).toEqual([]);
			// The browser sees the dashboard's normalized failure, not the upstream problem body.
			expect(bodies).toHaveLength(1);
			const body = bodies[0] as { ok: boolean; failure: Record<string, unknown> };
			expect(Object.keys(body).sort()).toEqual(['failure', 'ok']);
			expect(body.ok).toBe(false);
			expect(body.failure.type).toBe('insufficient_scope');
			for (const key of Object.keys(body.failure)) {
				expect(['type', 'title', 'detail', 'fieldErrors', 'retryable']).toContain(key);
			}
			expect(body.failure).not.toHaveProperty('status');
		});
	}
});
