import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BacklogResult } from '$lib/factory/backlog';
import { backlogIssues, problemTrackerUnavailable } from '$lib/factory/fixtures';

import {
	FAKE_BACKLOG_FETCHED_AT,
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	type FakeFactoryOptions
} from '../../../../../test/fake-factory';
import * as handlers from './+server';

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

const FACTORY_HOST = 'factory.backlog-handler-test.internal';
const FACTORY_URL = `http://${FACTORY_HOST}:7731`;
const UPSTREAM = 'upstream-secret-body-marker';

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
});

async function get(search = '', options: FakeFactoryOptions = {}) {
	const fake = createFakeFactory(options);
	const url = new URL(`http://dashboard.test/api/factory/backlog${search}`);
	const event = { fetch: fake.handle, url } as unknown as Parameters<typeof handlers.GET>[0];
	const response = await handlers.GET(event);
	const text = await response.text();
	return {
		status: response.status,
		text,
		body: JSON.parse(text) as BacklogResult,
		requests: fake.requests
	};
}

function expectSafe(text: string) {
	expect(text).not.toContain(FAKE_FACTORY_TOKEN);
	expect(text).not.toContain(FACTORY_URL);
	expect(text).not.toContain(FACTORY_HOST);
	expect(text).not.toContain(UPSTREAM);
}

describe('GET /api/factory/backlog', () => {
	it('answers every backlog page, without asking the tracker again by default', async () => {
		const { status, body, text, requests } = await get();
		expect(status).toBe(200);
		expect(body).toEqual({
			ok: true,
			items: backlogIssues,
			fetchedAt: FAKE_BACKLOG_FETCHED_AT,
			complete: true
		});
		expect(requests.every((r) => r.method === 'GET')).toBe(true);
		expect(requests.some((r) => r.path.includes('refresh='))).toBe(false);
		expectSafe(text);
	});

	it('forwards refresh=true on the first page only', async () => {
		const { status, requests } = await get('?refresh=true');
		expect(status).toBe(200);
		const reads = requests.filter((r) => r.path.startsWith('/v1/backlog'));
		expect(reads.length).toBeGreaterThan(1);
		expect(reads[0]!.path).toContain('refresh=true');
		expect(reads.slice(1).some((r) => r.path.includes('refresh='))).toBe(false);
	});

	it('answers a tracker failure with its status and a safe failure body', async () => {
		const { status, body, text } = await get('?refresh=true', {
			failBacklog: problemTrackerUnavailable
		});
		expect(status).toBe(503);
		expect(body).toEqual({
			ok: false,
			failure: {
				type: 'tracker_unavailable',
				title: problemTrackerUnavailable.title,
				detail: problemTrackerUnavailable.detail,
				retryable: true
			}
		});
		expectSafe(text);
	});

	it('never echoes an upstream body that breaks the contract', async () => {
		const { status, body, text } = await get('', {
			failBacklog: { status: 500, title: UPSTREAM, type: 'nonsense' } as never
		});
		expect(status).toBe(502);
		expect(body.ok).toBe(false);
		expectSafe(text);
	});

	it('contains a wrong token as a lane failure', async () => {
		process.env.FACTORY_API_TOKEN = 'not-the-token';
		const { status, body, text } = await get();
		expect(status).toBe(401);
		expect(body).toMatchObject({ ok: false, failure: { type: 'unauthorized' } });
		expect(text).not.toContain('not-the-token');
		expectSafe(text);
	});

	it('contains missing configuration as a lane failure naming the variable', async () => {
		delete process.env.FACTORY_API_URL;
		const { status, body } = await get();
		expect(status).toBe(500);
		expect(body).toMatchObject({ ok: false, failure: { type: 'configuration_error' } });
		expect(JSON.stringify(body)).toContain('FACTORY_API_URL');
	});

	it('exports GET only', () => {
		expect(Object.keys(handlers)).toEqual(['GET']);
	});
});
