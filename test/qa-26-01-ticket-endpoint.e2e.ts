import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type APIResponse, type Page } from '@playwright/test';

import {
	ticketDetailActiveInQa,
	ticketDetailMultiExecution,
	ticketDetailMultiExecutionFirst
} from '../src/lib/factory/fixtures/tickets.ts';
import { FAKE_FACTORY_TOKEN, startFakeFactory, type FakeFactoryOptions } from './fake-factory';

// QA for ticket #26, task 01: the inspector's safe ticket read endpoint.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const api = (key: string, query = '') => `/api/factory/tickets/${encodeURIComponent(key)}${query}`;

/** Asserts a body leaks no factory secret, URL, host or raw upstream body. */
async function expectSafe(response: APIResponse, fakePort: number, token: string) {
	const text = await response.text();
	expect.soft(text).not.toContain(token);
	expect.soft(text).not.toContain(`127.0.0.1:${fakePort}`);
	expect.soft(text).not.toContain('127.0.0.1');
	expect.soft(text).not.toContain('localhost');
	expect.soft(text).not.toContain('Bearer');
	expect.soft(text).not.toContain('/v1/');
	return JSON.parse(text);
}

test('AC1: the endpoint answers 200 with the ticket title, execution, tasks and runs', async ({
	request
}) => {
	const response = await request.get(api(ticketDetailActiveInQa.key));
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe('no-store');
	const body = await response.json();
	expect(body.ok).toBe(true);
	expect(body.detail.header.key).toBe(ticketDetailActiveInQa.key);
	expect(body.detail.header.title).toBe(ticketDetailActiveInQa.title);
	expect(body.detail.header.execution).toBe(ticketDetailActiveInQa.execution);
	expect(body.detail.header.current).toBe(true);
	expect(body.detail.tasks.map((task: { id: string }) => task.id)).toEqual(
		ticketDetailActiveInQa.tasks.map((task) => task.id)
	);
	expect(body.detail.runs.length).toBeGreaterThan(0);
	expect(typeof body.runsComplete).toBe('boolean');
});

test('AC2: ?execution=1 on the multi-execution ticket answers execution 1, not current', async ({
	request
}) => {
	const response = await request.get(api(ticketDetailMultiExecution.key, '?execution=1'));
	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.ok).toBe(true);
	expect(body.detail.header.execution).toBe(1);
	expect(body.detail.header.current).toBe(false);
	const selected = body.detail.executions.find((e: { selected: boolean }) => e.selected);
	expect(selected.generation).toBe(1);
	expect(selected.current).toBe(false);
});

test('AC3: an unknown key answers 404 and an invalid execution answers 400, both safe', async ({
	request
}) => {
	const unknown = await request.get(api('no-such-ticket-0000'));
	expect(unknown.status()).toBe(404);
	const unknownBody = await expectSafe(unknown, 7799, 'fake-factory-token-e2e');
	expect(unknownBody).toMatchObject({ ok: false, failure: { type: 'ticket_not_found' } });
	expect(typeof unknownBody.failure.title).toBe('string');
	expect(typeof unknownBody.failure.retryable).toBe('boolean');

	for (const bad of ['0', '-1', 'abc', '1.5', '99999999999999999999']) {
		const invalid = await request.get(api(ticketDetailMultiExecution.key, `?execution=${bad}`));
		expect.soft(invalid.status(), `execution=${bad}`).toBe(400);
		const body = await expectSafe(invalid, 7799, 'fake-factory-token-e2e');
		expect.soft(body).toMatchObject({ ok: false, failure: { type: 'invalid', retryable: false } });
	}
});

test('AC4: success and failure responses on the default fake leak no token, URL or host', async ({
	request
}) => {
	for (const path of [
		api(ticketDetailActiveInQa.key),
		api(ticketDetailMultiExecution.key, '?execution=1'),
		api(ticketDetailMultiExecution.key, '?execution=42'),
		api('no-such-ticket-0000'),
		api(ticketDetailActiveInQa.key, '?execution=nope')
	]) {
		await expectSafe(await request.get(path), 7799, 'fake-factory-token-e2e');
	}
});

test('AC5: the detail page still renders the current and a past execution', async ({ page }) => {
	const detail = `/tickets/${encodeURIComponent(ticketDetailActiveInQa.key)}`;
	const current = await page.goto(detail);
	expect(current?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(ticketDetailActiveInQa.title);
	await expect(page.getByTestId('tasks')).toBeVisible();
	await shot(page, 'ac5-detail-current');

	const pastPath = `/tickets/${encodeURIComponent(ticketDetailMultiExecution.key)}?execution=1`;
	const past = await page.goto(pastPath);
	expect(past?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(
		ticketDetailMultiExecutionFirst.title
	);
	await expect(page.getByTestId('timeline')).toHaveAttribute('data-stage', 'done');
	await shot(page, 'ac5-detail-execution-1');
});

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions, token: string) {
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, options));
		app = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(appPort),
				FACTORY_API_URL: `http://127.0.0.1:${fakePort}`,
				FACTORY_API_TOKEN: token
			},
			stdio: 'ignore'
		});
		await expect
			.poll(
				async () => {
					try {
						return (await fetch(`http://localhost:${appPort}/robots.txt`)).status > 0;
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
	return `http://localhost:${appPort}`;
}

const SAFE_KEYS = ['type', 'title', 'detail', 'retryable'];

test.describe('AC4: the factory rejects the token', () => {
	const token = 'qa-26-01-wrong-token-secret';
	const base = scenario(7861, 4261, {}, token);
	test('AC4: a factory 401 becomes a safe failure body', async ({ request }) => {
		const response = await request.get(`${base}${api(ticketDetailActiveInQa.key)}`);
		expect(response.status()).toBeGreaterThanOrEqual(400);
		const body = await expectSafe(response, 7861, token);
		expect(body.ok).toBe(false);
		expect(Object.keys(body.failure).every((key) => SAFE_KEYS.includes(key))).toBe(true);
	});
});

test.describe('AC4: the factory fails the runs read', () => {
	const base = scenario(
		7862,
		4262,
		{ failRuns: { status: 500, title: 'Internal error', type: 'internal_error' } },
		FAKE_FACTORY_TOKEN
	);
	test('AC4: an upstream runs failure becomes a safe failure body', async ({ request }) => {
		const response = await request.get(`${base}${api(ticketDetailActiveInQa.key)}`);
		expect(response.status()).toBeGreaterThanOrEqual(400);
		const body = await expectSafe(response, 7862, FAKE_FACTORY_TOKEN);
		expect(body.ok).toBe(false);
		expect(body.detail).toBeUndefined();
		expect(Object.keys(body.failure).every((key) => SAFE_KEYS.includes(key))).toBe(true);
	});
});
