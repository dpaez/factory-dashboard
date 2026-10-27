import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	statsConfigurations,
	statsTicketMultiExecutionRow,
	statsTicketsComplete,
	statsTicketsNoHandoffs,
	statsCompleteSummary
} from '$lib/factory/fixtures';
import type { Cohort, StageGroup, SummaryMetrics, TokensByStage } from '$lib/factory/stats';
import { EXPORT_INCOMPLETE, SUMMARY_COUNT_MISMATCH } from '$lib/factory/stats-efficiency';
import { NO_HANDOFFS, type ConfigurationComparison } from '$lib/factory/stats-tickets';

import {
	FAKE_FACTORY_TOKEN,
	FAKE_STATS_TICKETS_PAGE_SIZE,
	createFakeFactory,
	type FakeFactoryOptions
} from '../../../test/fake-factory';
import { load, type ExportFacts, type StatsPanelResult, type TicketFacts } from './+page.server';

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
	tickets: StatsPanelResult<TicketFacts>;
	configurations: StatsPanelResult<ConfigurationComparison>;
	efficiency: StatsPanelResult<ExportFacts>;
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
	return {
		data,
		requests: fake.requests,
		exportRequests: fake.exportRequests,
		dependencies,
		query
	};
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
		const pages = Math.ceil(statsTicketsComplete.items.length / FAKE_STATS_TICKETS_PAGE_SIZE);
		// Summary, stages, configurations, the export and every tickets page.
		expect(requests).toHaveLength(4 + pages);
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
		for (const path of [
			'/v1/stats/summary',
			'/v1/stats/stages',
			'/v1/stats/tickets',
			'/v1/stats/configurations',
			'/v1/stats/export'
		]) {
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

	it('every read failing still shows the window', async () => {
		const { data } = await run({
			failStatsSummary: internal,
			failStatsStages: internal,
			failStatsTickets: internal,
			failStatsConfigurations: internal,
			failStatsExport: internal
		});
		expect(
			data.summary.ok ||
				data.stages.ok ||
				data.tokens.ok ||
				data.tickets.ok ||
				data.configurations.ok ||
				data.efficiency.ok
		).toBe(false);
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

	it('reads every tickets page and the configurations with the summary window', async () => {
		const { data, requests, query } = await run();
		const from = query('/v1/stats/summary')?.get('from');
		const to = query('/v1/stats/summary')?.get('to');
		expect(query('/v1/stats/configurations')?.get('from')).toBe(from);
		expect(query('/v1/stats/configurations')?.get('to')).toBe(to);
		const pages = requests
			.filter((r) => r.path.startsWith('/v1/stats/tickets?'))
			.map((r) => new URL(r.path, FACTORY_URL).searchParams);
		expect(pages.map((p) => p.get('cursor'))).toEqual([null, '5', '10']);
		for (const page of pages) {
			expect(page.get('from')).toBe(from);
			expect(page.get('to')).toBe(to);
		}
		expect(data.tickets.ok).toBe(true);
		if (!data.tickets.ok) return;
		// Twelve rows over three pages: the time sample counts all ten that reached handoff.
		expect(data.tickets.model.complete).toBe(true);
		expect(data.tickets.model.time.sampleSize).toBe(10);
		expect(data.tickets.model.time.excludedCount).toBe(2);
		expect(data.tickets.model.time.executions.value).toBe(statsTicketsComplete.items.length);
		expect(data.tickets.model.time.startToHandoff.p90.availability).toBe('complete');
		expect(data.tickets.model.quality.neededAPerson.denominator).toBe(12);
		expect(data.configurations.ok && data.configurations.model.rows).toHaveLength(
			statsConfigurations.items.length
		);
		expect(data.cohort.mismatch).toBe(false);
	});

	it('contributors list the exact executions, linked through the resolver', async () => {
		const { data } = await run();
		if (!data.tickets.ok) throw new Error('tickets panel failed');
		const needed = data.tickets.model.contributors.neededAPerson.rows;
		expect(needed.map((row) => row.displayRef)).toEqual([
			'dpaez/factory-dashboard#9',
			'dpaez/factory-dashboard#14',
			'dpaez/factory-dashboard#17',
			'KAI-21',
			'KAI-23',
			'dpaez/factory-dashboard#20'
		]);
		expect(needed[0]?.href).toBe(
			`/stats/execution?${new URLSearchParams({
				key: statsTicketMultiExecutionRow.key,
				startedAt: statsTicketMultiExecutionRow.startedAt
			})}`
		);
	});

	it.each([
		['every page', internal],
		['the second page', { atCursor: 5, problem: internal }]
	] as const)(
		'a tickets failure on %s blanks only the ticket panels',
		async (_, failStatsTickets) => {
			const { data } = await run({ failStatsTickets });
			expect(data.tickets).toEqual({
				ok: false,
				failure: { title: 'Internal error', retryable: true }
			});
			expect(data.summary.ok).toBe(true);
			expect(data.stages.ok).toBe(true);
			expect(data.configurations.ok).toBe(true);
			expect(JSON.stringify(data)).not.toContain(SECRET_DETAIL);
		}
	);

	it('a configurations failure blanks only the configuration comparison', async () => {
		const { data } = await run({ failStatsConfigurations: internal });
		expect(data.configurations).toEqual({
			ok: false,
			failure: { title: 'Internal error', retryable: true }
		});
		expect(data.tickets.ok && data.summary.ok && data.stages.ok).toBe(true);
		expect(JSON.stringify(data)).not.toContain(SECRET_DETAIL);
	});

	it.each([
		['tickets', 'failStatsTickets'],
		['configurations', 'failStatsConfigurations']
	] as const)('a %s 401 is the page configuration error', async (_, option) => {
		const error = await pageError({
			[option]: { status: 401, title: 'Unauthorized', type: 'unauthorized', detail: SECRET_DETAIL }
		});
		expect(error.status).toBe(503);
		expect(error.body.kind).toBe('configuration');
		expect(JSON.stringify(error.body)).not.toContain(SECRET_DETAIL);
	});

	it('the no-handoffs cohort has Unavailable time figures with the excluded count, never 0', async () => {
		const { data } = await run({ statsTicketsCohort: 'noHandoffs' });
		if (!data.tickets.ok) throw new Error('tickets panel failed');
		const time = data.tickets.model.time;
		expect(time.sampleSize).toBe(0);
		expect(time.excludedCount).toBe(statsTicketsNoHandoffs.items.length);
		expect(time.startToHandoff.mean).toMatchObject({
			value: null,
			availability: 'unavailable',
			unavailableReason: NO_HANDOFFS
		});
	});

	it('ticket quality reconciles with the summary only when the envelopes match', async () => {
		const matched = (await run()).data;
		// The fixture summary describes a larger cohort: the rows do not reconcile.
		expect(matched.tickets.ok && matched.tickets.model.quality.reconciled).toBe(false);
		const noSummary = (await run({ failStatsSummary: internal })).data;
		expect(noSummary.tickets.ok && noSummary.tickets.model.quality.reconciled).toBeNull();
	});
});

describe('/stats load: the stats export', () => {
	function efficiency(data: StatsData): ExportFacts {
		if (!data.efficiency.ok) throw new Error('efficiency panel failed');
		return data.efficiency.model;
	}

	it('reads the export once, in the same window as the other four reads', async () => {
		const { data, exportRequests, query } = await run({}, '?from=2026-09-01&to=2026-09-30');
		expect(exportRequests).toEqual([{ from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00Z' }]);
		for (const path of ['/v1/stats/summary', '/v1/stats/stages', '/v1/stats/configurations']) {
			expect(query(path)?.get('from')).toBe(data.cohort.window.from);
			expect(query(path)?.get('to')).toBe(data.cohort.window.to);
		}
	});

	it('the complete export gives Efficiency signals and No returns to work', async () => {
		const { data } = await run();
		const { signals, noReturnsToWork } = efficiency(data);
		expect(signals.status.complete).toBe(true);
		expect(signals.executions.value).toBe(statsCompleteSummary.started);
		expect(signals.blendedCostPerMerged).toMatchObject({
			availability: 'complete',
			numerator: 48.2,
			denominator: 16
		});
		expect(signals.blendedCostPerMerged.value).toBeCloseTo(3.0125);
		expect(noReturnsToWork.availability).toBe('complete');
		expect(noReturnsToWork.numerator).toBeTypeOf('number');
		expect(noReturnsToWork.denominator).toBeGreaterThan(0);
		expect(data.cohort.mismatch).toBe(false);
	});

	it('an export failure blanks only the export figures', async () => {
		const { data } = await run({ failStatsExport: internal });
		expect(data.efficiency).toEqual({
			ok: false,
			failure: { title: 'Internal error', retryable: true }
		});
		expect(
			data.summary.ok &&
				data.stages.ok &&
				data.tokens.ok &&
				data.tickets.ok &&
				data.configurations.ok
		).toBe(true);
		expect(data.cohort.factoryId).toBe(statsCompleteSummary.factoryId);
		expect(JSON.stringify(data)).not.toContain(SECRET_DETAIL);
	});

	it('an export 401 is the page configuration error', async () => {
		const error = await pageError({
			failStatsExport: {
				status: 401,
				title: 'Unauthorized',
				type: 'unauthorized',
				detail: SECRET_DETAIL
			}
		});
		expect(error.status).toBe(503);
		expect(error.body.kind).toBe('configuration');
		expect(JSON.stringify(error.body)).not.toContain(SECRET_DETAIL);
	});

	it.each([
		['malformed lines', { statsExportMalformed: true }, /2 malformed lines/],
		['a truncated body', { statsExportTruncate: true }, /ended early/]
	] as const)('%s make every share Unavailable', async (_, options, reason) => {
		const { data } = await run(options);
		const { signals, noReturnsToWork } = efficiency(data);
		expect(signals.status.complete).toBe(false);
		expect(signals.status.reason).toMatch(reason);
		for (const metric of [
			signals.waitingShare,
			signals.blendedCostPerMerged,
			signals.rework.share,
			signals.infrastructureLost.share,
			noReturnsToWork
		]) {
			expect(metric.value).toBeNull();
			expect(metric.availability).toBe('unavailable');
		}
		expect(signals.executions.availability).toBe('partial');
		expect(data.summary.ok && data.tickets.ok).toBe(true);
	});

	it('a ticket-line count that differs from summary.started is not complete', async () => {
		const { data } = await run({ statsExportCohort: 'zeroMerges' });
		const { signals, noReturnsToWork } = efficiency(data);
		expect(signals.status.complete).toBe(false);
		expect(signals.status.malformedLines).toBe(0);
		expect(signals.status.reason).toBe(`${EXPORT_INCOMPLETE} — ${SUMMARY_COUNT_MISMATCH}`);
		expect(signals.blendedCostPerMerged.value).toBeNull();
		expect(noReturnsToWork.value).toBeNull();
	});

	it('the count check needs the summary: without it the export stands alone', async () => {
		const { data } = await run({ failStatsSummary: internal });
		expect(efficiency(data).signals.status.complete).toBe(true);
	});

	it('an export from another factory flags the cohort mismatch', async () => {
		const { data } = await run({ statsExportCohort: 'mismatch' });
		expect(data.cohort.mismatch).toBe(true);
		// Another factory's count is not compared with this summary.
		expect(efficiency(data).signals.status.complete).toBe(true);
	});

	it('serializes only view models: no raw lines, token, URL or Problem detail', async () => {
		for (const options of [{}, { statsExportMalformed: true }, { failStatsExport: internal }]) {
			const { data } = await run(options);
			const serialized = JSON.stringify(data);
			expect(serialized).not.toContain(FAKE_FACTORY_TOKEN);
			expect(serialized).not.toContain(FACTORY_URL);
			expect(serialized).not.toContain(FACTORY_HOST);
			expect(serialized).not.toContain(SECRET_DETAIL);
			expect(serialized).not.toContain('"type":"ticket"');
			expect(serialized).not.toContain('"type":"run"');
			expect(serialized).not.toContain('"diagnostics":[');
			expect(serialized).not.toContain('"tickets":[{');
		}
	});
});
