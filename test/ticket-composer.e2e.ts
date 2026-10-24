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

// Ticket #30, task 05: the New ticket action and the /new composer, against
// the built app and its own fake factory per scenario.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const REF = 'dpaez/factory-dashboard#77';
const ID = 'dark-mode-audit';
const BRIEF = 'Audit every story in dark mode and list contrast failures.';

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
		starts: async (): Promise<FakeCommandRequest[]> =>
			(
				(await (
					await fetch(`http://127.0.0.1:${fakePort}/__fake/commands`)
				).json()) as FakeCommandRequest[]
			).filter((command) => command.command === 'start')
	};
}

/** No browser request names the token or leaves the origin; no answer names the token or the factory. */
function guard(page: Page, base: string) {
	const problems: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.origin !== base) problems.push(`off-origin ${request.url()}`);
		if (JSON.stringify(request.headers()).includes(FAKE_FACTORY_TOKEN)) {
			problems.push(`token in request ${url.pathname}`);
		}
	});
	page.on('response', async (response) => {
		const url = new URL(response.url());
		if (url.pathname.startsWith('/api/factory/events')) return; // never ends
		const text = await response.text().catch(() => '');
		for (const leak of [FAKE_FACTORY_TOKEN, '127.0.0.1:', 'Bearer ']) {
			if (text.includes(leak)) problems.push(`${url.pathname} answer leaks ${leak}`);
		}
	});
	return {
		problems,
		async html() {
			const html = await page.content();
			for (const leak of [FAKE_FACTORY_TOKEN, '127.0.0.1:', 'Bearer ']) {
				if (html.includes(leak)) problems.push(`page HTML leaks ${leak}`);
			}
		}
	};
}

const refInput = (page: Page) => page.getByRole('textbox', { name: 'Issue reference' });
const composer = (page: Page) => page.locator('[data-slot="ticket-composer"]');
const submit = (page: Page) => page.getByTestId('composer-submit');
const navNew = (page: Page) =>
	page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'New ticket' });

/** Open /new, which has no load of its own: wait for hydration and the live stream. */
async function openNew(page: Page, base: string) {
	await page.goto(`${base}/new`);
	await expect(page.locator('header [data-slot="connection-status"]')).toHaveAttribute(
		'data-state',
		'live'
	);
}

async function fillBrief(page: Page, id = ID, text = BRIEF) {
	await page.getByRole('tab', { name: 'Written brief' }).click();
	await page.getByRole('textbox', { name: 'ID' }).fill(id);
	await page.getByRole('textbox', { name: 'Brief' }).fill(text);
}

test.describe('the New ticket action', () => {
	const { base, starts } = scenario(7701, 4101);

	test('opens the composer at /new and is current there', async ({ page }) => {
		await gotoLive(page, `${base}/`);
		await expect(navNew(page)).not.toHaveAttribute('aria-current');
		await shot(page, 'new-ticket-nav');
		await navNew(page).click();
		await expect(page).toHaveURL(`${base}/new`);
		await expect(composer(page)).toBeVisible();
		await expect(navNew(page)).toHaveAttribute('aria-current', 'page');
		const nav = page.getByRole('navigation', { name: 'Primary' });
		await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
		await expect(submit(page)).toHaveText('Start planning');
		await shot(page, 'new-ticket-composer');
		expect(await starts()).toHaveLength(0);
	});
});

test.describe('issue mode', () => {
	const { base, starts } = scenario(7702, 4102, { startAddsTicket: true });

	test('sends exactly {ref} and opens the started ticket’s inspector', async ({ page }) => {
		const { problems, html } = guard(page, base);
		await openNew(page, base);
		await refInput(page).fill(`  ${REF} `);
		await submit(page).click();
		await expect(page).toHaveURL(/\/\?ticket=fake-started-\d{8}$/, { timeout: 15_000 });
		const key = new URL(page.url()).searchParams.get('ticket')!;
		await expect(page.locator('#board-inspector-heading')).toBeVisible();
		await expect(page.getByTestId('ticket-inspector')).toContainText(key);
		await shot(page, 'new-ticket-ref-inspector');

		const sent = await starts();
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ ref: REF });
		expect(sent[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
		await html();
		expect(problems).toEqual([]);
	});
});

