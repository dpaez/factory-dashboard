import { isHttpError, isRedirect } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executionList, ticketDetailMultiExecution } from '$lib/factory/fixtures';

import {
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	type FakeFactoryOptions
} from '../../../../test/fake-factory';
import { load } from './+page.server';

vi.mock('$env/dynamic/private', () => ({
	env: {
		get FACTORY_API_URL() {
			return process.env.FACTORY_API_URL;
		},
		get FACTORY_API_TOKEN() {
			return process.env.FACTORY_API_TOKEN;
		},
		get FACTORY_OPERATOR_NAME() {
			return process.env.FACTORY_OPERATOR_NAME;
		}
	}
}));

const FACTORY_HOST = 'factory.resolver-test.internal';
const FACTORY_URL = `http://${FACTORY_HOST}:7731`;
const MULTI = ticketDetailMultiExecution.key;
const [FIRST, CURRENT] = executionList.items;
const UPSTREAM_DETAIL = 'upstream problem detail must not leak';

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
});

function search(params: Record<string, string>): string {
	return `?${new URLSearchParams(params)}`;
}

async function outcome(
	query: string,
	options: FakeFactoryOptions = {},
	wrap: (handle: (request: Request) => Promise<Response>) => typeof fetch = (handle) =>
		handle as typeof fetch
) {
	const fake = createFakeFactory(options);
	const event = {
		fetch: wrap(fake.handle),
		params: {},
		url: new URL(`http://dashboard.local/stats/execution${query}`)
	} as unknown as Parameters<typeof load>[0];
	try {
		await load(event);
	} catch (cause) {
		return { cause, requests: fake.requests };
	}
	throw new Error('load neither redirected nor failed');
}

async function redirected(query: string) {
	const { cause, requests } = await outcome(query);
	if (!isRedirect(cause)) throw cause;
	return { status: cause.status, location: cause.location, requests };
}

async function pageError(query: string, options: FakeFactoryOptions = {}) {
	const { cause, requests } = await outcome(query, options);
	if (!isHttpError(cause)) throw cause;
	return { status: cause.status, body: cause.body, requests };
}

function expectNoLeak(value: unknown) {
	const text = JSON.stringify(value);
	expect(text).not.toContain(FAKE_FACTORY_TOKEN);
	expect(text).not.toContain(FACTORY_HOST);
	expect(text).not.toContain(UPSTREAM_DETAIL);
}

describe('/stats/execution load', () => {
	it("303s a past execution's start to that generation", async () => {
		const { status, location, requests } = await redirected(
			search({ key: MULTI, startedAt: FIRST!.createdAt })
		);
		expect(status).toBe(303);
		expect(location).toBe(`/tickets/${encodeURIComponent(MULTI)}?execution=1`);
		expect(requests.map((r) => [r.method, r.path])).toEqual([
			['GET', `/v1/tickets/${MULTI}/executions`]
		]);
	});

	it('names the current generation too, so the link is stable', async () => {
		const { status, location } = await redirected(
			search({ key: MULTI, startedAt: CURRENT!.createdAt })
		);
		expect(status).toBe(303);
		expect(location).toBe(`/tickets/${encodeURIComponent(MULTI)}?execution=${CURRENT!.generation}`);
	});

	it('404s a start that matches no execution, never falling back to the current one', async () => {
		const { status, body } = await pageError(
			search({ key: MULTI, startedAt: '2026-10-05T08:00:01Z' })
		);
		expect(status).toBe(404);
		expect(body).toEqual({ kind: 'not_found', message: 'No such execution in this ticket' });
	});

	it('404s an ambiguous start that matches more than one execution', async () => {
		const items = [FIRST!, { ...CURRENT!, createdAt: FIRST!.createdAt }];
		const { cause } = await outcome(
			search({ key: MULTI, startedAt: FIRST!.createdAt }),
			{},
			(handle) => async (input) => {
				const request = input as Request;
				return new URL(request.url).pathname.endsWith('/executions')
					? Response.json({ items })
					: handle(request);
			}
		);
		if (!isHttpError(cause)) throw cause;
		expect(cause.status).toBe(404);
		expect(cause.body.message).toBe('No such execution in this ticket');
	});

	it.each([
		['no key', search({ startedAt: FIRST!.createdAt })],
		['an empty key', search({ key: '', startedAt: FIRST!.createdAt })],
		['no startedAt', search({ key: MULTI })],
		['an empty startedAt', search({ key: MULTI, startedAt: '' })]
	])('400s %s without reading the factory', async (_, query) => {
		const { status, body, requests } = await pageError(query);
		expect(status).toBe(400);
		expect(body).toMatchObject({ kind: 'invalid', message: 'Invalid execution link' });
		expect(requests).toEqual([]);
	});

	it('404s an unknown ticket', async () => {
		const { status, body } = await pageError(
			search({ key: 'nobody/nothing#0', startedAt: FIRST!.createdAt })
		);
		expect(status).toBe(404);
		expect(body).toEqual({ kind: 'not_found', message: 'No such ticket' });
		expectNoLeak(body);
	});

	it('makes an unauthorized read the configuration error, with no Problem detail', async () => {
		const { status, body } = await pageError(search({ key: MULTI, startedAt: FIRST!.createdAt }), {
			token: 'another-token'
		});
		expect(status).toBe(503);
		expect(body).toEqual({
			kind: 'configuration',
			message: 'The dashboard cannot reach the factory'
		});
		expectNoLeak(body);
	});

	it('makes missing configuration the configuration error, naming the variable only', async () => {
		delete process.env.FACTORY_API_TOKEN;
		const { status, body } = await pageError(search({ key: MULTI, startedAt: FIRST!.createdAt }));
		expect(status).toBe(503);
		expect(body).toMatchObject({ kind: 'configuration', detail: 'Missing FACTORY_API_TOKEN.' });
		expectNoLeak(body);
	});

	it('makes another failure the safe error, with no upstream detail', async () => {
		const { status, body } = await pageError(search({ key: MULTI, startedAt: FIRST!.createdAt }), {
			failExecutions: {
				status: 503,
				title: 'Factory unavailable',
				type: 'internal_error',
				detail: UPSTREAM_DETAIL
			}
		});
		expect(status).toBe(503);
		expect(body).toEqual({ kind: 'unavailable', message: 'Factory unavailable' });
		expectNoLeak(body);
	});
});
