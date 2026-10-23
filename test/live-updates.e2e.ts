import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import { eventStart, eventValidationFinished } from '../src/lib/factory/fixtures/events.ts';
import { ticketActiveInPlan, ticketActiveInWork } from '../src/lib/factory/fixtures/tickets.ts';
import {
	FAKE_FACTORY_TOKEN,
	startFakeFactory,
	type FakeEventInput,
	type FakeFactory,
	type FakeFactoryOptions
} from './fake-factory';

// Ticket #22, task 03: the live controller in the built app, against its own
// fake factory. Events appended through the fake's probe reach the browser over
// `/api/factory/events`; the pages reread what the events name.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions, token?: string) {
	const state: { fake?: Server; factory?: FakeFactory; app?: ChildProcess } = {};
	test.beforeAll(async () => {
		({ server: state.fake, fake: state.factory } = await startFakeFactory(fakePort, options));
		state.app = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(appPort),
				FACTORY_API_URL: `http://127.0.0.1:${fakePort}`,
				FACTORY_API_TOKEN: token ?? FAKE_FACTORY_TOKEN
			},
			stdio: 'ignore'
		});
		await expect
			.poll(
				() =>
					fetch(`http://localhost:${appPort}/robots.txt`).then(
						(r) => r.status > 0,
						() => false
					),
				{ timeout: 30_000 }
			)
			.toBe(true);
	});
	test.afterAll(async () => {
		state.app?.kill();
		await new Promise((resolve) => state.fake?.close(resolve));
	});
	const fakeUrl = `http://127.0.0.1:${fakePort}`;
	return {
		base: `http://localhost:${appPort}`,
		fakeUrl,
		factory: () => state.factory!,
		append: (input: FakeEventInput) =>
			fetch(`${fakeUrl}/__fake/events`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(input)
			}).then((r) => r.json() as Promise<{ revision: number }>),
		drop: () => fetch(`${fakeUrl}/__fake/events/drop`, { method: 'POST' })
	};
}

/**
 * Record every request the page makes and every response body it receives,
 * so a test can assert the factory origin and token never reach the browser.
 */
function watch(page: Page, fakePort: number) {
	const urls: string[] = [];
	const bodies: Promise<string>[] = [];
	page.on('request', (request) => urls.push(request.url()));
	page.on('response', (response) => {
		// The event stream never ends while the page is open; its frames are checked below.
		if (response.url().includes('/api/factory/events')) return;
		bodies.push(response.text().catch(() => ''));
	});
	return async () => {
		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls) {
			expect(url).not.toContain(`:${fakePort}`);
		}
		for (const body of await Promise.all(bodies)) {
			expect(body).not.toContain(FAKE_FACTORY_TOKEN);
			expect(body).not.toContain(`127.0.0.1:${fakePort}`);
		}
	};
}

const status = (page: Page) => page.locator('header [data-slot="connection-status"]');

/** A ticket the fake does not list until the `start` event adds it. */
const started = {
	...ticketActiveInPlan,
	id: 'tkt_live_1',
	key: 'dpaez-factory-dashboard-99-live0001',
	displayRef: 'dpaez/factory-dashboard#99',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/99',
	title: 'Started from Pi while the dashboard was open'
};

test.describe('live updates', () => {
	const live = scenario(7901, 4301, { heartbeatMs: 1_000 });

	test('AC1: a start event adds the ticket to / and /tickets without a reload; the header is Live', async ({
		browser
	}) => {
		const context = await browser.newContext();
		const board = await context.newPage();
		const tickets = await context.newPage();
		const checkBoard = watch(board, 7901);
		const checkTickets = watch(tickets, 7901);
		await board.goto(`${live.base}/`);
		await tickets.goto(`${live.base}/tickets`);
		await expect(status(board)).toHaveAttribute('data-state', 'live');
		await expect(status(tickets)).toHaveAttribute('data-state', 'live');
		await expect(status(board)).toContainText('Live');
		await expect.poll(() => live.factory().openStreams()).toBe(2);

		// A full reload would replace this marker; a client-side refetch keeps it.
		await board.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
		const card = board.locator(`[data-slot="ticket-card"][data-ticket-key="${started.key}"]`);
		await expect(card).toHaveCount(0);
		await expect(tickets.getByRole('link', { name: started.displayRef })).toHaveCount(0);

		await live.append({
			kind: 'start',
			payload: { ...eventStart, ticket: started.key },
			addTicket: { summary: started }
		});

		await expect(card).toBeVisible();
		await expect(
			tickets.getByRole('link', { name: started.displayRef, exact: true })
		).toBeVisible();
		expect(await board.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
		await shot(board, 'live-ac1-board');
		await shot(tickets, 'live-ac1-tickets');

		await checkBoard();
		await checkTickets();
		await context.close();
	});

	test('AC2: the ticket page rereads on its own event, not on another ticket', async ({ page }) => {
		const reads: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('__data.json')) reads.push(request.url());
		});
		await page.goto(`${live.base}/tickets/${encodeURIComponent(ticketActiveInWork.key)}`);
		await expect(status(page)).toHaveAttribute('data-state', 'live');
		// The first open refetches once; wait for it to settle.
		await expect.poll(() => reads.length).toBeGreaterThanOrEqual(1);
		await page.waitForTimeout(500);
		const before = reads.length;

		await live.append({ kind: 'start', payload: { ...eventStart, ticket: 'some-other-ticket' } });
		await page.waitForTimeout(800);
		expect(reads.length).toBe(before);

		await live.append({ kind: 'validation_finished', payload: eventValidationFinished });
		await expect.poll(() => reads.length).toBe(before + 1);
		expect(reads.at(-1)).toContain(`/tickets/${encodeURIComponent(ticketActiveInWork.key)}/`);
	});

	test('AC3: a dropped stream shows Reconnecting, then Live; the reconnect sends the last revision', async ({
		page
	}) => {
		await page.goto(`${live.base}/`);
		await expect(status(page)).toHaveAttribute('data-state', 'live');
		await expect.poll(() => live.factory().openStreams()).toBeGreaterThanOrEqual(1);
		const { revision } = await live.append({
			kind: 'validation_finished',
			payload: eventValidationFinished
		});
		// Let the browser receive it before the drop.
		await page.waitForTimeout(500);
		const before = live.factory().connections.length;

		await live.drop();
		await expect(status(page)).toHaveAttribute('data-state', 'reconnecting');
		await expect(status(page)).toContainText('Reconnecting');
		await shot(page, 'live-ac3-reconnecting');
		await expect(status(page)).toHaveAttribute('data-state', 'live', { timeout: 10_000 });

		const reconnect = live.factory().connections.slice(before);
		expect(reconnect.map((c) => c.lastEventId)).toContain(String(revision));
	});
});

test.describe('refused token', () => {
	const refused = scenario(7902, 4302, {}, 'not-the-factory-token');

	test('AC4: the header shows Authentication failed and does not retry on its own', async ({
		page
	}) => {
		const streams: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/api/factory/events')) streams.push(request.url());
		});
		const check = watch(page, 7902);
		await page.goto(`${refused.base}/`);
		await expect(status(page)).toHaveAttribute('data-state', 'auth_failed');
		await expect(status(page)).toContainText('Authentication failed');
		await expect(status(page)).not.toContainText('Live');
		await shot(page, 'live-ac4-auth-failed');
		const opened = streams.length;
		await page.waitForTimeout(2_500);
		expect(streams.length).toBe(opened);
		await check();
	});
});