test.describe('brief mode', () => {
	const { base, starts } = scenario(7703, 4103, { startAddsTicket: true });

	test('sends exactly {id, text}', async ({ page }) => {
		const { problems, html } = guard(page, base);
		await openNew(page, base);
		await refInput(page).fill(REF); // the other mode's draft is not sent
		await fillBrief(page);
		await shot(page, 'new-ticket-brief-filled');
		await submit(page).click();
		await expect(page).toHaveURL(/\/\?ticket=fake-started-\d{8}$/, { timeout: 15_000 });
		await expect(page.getByTestId('ticket-inspector')).toBeVisible();
		const sent = await starts();
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ id: ID, text: BRIEF });
		expect(sent[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
		await html();
		expect(problems).toEqual([]);
	});
});

test.describe('one start per action', () => {
	const { base, starts } = scenario(7704, 4104, { startAddsTicket: true, commandDelayMs: 1_500 });

	test('a double-click and repeated Enter send one command', async ({ page }) => {
		await openNew(page, base);
		const input = refInput(page);
		await input.fill(REF);
		await submit(page).dblclick();
		await expect(submit(page)).toHaveText('Starting…');
		for (let i = 0; i < 5; i++) await input.press('Enter');
		await shot(page, 'new-ticket-starting');
		await expect(page).toHaveURL(/\/\?ticket=fake-started-/, { timeout: 15_000 });
		const sent = await starts();
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ ref: REF });
	});
});

for (const [name, fakePort, appPort, problem, mode, field, message] of [
	['umbrella issue', 7705, 4105, problemUmbrellaIssue, 'ref', 'ref', START_FAILURES.umbrella],
	[
		'tracker unavailable',
		7706,
		4106,
		problemTrackerUnavailable,
		'ref',
		'ref',
		START_FAILURES.tracker
	],
	['conflict', 7707, 4107, problemStartConflict, 'brief', 'id', START_FAILURES.conflictId],
	[
		'validation',
		7708,
		4108,
		problemStartBriefValidation,
		'brief',
		'text',
		problemStartBriefValidation.errors[1]!.message
	]
] as const) {
	test.describe(`a rejected start: ${name}`, () => {
		const { base, starts } = scenario(fakePort, appPort, {
			failCommand: { commands: ['start'], problem }
		});

		test('shows the error next to its field and keeps the draft', async ({ page }) => {
			const { problems, html } = guard(page, base);
			await openNew(page, base);
			if (mode === 'ref') await refInput(page).fill(REF);
			else await fillBrief(page);
			await submit(page).click();
			const error = page.getByTestId(`composer-${field}-error`);
			await expect(error).toHaveText(message);
			await expect(composer(page)).toHaveAttribute('data-phase', 'rejected');
			await expect(page).toHaveURL(`${base}/new`);
			if (mode === 'ref') {
				await expect(refInput(page)).toHaveValue(REF);
			} else {
				await expect(page.getByRole('textbox', { name: 'ID' })).toHaveValue(ID);
				await expect(page.getByRole('textbox', { name: 'Brief' })).toHaveValue(BRIEF);
			}
			await expect(submit(page)).toBeEnabled();
			expect(await starts()).toHaveLength(1);
			await shot(page, `new-ticket-rejected-${name.replace(' ', '-')}`);
			await html();
			expect(problems).toEqual([]);
		});
	});
}

test.describe('cancel', () => {
	const { base, starts } = scenario(7709, 4109);

	test('returns to the previous page and sends nothing', async ({ page }) => {
		await gotoLive(page, `${base}/tickets`);
		await navNew(page).click();
		await expect(page).toHaveURL(`${base}/new`);
		await refInput(page).fill(REF);
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page).toHaveURL(`${base}/tickets`);
		expect(await starts()).toHaveLength(0);
	});

	test('without history it goes to the board', async ({ page }) => {
		await openNew(page, base);
		await fillBrief(page);
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page).toHaveURL(`${base}/`);
		expect(await starts()).toHaveLength(0);
	});
});
