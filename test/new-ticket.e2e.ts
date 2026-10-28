import type { Page } from '@playwright/test';

import {
	problemStartBriefValidation,
	problemStartConflict,
	problemTrackerUnavailable,
	problemUmbrellaIssue
} from '../src/lib/factory/fixtures/problems.ts';
import { START_FAILURES } from '../src/lib/factory/start.ts';
import { expect, gotoLive, test, type FakeFixture } from './fixtures.ts';

// The New ticket action and the /new composer: issue and brief modes, one
// start per action, the handoff to the new ticket's inspector, field-level
// failures that keep the draft, and Cancel.

const REF = 'dpaez/factory-dashboard#77';
const ID = 'dark-mode-audit';
const BRIEF = 'Audit every story in dark mode and list contrast failures.';

/** The start commands the fake received in this test. */
const starts = (fake: FakeFixture) => fake.commands().filter((c) => c.command === 'start');

/** No browser request names the token or leaves the origin; no answer names the token or the factory. */
function guard(page: Page, origin: string, token: string) {
	const leaks = [token, '127.0.0.1:', 'Bearer '];
	const problems: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.origin !== origin) problems.push(`off-origin ${request.url()}`);
		if (JSON.stringify(request.headers()).includes(token)) {
			problems.push(`token in request ${url.pathname}`);
		}
	});
	page.on('response', async (response) => {
		const url = new URL(response.url());
		if (url.pathname.startsWith('/api/factory/events')) return; // never ends
		const text = await response.text().catch(() => '');
		for (const leak of leaks) {
			if (text.includes(leak)) problems.push(`${url.pathname} answer leaks ${leak}`);
		}
	});
	return {
		problems,
		async html() {
			const html = await page.content();
			for (const leak of leaks) {
				if (html.includes(leak)) problems.push(`page HTML leaks ${leak}`);
			}
		}
	};
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });
const navNew = (page: Page) => nav(page).getByRole('link', { name: 'New ticket' });
const composer = (page: Page) => page.locator('[data-slot="ticket-composer"]');
const refInput = (page: Page) => page.getByRole('textbox', { name: 'Issue reference' });
const idInput = (page: Page) => page.getByRole('textbox', { name: 'ID' });
const briefInput = (page: Page) => page.getByRole('textbox', { name: 'Brief' });
const submit = (page: Page) => page.getByTestId('composer-submit');

/** Open /new, which has no load of its own: wait for hydration and the live stream. */
async function openNew(page: Page) {
	await page.goto('/new');
	await expect(page.locator('header [data-slot="connection-status"]')).toHaveAttribute(
		'data-state',
		'live'
	);
}

async function fillBrief(page: Page) {
	await page.getByRole('tab', { name: 'Written brief' }).click();
	await idInput(page).fill(ID);
	await briefInput(page).fill(BRIEF);
}

function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('the nav New ticket action opens the composer at /new, current there', async ({
	page,
	app,
	fake,
	shot
}) => {
	await gotoLive(page, '/');
	await expect(navNew(page)).not.toHaveAttribute('aria-current');
	await navNew(page).click();
	await expect(page).toHaveURL(`${app.url}/new`);
	await expect(page.getByRole('heading', { name: 'New ticket' })).toBeVisible();
	await expect(composer(page)).toBeVisible();
	await expect(refInput(page)).toBeVisible();
	await expect(submit(page)).toHaveText('Start planning');
	await expect(navNew(page)).toHaveAttribute('aria-current', 'page');
	await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
	await shot('new-ticket-composer');
	expect(starts(fake)).toHaveLength(0);
});

test.describe('a start the factory accepts', () => {
	test.use({ fakeOptions: { startAddsTicket: true } });

	test('issue mode sends exactly {ref} once and opens the started ticket’s inspector', async ({
		page,
		app,
		fake,
		shot
	}) => {
		const { problems, html } = guard(page, app.url, fake.token);
		await openNew(page);
		await refInput(page).fill(`  ${REF} `);
		await submit(page).click();
		await expect(page).toHaveURL(/\/\?ticket=fake-started-\d{8}$/, { timeout: 15_000 });
		const key = new URL(page.url()).searchParams.get('ticket')!;
		await expect(page.locator('#board-inspector-heading')).toBeVisible();
		await expect(page.getByTestId('ticket-inspector')).toContainText(key);
		await shot('new-ticket-ref-inspector');

		const sent = starts(fake);
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ ref: REF });
		expect(sent[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
		await html();
		expect(problems).toEqual([]);
	});

	test('brief mode sends exactly {id, text} once, not the other mode’s draft', async ({
		page,
		app,
		fake,
		shot
	}) => {
		const { problems, html } = guard(page, app.url, fake.token);
		await openNew(page);
		await refInput(page).fill(REF); // the other mode's draft is not sent
		await fillBrief(page);
		await shot('new-ticket-brief-filled');
		await submit(page).click();
		await expect(page).toHaveURL(/\/\?ticket=fake-started-\d{8}$/, { timeout: 15_000 });
		await expect(page.getByTestId('ticket-inspector')).toBeVisible();
		const sent = starts(fake);
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ id: ID, text: BRIEF });
		expect(sent[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
		await html();
		expect(problems).toEqual([]);
	});
});

