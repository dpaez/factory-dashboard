import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { statsCompleteSummary } from '$lib/factory/fixtures';
import type { Cohort, StageGroup, SummaryMetrics, TokensByStage } from '$lib/factory/stats';

import {
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	type FakeFactoryOptions
} from '../../../test/fake-factory';
import { load, type StatsPanelResult } from './+page.server';

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

const FACTORY_HOST = 'factory.stats-test.internal';
const FACTORY_URL = `http://${FACTORY_HOST}:7731`;
const SECRET_DETAIL = 'upstream stack trace: sqlite busy at /var/factory/db';

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
});

type StatsData = {
	cohort: Cohort;
	notice: string | null;
	summary: StatsPanelResult<SummaryMetrics>;
	stages: StatsPanelResult<StageGroup[]>;
	tokens: StatsPanelResult<TokensByStage>;
};

async function run(options: FakeFactoryOptions = {}, search = '') {
	const fake = createFakeFactory(options);
	const dependencies: string[] = [];
	const depends = (...keys: string[]) => void dependencies.push(...keys);
	const url = new URL(`http://dashboard.test/stats${search}`);
	const event = { depends, fetch: fake.handle, url } as unknown as Parameters<typeof load>[0];
	const data = (await load(event)) as StatsData;
	const query = (path: string) => {
		const request = fake.requests.find((r) => r.path.startsWith(`${path}?`));
		return request ? new URL(request.path, FACTORY_URL).searchParams : null;
	};
	return { data, requests: fake.requests, dependencies, query };
}

async function pageError(options: FakeFactoryOptions = {}) {
	try {
		await run(options);
	} catch (cause) {
		if (isHttpError(cause)) return cause;
		throw cause;
	}
	throw new Error('load did not throw');
}

const internal = {
	status: 500,
	title: 'Internal error',
	type: 'internal_error',
	detail: SECRET_DETAIL
} as const;

