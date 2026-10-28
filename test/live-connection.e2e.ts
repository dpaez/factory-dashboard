import type { Page } from '@playwright/test';

import { eventStart, eventValidationFinished } from '../src/lib/factory/fixtures/events.ts';
import { ticketActiveInPlan, ticketActiveInWork } from '../src/lib/factory/fixtures/tickets.ts';
import { ticketDetails } from './fake-factory.ts';
import { expect, gotoLive, test, type FakeFixture } from './fixtures.ts';

// The live controller in the built app: events the fake emits reach the
// browser over /api/factory/events, the pages reread what each event names,
// and the header shows the connection state. The proxy itself is in
// events-proxy.e2e.ts; the controller's state machine in
// src/lib/factory/live.svelte.test.ts.

const status = (page: Page) => page.locator('header [data-slot="connection-status"]');

/** A full reload replaces the window; a client-side reread keeps this marker. */
const mark = (page: Page) =>
	page.evaluate(() => ((window as unknown as { liveMarker: number }).liveMarker = 1));
const marker = (page: Page) =>
	page.evaluate(() => (window as unknown as { liveMarker?: number }).liveMarker);

/** A ticket the fake does not list until the `start` event adds it. */
const started = {
	...ticketActiveInPlan,
	id: 'tkt_live_1',
	key: 'dpaez-factory-dashboard-99-live0001',
	displayRef: 'dpaez/factory-dashboard#99',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/99',
	title: 'Started from Pi while the dashboard was open'
};

/**
 * Record every request the page makes and every response body it receives,
 * so a test can assert the factory origin and token never reach the browser.
 */
function watch(page: Page, fake: FakeFixture) {
	const urls: string[] = [];
	const bodies: Promise<string>[] = [];
	page.on('request', (request) => urls.push(request.url()));
	page.on('response', (response) => {
		// The event stream never ends while the page is open; its frames are read separately.
		if (response.url().includes('/api/factory/events')) return;
		bodies.push(response.text().catch(() => ''));
	});
	return async (extra: string[] = []) => {
		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls) expect(url).not.toContain(new URL(fake.url).host);
		for (const body of [...(await Promise.all(bodies)), ...extra]) {
			expect(body).not.toContain(fake.token);
			expect(body).not.toContain(fake.url);
			expect(body).not.toContain('127.0.0.1');
		}
	};
}

