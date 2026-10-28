import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	runHistoryReviewChanges,
	runPageFirstExecution,
	runWorkValidationFailed
} from '$lib/factory/fixtures';
import type { RunResult } from '$lib/factory/inspector';

import {
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	type FakeFactoryOptions
} from '../../../../../../test/fake-factory';
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

const FACTORY_HOST = 'factory.run-handler-test.internal';
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

async function get(id: string, options: FakeFactoryOptions = {}) {
	const fake = createFakeFactory(options);
	const url = new URL(`http://dashboard.test/api/factory/runs/${encodeURIComponent(id)}`);
	const event = { fetch: fake.handle, params: { id }, url } as unknown as Parameters<
		typeof handlers.GET
	>[0];
	const response = await handlers.GET(event);
	const text = await response.text();
	return {
		status: response.status,
		cacheControl: response.headers.get('cache-control'),
		text,
		body: JSON.parse(text) as RunResult,
		requests: fake.requests
	};
}

function expectSafe(text: string) {
	expect(text).not.toContain(FAKE_FACTORY_TOKEN);
	expect(text).not.toContain(FACTORY_URL);
	expect(text).not.toContain(FACTORY_HOST);
	expect(text).not.toContain(UPSTREAM);
}

/** A failure body has only the safe envelope and failure fields: no raw upstream problem. */
function expectSafeFailure(body: unknown) {
	expect(Object.keys(body as object).sort()).toEqual(['failure', 'ok']);
	const { failure } = body as { failure: object };
	for (const key of Object.keys(failure)) {
		expect(['type', 'title', 'detail', 'retryable']).toContain(key);
	}
}

function runOf(body: RunResult) {
	if (!body.ok) throw new Error(`expected a run, got ${body.failure.type}`);
	return body.run;
}

describe('GET /api/factory/runs/[id]', () => {
	it("answers a run's validation checks", async () => {
		const { status, body, text, cacheControl, requests } = await get(runWorkValidationFailed.id);
		expect(status).toBe(200);
		expect(cacheControl).toBe('no-store');
		const run = runOf(body);
		expect(run).toMatchObject({ id: runWorkValidationFailed.id, stage: 'work', task: '01' });
		expect(run.validation?.status).toBe('failed');
		expect(run.validation?.checks.map((c) => [c.name, c.status])).toEqual([
			['test', 'failed'],
			['lint', 'passed'],
			['check', 'skipped'],
			['worktree has a change', 'error']
		]);
		expect(requests).toEqual([{ method: 'GET', path: `/v1/runs/${runWorkValidationFailed.id}` }]);
		expectSafe(text);
	});

	it("answers a run's review findings", async () => {
		const { status, body, text } = await get(runHistoryReviewChanges.id);
		expect(status).toBe(200);
		const run = runOf(body);
		expect(run.purpose).toBe('initial');
		expect(run.review?.verdict).toBe('changes_requested');
		expect(run.review?.findings.map((f) => [f.id, f.severity, f.blocking])).toEqual([
			['R1-01', 'critical', true],
			['R1-02', 'major', true],
			['R1-03', 'minor', false]
		]);
		expectSafe(text);
	});

	it("answers a past execution's run", async () => {
		const id = runPageFirstExecution.items[0]!.id;
		const { status, body } = await get(id);
		expect(status).toBe(200);
		expect(runOf(body).id).toBe(id);
	});

	it('passes the id through opaque and encoded', async () => {
		const { status, body, requests } = await get('run a/b#1');
		expect(status).toBe(404);
		expect(body).toMatchObject({ ok: false, failure: { type: 'not_found', retryable: false } });
		expect(requests[0]!.path).toBe('/v1/runs/run%20a%2Fb%231');
	});

	it('an unknown run id is a 404 not_found with a safe body', async () => {
		const { status, body, text, cacheControl } = await get('run_does_not_exist');
		expect(status).toBe(404);
		expect(cacheControl).toBe('no-store');
		expect(body).toMatchObject({ ok: false, failure: { type: 'not_found', retryable: false } });
		expectSafeFailure(body);
		expectSafe(text);
	});

	it('an upstream 500 answers its normalized status with a safe body', async () => {
		const { status, body, text } = await get(runWorkValidationFailed.id, {
			failRun: { status: 500, title: 'Internal error', type: 'internal_error' }
		});
		expect(status).toBe(500);
		expect(body).toMatchObject({ ok: false, failure: { type: 'internal_error', retryable: true } });
		expectSafe(text);
	});

	it('an upstream 503 keeps its status and retryable, with only the safe failure fields', async () => {
		const { status, body, text } = await get(runWorkValidationFailed.id, {
			failRun: {
				status: 503,
				title: 'Tracker unavailable',
				type: 'tracker_unavailable',
				detail: UPSTREAM
			}
		});
		expect(status).toBe(503);
		expect(body).toMatchObject({
			ok: false,
			failure: { type: 'tracker_unavailable', retryable: true }
		});
		expectSafeFailure(body);
		expect(text).not.toContain(FACTORY_HOST);
	});

	it('never echoes an upstream body that breaks the contract', async () => {
		const { status, body, text } = await get(runWorkValidationFailed.id, {
			failRun: { status: 500, title: UPSTREAM, type: 'nonsense' } as never
		});
		expect(status).toBe(502);
		expect(body).toMatchObject({ ok: false, failure: { type: 'contract_error' } });
		expectSafe(text);
	});

	it('contains a wrong token as a safe failure', async () => {
		process.env.FACTORY_API_TOKEN = 'not-the-token';
		const { status, body, text } = await get(runWorkValidationFailed.id);
		expect(status).toBe(401);
		expect(body).toMatchObject({ ok: false, failure: { type: 'unauthorized' } });
		expectSafeFailure(body);
		expect(text).not.toContain('not-the-token');
		expectSafe(text);
	});

	it('contains missing configuration as a safe failure naming the variable', async () => {
		delete process.env.FACTORY_API_URL;
		const { status, body, text, requests } = await get(runWorkValidationFailed.id);
		expect(status).toBe(500);
		expect(body).toMatchObject({ ok: false, failure: { type: 'configuration_error' } });
		expect(text).toContain('FACTORY_API_URL');
		expect(text).not.toContain(FAKE_FACTORY_TOKEN);
		expect(requests).toHaveLength(0);
	});

	it('exports GET only', () => {
		expect(Object.keys(handlers)).toEqual(['GET']);
	});
});
