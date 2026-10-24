import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	problemStartBriefValidation,
	problemStartConflict,
	problemTrackerUnavailable,
	problemUmbrellaIssue
} from '../src/lib/factory/fixtures/problems.ts';
import { START_FAILURES } from '../src/lib/factory/start.ts';
import {
	FAKE_FACTORY_TOKEN,
	startFakeFactory,
	type FakeCommandRequest,
	type FakeFactoryOptions
} from './fake-factory';
import { gotoLive } from './live';

// QA for ticket #30, task 05: the New ticket action and the /new composer, against the built app.
const SHOTS =
	process.env.QA_DIR ??
	'/Users/deka/Projects/geut/factory-dashboard/.factory/tickets/dpaez-factory-dashboard-30-964882a5/qa/05/screenshots';
const shot = (page: Page, name: string) =>
	page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => undefined);

const REF = 'dpaez/factory-dashboard#77';
const ID = 'qa-brief-ticket';
const BRIEF = 'Write a QA brief and keep it when the factory says no.';

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
				() =>
					fetch(`${base}/robots.txt`).then(
						(r) => r.ok,
						() => false
					),
				{ timeout: 30_000 }
			)
			.toBe(true);
	});
	test.afterAll(async () => {
		app?.kill();
		await new Promise((resolve) => fake?.close(resolve));
	});
	const starts = async (): Promise<FakeCommandRequest[]> =>
		(
			(await (
				await fetch(`http://127.0.0.1:${fakePort}/__fake/commands`)
			).json()) as FakeCommandRequest[]
		).filter((c) => c.command === 'start');
	return { base, starts };
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });
const newLink = (page: Page) => nav(page).getByRole('link', { name: 'New ticket' });
const refInput = (page: Page) => page.getByRole('textbox', { name: 'Issue reference' });
const idInput = (page: Page) => page.getByRole('textbox', { name: 'ID' });
const briefInput = (page: Page) => page.getByRole('textbox', { name: 'Brief' });
const startButton = (page: Page) => page.getByRole('button', { name: /Start planning|Starting/ });

async function openNew(page: Page, base: string) {
	await gotoLive(page, `${base}/`);
	await newLink(page).click();
	await expect(page).toHaveURL(`${base}/new`);
}

async function writeBrief(page: Page) {
	await page.getByRole('tab', { name: 'Written brief' }).click();
	await idInput(page).fill(ID);
	await briefInput(page).fill(BRIEF);
}