describe('/stats load', () => {
	it('depends on the tickets key events invalidate', async () => {
		const { dependencies } = await run();
		expect(dependencies).toEqual(['factory:tickets']);
	});

	it('reads summary and stages with the identical default window', async () => {
		const { data, requests, query } = await run();
		expect(requests).toHaveLength(2);
		expect(requests.every((r) => r.method === 'GET')).toBe(true);
		const summary = query('/v1/stats/summary');
		const stages = query('/v1/stats/stages');
		expect(summary?.get('from')).toBe(data.cohort.window.from);
		expect(summary?.get('to')).toBe(data.cohort.window.to);
		expect(stages?.get('from')).toBe(summary?.get('from'));
		expect(stages?.get('to')).toBe(summary?.get('to'));
		expect(stages?.get('groupBy')).toBe('setup');
		const days = (Date.parse(data.cohort.window.to) - Date.parse(data.cohort.window.from)) / 864e5;
		expect(days).toBe(30);
		expect(data.cohort.window.isDefault).toBe(true);
		expect(data.notice).toBeNull();
	});

	it('uses the requested window for every read', async () => {
		const { data, query } = await run({}, '?from=2026-09-01&to=2026-09-30');
		expect(data.cohort.window.from).toBe('2026-09-01T00:00:00Z');
		expect(data.cohort.window.to).toBe('2026-10-01T00:00:00Z');
		for (const path of ['/v1/stats/summary', '/v1/stats/stages']) {
			expect(query(path)?.get('from')).toBe('2026-09-01T00:00:00Z');
			expect(query(path)?.get('to')).toBe('2026-10-01T00:00:00Z');
		}
	});

	it.each([['?from=2026-13-40'], ['?from=2026-10-01&to=2026-09-01'], ['?to=nonsense']])(
		'an invalid window %s reads the default with a notice',
		async (search) => {
			const { data, requests } = await run({}, search);
			expect(data.cohort.window.isDefault).toBe(true);
			expect(data.notice).toMatch(/Showing the last 30 days/);
			for (const request of requests) {
				const params = new URL(request.path, FACTORY_URL).searchParams;
				expect(params.get('from')).toBe(data.cohort.window.from);
				expect(params.get('to')).toBe(data.cohort.window.to);
			}
		}
	);

	it('builds every panel and the cohort envelope from the reads', async () => {
		const { data } = await run();
		expect(data.cohort.factoryId).toBe(statsCompleteSummary.factoryId);
		expect(data.cohort.definitions).toBe('stats.v1');
		expect(data.cohort.factoryVersions).toEqual(statsCompleteSummary.factoryVersions);
		expect(data.cohort.mismatch).toBe(false);
		expect(data.summary.ok && data.summary.model.mergeRate.value).toBe(0.8);
		expect(data.stages.ok && data.stages.model.map((g) => g.stage)).toEqual([
			'plan',
			'work',
			'qa',
			'review',
			'wrapup'
		]);
		expect(data.tokens.ok && data.tokens.model.coverage.value).toBe(1);
	});

	it('a failing stages read blanks the stage and token panels only', async () => {
		const { data } = await run({ failStatsStages: internal });
		expect(data.stages).toEqual({
			ok: false,
			failure: { title: 'Internal error', retryable: true }
		});
		expect(data.tokens.ok).toBe(false);
		expect(data.summary.ok).toBe(true);
		expect(data.cohort.factoryId).toBe(statsCompleteSummary.factoryId);
		expect(JSON.stringify(data)).not.toContain(SECRET_DETAIL);
	});

	it('a failing summary read blanks the summary; token coverage is Unavailable', async () => {
		const { data } = await run({ failStatsSummary: internal });
		expect(data.summary.ok).toBe(false);
		expect(data.stages.ok).toBe(true);
		expect(data.tokens.ok).toBe(true);
		if (data.tokens.ok) {
			expect(data.tokens.model.coverage.value).toBeNull();
			expect(data.tokens.model.coverage.availability).toBe('unavailable');
		}
		expect(data.cohort.definitions).toBe('stats.v1');
		expect(JSON.stringify(data)).not.toContain(SECRET_DETAIL);
	});

	it('both reads failing still shows the window', async () => {
		const { data } = await run({ failStatsSummary: internal, failStatsStages: internal });
		expect(data.summary.ok || data.stages.ok || data.tokens.ok).toBe(false);
		expect(data.cohort.factoryId).toBeNull();
		expect(data.cohort.window.from).toMatch(/Z$/);
	});

	it.each([
		[
			'summary 401',
			{
				failStatsSummary: {
					status: 401,
					title: 'Unauthorized',
					type: 'unauthorized',
					detail: SECRET_DETAIL
				}
			}
		],
		[
			'stages 403',
			{
				failStatsStages: {
					status: 403,
					title: 'Forbidden',
					type: 'insufficient_scope',
					detail: SECRET_DETAIL
				}
			}
		]
	] as const)(
		'%s is the page configuration error, without its Problem detail',
		async (_, options) => {
			const error = await pageError(options);
			expect(error.status).toBe(503);
			expect(error.body.kind).toBe('configuration');
			expect(error.body.detail).toBeUndefined();
			expect(JSON.stringify(error.body)).not.toContain(SECRET_DETAIL);
		}
	);

	it('mismatched envelopes keep both panels but make token coverage Unavailable', async () => {
		const { data } = await run({ statsCohort: 'mismatch' });
		expect(data.cohort.mismatch).toBe(true);
		expect(data.summary.ok).toBe(true);
		expect(data.stages.ok).toBe(true);
		expect(data.tokens.ok).toBe(true);
		if (data.tokens.ok) {
			expect(data.tokens.model.knownTotal).toBe(6_400_000);
			expect(data.tokens.model.coverage).toMatchObject({
				value: null,
				availability: 'unavailable'
			});
			expect(data.tokens.model.coverage.numerator).toBeUndefined();
			expect(data.tokens.model.coverage.unavailableReason).toMatch(/different factories/);
		}
	});

	it('a wrong token is the page configuration error', async () => {
		const error = await pageError({ token: 'another-token' });
		expect(error.status).toBe(503);
		expect(error.body.kind).toBe('configuration');
	});

	it('missing FACTORY_API_URL is the configuration error naming it', async () => {
		delete process.env.FACTORY_API_URL;
		const error = await pageError();
		expect(error.body.kind).toBe('configuration');
		expect(error.body.detail).toContain('FACTORY_API_URL');
	});

	it('zero merges is a measured 0%; the empty cohort is Unavailable', async () => {
		const zero = (await run({ statsCohort: 'zeroMerges' })).data;
		expect(zero.summary.ok && zero.summary.model.mergeRate).toMatchObject({
			value: 0,
			numerator: 0,
			denominator: 3
		});
		const empty = (await run({ statsCohort: 'empty' })).data;
		expect(empty.summary.ok && empty.summary.model.mergeRate).toMatchObject({
			value: null,
			availability: 'unavailable',
			denominator: 0
		});
	});

	it('QA disabled is a stage with no runs', async () => {
		const { data } = await run({ statsCohort: 'qaDisabled' });
		const qa = data.stages.ok ? data.stages.model.find((g) => g.stage === 'qa') : undefined;
		expect(qa).toMatchObject({ noRuns: true, rows: [] });
	});

	it('serialized page data has no token, factory URL or host', async () => {
		const { data } = await run();
		const serialized = JSON.stringify(data);
		expect(serialized).not.toContain(FAKE_FACTORY_TOKEN);
		expect(serialized).not.toContain(FACTORY_URL);
		expect(serialized).not.toContain(FACTORY_HOST);
	});
});
