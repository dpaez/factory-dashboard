import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import { eventStart, eventValidationFinished } from '../src/lib/factory/fixtures/events.ts';
import { ticketActiveInPlan, ticketActiveInWork } from '../src/lib/factory/fixtures/tickets.ts';
import {
	FAKE_FACTORY_TOKEN,
	startFakeFactory,
	ticketDetails,
	type FakeEventInput,
	type FakeFactory,
	type FakeFactoryOptions
} from './fake-factory';
import { gotoLive } from './live';

// QA for ticket #22, task 03: the live controller in the built app, seen from a browser.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

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

const status = (page: Page) => page.locator('header [data-slot="connection-status"]');
const markPage = (page: Page) =>
	page.evaluate(() => ((window as unknown as { qaMarker: number }).qaMarker = 1));
const pageMarker = (page: Page) =>
	page.evaluate(() => (window as unknown as { qaMarker?: number }).qaMarker);

const newTicket = {
	...ticketActiveInPlan,
	id: 'tkt_qa_live_1',
	key: 'dpaez-factory-dashboard-98-qa000001',
	displayRef: 'dpaez/factory-dashboard#98',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/98',
	title: 'QA: ticket started while the dashboard is open'
};

test.describe('live controller', () => {
	const live = scenario(7911, 4311, { heartbeatMs: 1_000 });

	test('AC1: a newly started ticket appears on / and /tickets without a reload', async ({
		browser
	}) => {
		const context = await browser.newContext();
		const board = await context.newPage();
		const list = await context.newPage();
		await board.goto(`${live.base}/`);
		await list.goto(`${live.base}/tickets`);
		await expect(status(board)).toContainText('Live');
		await expect(status(list)).toContainText('Live');
		await expect(board.getByText(newTicket.title)).toHaveCount(0);
		await expect(list.getByText(newTicket.title)).toHaveCount(0);
		await markPage(board);
		await markPage(list);

		await live.append({
			kind: 'start',
			payload: { ...eventStart, ticket: newTicket.key },
			addTicket: { summary: newTicket }
		});

		await expect(board.getByText(newTicket.title).first()).toBeVisible();
		await expect(list.getByText(newTicket.title).first()).toBeVisible();
		expect(await pageMarker(board)).toBe(1);
		expect(await pageMarker(list)).toBe(1);
		await shot(board, 'ac1-board-new-ticket');
		await shot(list, 'ac1-tickets-new-ticket');
		await context.close();
	});

	test('AC3: Live, Reconnecting after a drop, Live again; the reconnect sends Last-Event-ID', async ({
		page
	}) => {
		await page.goto(`${live.base}/`);
		await expect(status(page)).toContainText('Live');
		await expect.poll(() => live.factory().openStreams()).toBeGreaterThanOrEqual(1);
		const { revision } = await live.append({
			kind: 'validation_finished',
			payload: eventValidationFinished
		});
		await page.waitForTimeout(500);
		const before = live.factory().connections.length;

		await live.drop();
		await expect(status(page)).toContainText('Reconnecting');
		await shot(page, 'ac3-reconnecting');
		await expect(status(page)).toContainText('Live', { timeout: 10_000 });
		await expect(status(page)).not.toContainText('Reconnecting');
		const ids = live
			.factory()
			.connections.slice(before)
			.map((c) => c.lastEventId);
		expect(ids).toContain(String(revision));
	});

	test('AC7: the browser never requests the factory origin or receives its token or URL', async ({
		page
	}) => {
		const urls: string[] = [];
		const bodies: Promise<string>[] = [];
		page.on('request', (r) => urls.push(r.url()));
		page.on('response', (r) => {
			if (r.url().includes('/api/factory/events')) return;
			bodies.push(r.text().catch(() => ''));
		});
		const frames: string[] = [];
		await page.goto(`${live.base}/`);
		await expect(status(page)).toContainText('Live');
		await live.append({ kind: 'validation_finished', payload: eventValidationFinished });
		await page.goto(`${live.base}/tickets`);
		await expect(status(page)).toContainText('Live');
		await page.goto(`${live.base}/tickets/${encodeURIComponent(ticketActiveInWork.key)}`);
		await expect(status(page)).toContainText('Live');
		// The stream's frames, read from the dashboard's own endpoint.
		frames.push(
			await page.evaluate(async () => {
				const controller = new AbortController();
				const res = await fetch('/api/factory/events?since=0', { signal: controller.signal });
				const reader = res.body!.getReader();
				const { value } = await reader.read();
				const more = await Promise.race([
					reader.read().then((r) => r.value),
					new Promise<undefined>((r) => setTimeout(r, 500))
				]);
				controller.abort();
				const decode = (v?: Uint8Array) => (v ? new TextDecoder().decode(v) : '');
				return decode(value) + decode(more);
			})
		);

		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls) expect(url).not.toContain(':7911');
		for (const body of [...(await Promise.all(bodies)), ...frames]) {
			expect(body).not.toContain(FAKE_FACTORY_TOKEN);
			expect(body).not.toContain('127.0.0.1:7911');
		}
	});
});

test.describe('ticket detail', () => {
	// Its own fake: the test changes a listed ticket's title.
	const own = scenario(7913, 4313, { heartbeatMs: 1_000 });

	test('AC2: the ticket page refreshes on its own event, not on another ticket', async ({
		page
	}) => {
		const key = ticketActiveInWork.key;
		const original = ticketDetails.get(key)!;
		const renamed = 'QA: renamed while the page is open';
		await gotoLive(page, `${own.base}/tickets/${encodeURIComponent(key)}`);
		await page.waitForTimeout(500);
		await expect(page.getByText(original.title).first()).toBeVisible();
		await markPage(page);

		// The factory now holds a new title, but the event names another ticket.
		await own.append({
			kind: 'start',
			payload: { ...eventStart, ticket: 'some-other-ticket' },
			addTicket: {
				summary: { ...ticketActiveInWork, title: renamed },
				detail: { ...original, title: renamed }
			}
		});
		await page.waitForTimeout(1_500);
		await expect(page.getByText(renamed)).toHaveCount(0);

		// An event for this ticket rereads it.
		await own.append({ kind: 'validation_finished', payload: { ...eventValidationFinished } });
		await expect(page.getByText(renamed).first()).toBeVisible();
		expect(await pageMarker(page)).toBe(1);
		await shot(page, 'ac2-ticket-detail-refreshed');
	});
});

test.describe('refused token', () => {
	const refused = scenario(7912, 4312, {}, 'qa-wrong-token');

	test('AC4: a refused token shows Authentication failed and does not retry on its own', async ({
		page
	}) => {
		let streams = 0;
		page.on('request', (r) => {
			if (r.url().includes('/api/factory/events')) streams += 1;
		});
		await page.goto(`${refused.base}/`);
		await expect(status(page)).toContainText('Authentication failed');
		await expect(status(page)).not.toContainText('Live');
		await expect(status(page).getByRole('button', { name: 'Retry' })).toBeVisible();
		await shot(page, 'ac4-auth-failed');
		const opened = streams;
		await page.waitForTimeout(3_000);
		expect(streams).toBe(opened);
		await expect(status(page)).toContainText('Authentication failed');
	});
});