test.describe('a slow factory', () => {
	test.use({ fakeOptions: { startAddsTicket: true, commandDelayMs: 1_500 } });

	test('a double-click and repeated Enter on Start planning send one command', async ({
		page,
		fake,
		shot
	}) => {
		await openNew(page);
		await refInput(page).fill(REF);
		await submit(page).dblclick();
		await expect(submit(page)).toHaveText('Starting…');
		for (let i = 0; i < 5; i++) await refInput(page).press('Enter');
		await shot('new-ticket-starting');
		await expect(page).toHaveURL(/\/\?ticket=fake-started-/, { timeout: 15_000 });
		const sent = starts(fake);
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ ref: REF });
	});

	test('nothing claims running before acceptance; then the inspector shows the factory’s status', async ({
		page,
		app,
		shot
	}) => {
		await openNew(page);
		await fillBrief(page);
		await submit(page).click();
		await expect(submit(page)).toHaveText('Starting…');
		await expect(page).toHaveURL(`${app.url}/new`);
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
		await shot('new-ticket-board-inspector');
	});
});

for (const [name, problem, mode, field, message] of [
	['umbrella issue', problemUmbrellaIssue, 'ref', 'ref', START_FAILURES.umbrella],
	['tracker unavailable', problemTrackerUnavailable, 'ref', 'ref', START_FAILURES.tracker],
	['conflict', problemStartConflict, 'brief', 'id', START_FAILURES.conflictId],
	[
		'validation',
		problemStartBriefValidation,
		'brief',
		'text',
		problemStartBriefValidation.errors[1]!.message
	]
] as const) {
	test.describe(`a rejected start: ${name}`, () => {
		test.use({ fakeOptions: { failCommand: { commands: ['start'], problem } } });

		test('shows the error next to its field and keeps the draft', async ({
			page,
			app,
			fake,
			shot
		}) => {
			const { problems, html } = guard(page, app.url, fake.token);
			await openNew(page);
			if (mode === 'ref') await refInput(page).fill(REF);
			else await fillBrief(page);
			await submit(page).click();
			await expect(page.getByTestId(`composer-${field}-error`)).toHaveText(message);
			// "Next to its field": the field names the message as its description.
			const input =
				field === 'ref' ? refInput(page) : field === 'id' ? idInput(page) : briefInput(page);
			await expect(input).toHaveAccessibleDescription(new RegExp(escapeRegExp(message)));
			await expect(composer(page)).toHaveAttribute('data-phase', 'rejected');
			await expect(page).toHaveURL(`${app.url}/new`);
			if (mode === 'ref') {
				await expect(refInput(page)).toHaveValue(REF);
			} else {
				await expect(idInput(page)).toHaveValue(ID);
				await expect(briefInput(page)).toHaveValue(BRIEF);
			}
			await expect(submit(page)).toBeEnabled();
			expect(starts(fake)).toHaveLength(1);
			await shot(`new-ticket-rejected-${name.replace(' ', '-')}`);
			await html();
			expect(problems).toEqual([]);
		});
	});
}

test.describe('cancel', () => {
	test('returns to the previous page and sends nothing', async ({ page, app, fake }) => {
		await gotoLive(page, '/tickets');
		await navNew(page).click();
		await expect(page).toHaveURL(`${app.url}/new`);
		await refInput(page).fill(REF);
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page).toHaveURL(`${app.url}/tickets`);
		expect(starts(fake)).toHaveLength(0);
	});

	test('without history it goes to the board and sends nothing', async ({ page, app, fake }) => {
		await openNew(page);
		await fillBrief(page);
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page).toHaveURL(`${app.url}/`);
		expect(starts(fake)).toHaveLength(0);
	});
});