test.describe('live updates', () => {
	test.use({ fakeOptions: { heartbeatMs: 1_000 } });

	test('a start event adds the ticket to / and /tickets without a reload, and nothing leaks', async ({
		page,
		fake,
		shot
	}) => {
		const tickets = await page.context().newPage();
		const checkBoard = watch(page, fake);
		const checkTickets = watch(tickets, fake);
		await gotoLive(page, '/');
		await gotoLive(tickets, '/tickets');
		await expect(status(page)).toContainText('Live');
		await expect.poll(() => fake.openStreams()).toBe(2);

		const card = page.locator(`[data-slot="ticket-card"][data-ticket-key="${started.key}"]`);
		await expect(card).toHaveCount(0);
		await expect(tickets.getByRole('link', { name: started.displayRef })).toHaveCount(0);
		await mark(page);
		await mark(tickets);

		fake.emit({
			kind: 'start',
			payload: { ...eventStart, ticket: started.key },
			addTicket: { summary: started }
		});

		await expect(card).toBeVisible();
		await expect(card).toContainText(started.title);
		await expect(
			tickets.getByRole('link', { name: started.displayRef, exact: true })
		).toBeVisible();
		expect(await marker(page)).toBe(1);
		expect(await marker(tickets)).toBe(1);
		await shot('live-board-new-ticket');
		await shot('live-tickets-new-ticket', tickets);

		// The stream's own frames, read through the dashboard's endpoint.
		const frames = await page.evaluate(async () => {
			const controller = new AbortController();
			const response = await fetch('/api/factory/events?since=0', { signal: controller.signal });
			const reader = response.body!.getReader();
			let text = '';
			while (!text.includes('event: start')) {
				const { done, value } = await reader.read();
				if (done) break;
				text += new TextDecoder().decode(value);
			}
			controller.abort();
			return text;
		});
		expect(frames).toContain(started.key);
		await checkBoard([frames]);
		await checkTickets();
		await tickets.close();
	});

	test('the ticket page rereads on its own event, not on another ticket’s', async ({
		page,
		fake,
		shot
	}) => {
		const key = ticketActiveInWork.key;
		const original = ticketDetails.get(key)!;
		const renamed = 'Renamed while the page is open';
		const reads: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('__data.json')) reads.push(request.url());
		});
		await gotoLive(page, `/tickets/${encodeURIComponent(key)}`);
		await expect(page.getByText(original.title).first()).toBeVisible();
		await mark(page);
		const before = reads.length;

		// The factory now holds a new title, but the event names another ticket.
		fake.emit({
			kind: 'start',
			payload: { ...eventStart, ticket: 'some-other-ticket' },
			addTicket: {
				summary: { ...ticketActiveInWork, title: renamed },
				detail: { ...original, title: renamed }
			}
		});
		// Longer than the controller's 150 ms coalescing window and a reread.
		await page.waitForTimeout(1_000);
		expect(reads).toHaveLength(before);
		await expect(page.getByText(renamed)).toHaveCount(0);

		// An event for this ticket rereads it, once, without a reload.
		fake.emit({ kind: 'validation_finished', payload: eventValidationFinished });
		await expect(page.getByText(renamed).first()).toBeVisible();
		expect(reads).toHaveLength(before + 1);
		expect(reads.at(-1)).toContain(`/tickets/${encodeURIComponent(key)}/`);
		expect(await marker(page)).toBe(1);
		await shot('live-ticket-page-reread');
	});

	test('a dropped stream shows Reconnecting, then Live; the reconnect sends the last revision', async ({
		page,
		fake,
		shot
	}) => {
		await gotoLive(page, '/');
		await expect.poll(() => fake.openStreams()).toBe(1);
		const reads: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('__data.json')) reads.push(request.url());
		});
		// The browser has received the event once the page rereads for it.
		const { revision } = fake.emit({
			kind: 'validation_finished',
			payload: eventValidationFinished
		});
		await expect.poll(() => reads.length).toBeGreaterThanOrEqual(1);
		const before = fake.connections().length;

		fake.dropStreams();
		await expect(status(page)).toHaveAttribute('data-state', 'reconnecting');
		await expect(status(page)).toContainText('Reconnecting');
		await shot('live-reconnecting');
		await expect(status(page)).toHaveAttribute('data-state', 'live', { timeout: 10_000 });
		await expect(status(page)).toContainText('Live');
		await expect(status(page)).not.toContainText('Reconnecting');

		const reconnect = fake.connections().slice(before);
		expect(reconnect.map((connection) => connection.lastEventId)).toContain(String(revision));
	});
});

test.describe('the factory refuses the token', () => {
	test.use({ fakeOptions: { token: 'not-the-dashboard-token' } });

	test('the header shows Authentication failed and does not retry on its own', async ({
		page,
		fake,
		shot
	}) => {
		let streams = 0;
		page.on('request', (request) => {
			if (request.url().includes('/api/factory/events')) streams += 1;
		});
		const check = watch(page, fake);
		await page.goto('/');
		await expect(status(page)).toHaveAttribute('data-state', 'auth_failed');
		await expect(status(page)).toContainText('Authentication failed');
		await expect(status(page)).not.toContainText('Live');
		await expect(status(page).getByRole('button', { name: 'Retry' })).toBeVisible();
		await shot('live-auth-failed');
		const opened = streams;
		// Longer than the controller's first two reconnect delays (1 s, 2 s).
		await page.waitForTimeout(3_000);
		expect(streams).toBe(opened);
		await expect(status(page)).toContainText('Authentication failed');
		expect(fake.openStreams()).toBe(0);
		await check();
	});
});