test.describe('AC1', () => {
	const s = scenario(7151, 4151);

	test('AC1: the nav New ticket action opens the composer at /new', async ({ page }) => {
		await gotoLive(page, `${s.base}/`);
		await expect(newLink(page)).toBeVisible();
		await newLink(page).click();
		await expect(page).toHaveURL(`${s.base}/new`);
		await expect(page.getByRole('heading', { name: 'New ticket' })).toBeVisible();
		await expect(refInput(page)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Start planning' })).toBeVisible();
		await expect(newLink(page)).toHaveAttribute('aria-current', 'page');
		await shot(page, 'ac1-new-ticket-composer');
		expect(await s.starts()).toHaveLength(0);
	});
});

test.describe('AC2 issue', () => {
	const s = scenario(7153, 4153, { startAddsTicket: true });

	test('AC2: an issue reference sends exactly {ref} with one intent id', async ({ page }) => {
		await openNew(page, s.base);
		await refInput(page).fill(REF);
		await startButton(page).click();
		await expect(page).toHaveURL(/\/\?ticket=fake-started-/, { timeout: 15_000 });
		const sent = await s.starts();
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ ref: REF });
		expect(sent[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
	});
});

test.describe('AC2 brief', () => {
	const s = scenario(7154, 4154, { startAddsTicket: true });

	test('AC2: a written brief sends exactly {id, text} with one intent id', async ({ page }) => {
		await openNew(page, s.base);
		await writeBrief(page);
		await startButton(page).click();
		await expect(page).toHaveURL(/\/\?ticket=fake-started-/, { timeout: 15_000 });
		const sent = await s.starts();
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ id: ID, text: BRIEF });
		expect(sent[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
	});
});

test.describe('AC3 and AC4', () => {
	const s = scenario(7155, 4155, { startAddsTicket: true, commandDelayMs: 1_500 });

	test('AC3: a double-click and repeated Enter on Start planning send one command', async ({
		page
	}) => {
		await openNew(page, s.base);
		await refInput(page).fill(REF);
		await startButton(page).dblclick();
		for (let i = 0; i < 5; i++) await refInput(page).press('Enter');
		await expect(page).toHaveURL(/\/\?ticket=fake-started-/, { timeout: 15_000 });
		const sent = await s.starts();
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ ref: REF });
	});

	test('AC4: acceptance shows the returned ticket’s inspector; nothing claims running before it', async ({
		page
	}) => {
		await openNew(page, s.base);
		await writeBrief(page);
		await startButton(page).click();
		// While the factory has not answered, the page stays on /new and claims no running state.
		await expect(page.getByRole('button', { name: /Starting/ })).toBeVisible();
		await shot(page, 'ac4-starting-pending');
		await expect(page).toHaveURL(`${s.base}/new`);
		await expect(page.getByTestId('ticket-inspector')).toHaveCount(0);
		await expect(page.locator('main')).not.toContainText(/running/i);

		await expect(page).toHaveURL(/\/\?ticket=fake-started-\d{8}$/, { timeout: 15_000 });
		const key = new URL(page.url()).searchParams.get('ticket')!;
		const inspector = page.getByTestId('ticket-inspector');
		await expect(inspector).toBeVisible();
		await expect(inspector).toContainText(key);
		await expect(inspector).toContainText(ID);
		// The ticket's status is what the factory's read says (queued in plan), not an invented one.
		await expect(inspector).toHaveAttribute('data-state', 'loaded');
		await expect(inspector).toContainText('Queued');
		await shot(page, 'ac4-board-inspector');
	});
});

const failures = [
	['umbrella', 7156, 4156, problemUmbrellaIssue, 'ref', 'ref', START_FAILURES.umbrella],
	['tracker', 7157, 4157, problemTrackerUnavailable, 'ref', 'ref', START_FAILURES.tracker],
	['conflict', 7158, 4158, problemStartConflict, 'brief', 'id', START_FAILURES.conflictId],
	[
		'validation',
		7159,
		4159,
		problemStartBriefValidation,
		'brief',
		'text',
		problemStartBriefValidation.errors[1]!.message
	]
] as const;

for (const [name, fakePort, appPort, problem, mode, field, message] of failures) {
	test.describe(`AC5 ${name}`, () => {
		const s = scenario(fakePort, appPort, { failCommand: { commands: ['start'], problem } });

		test(`AC5: a ${name} failure shows next to its field and keeps the draft`, async ({
			page
		}) => {
			await openNew(page, s.base);
			if (mode === 'ref') await refInput(page).fill(REF);
			else await writeBrief(page);
			await startButton(page).click();
			await expect(page.getByText(message).first()).toBeVisible();
			// "Next to its field": the field names the message as its description.
			const input =
				field === 'ref' ? refInput(page) : field === 'id' ? idInput(page) : briefInput(page);
			await expect(input).toHaveAccessibleDescription(new RegExp(escape(message)));
			await expect(page).toHaveURL(`${s.base}/new`);
			if (mode === 'ref') await expect(refInput(page)).toHaveValue(REF);
			else {
				await expect(idInput(page)).toHaveValue(ID);
				await expect(briefInput(page)).toHaveValue(BRIEF);
			}
			await shot(page, `ac5-${name}`);
			expect(await s.starts()).toHaveLength(1);
		});
	});
}

function escape(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('AC6', () => {
	const s = scenario(7160, 4160);

	test('AC6: Cancel returns to the previous page and sends nothing', async ({ page }) => {
		await gotoLive(page, `${s.base}/tickets`);
		await newLink(page).click();
		await expect(page).toHaveURL(`${s.base}/new`);
		await writeBrief(page);
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page).toHaveURL(`${s.base}/tickets`);
		expect(await s.starts()).toHaveLength(0);
	});
});
