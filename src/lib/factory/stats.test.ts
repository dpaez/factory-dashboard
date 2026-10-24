import { describe, expect, it } from 'vitest';

import {
	statsCompleteStages,
	statsCompleteSummary,
	statsEmptyStages,
	statsEmptySummary,
	statsPartialStages,
	statsQaDisabledStages,
	statsSummary,
	statsZeroMergesSummary
} from './fixtures';
import { formatCost, formatCount, formatDuration, formatPercent } from './format';
import {
	CATEGORIES_UNAVAILABLE,
	parseCohortWindow,
	ratioMetric,
	toCohort,
	toStageTable,
	toSummaryMetrics,
	toTokensByStage,
	type Metric,
	type StatsStages
} from './stats';

/** The OpenAPI `from`/`to` date-time pattern, verbatim. */
const API_DATE_TIME =
	/^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z))$/;

const NOW = new Date('2026-10-24T12:34:56.789Z');
const cohort = { id: '2026-09-24T12:34:56Z/2026-10-24T12:34:56Z' };

function params(query: { from?: string; to?: string }) {
	return new URLSearchParams(
		Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined)
	);
}

function defined<T>(value: T | undefined): T {
	if (value === undefined) throw new Error('expected a value');
	return value;
}

/** The complete fixture's rows: plan, review, work (two setups), qa, wrapup. */
const planRow = defined(statsCompleteStages.items.find((row) => row.stage === 'plan'));
const workRow = defined(statsCompleteStages.items.find((row) => row.stage === 'work'));

/** How a panel renders a Metric value. */
function render(metric: Metric): string {
	switch (metric.unit) {
		case 'ratio':
			return formatPercent(metric.value);
		case 'USD':
			return formatCost(metric.value);
		case 'ms':
			return formatDuration(metric.value);
		default:
			return formatCount(metric.value);
	}
}

describe('merge rate', () => {
	it('divides merged by merged + abandoned + cancelled, excluding open and unknown', () => {
		const { mergeRate } = toSummaryMetrics(statsCompleteSummary, cohort);

		expect(mergeRate).toMatchObject({
			numerator: 16,
			denominator: 20,
			value: 0.8,
			excludedCount: 6,
			availability: 'complete',
			unit: 'ratio',
			cohortId: cohort.id
		});
		expect(formatPercent(mergeRate.value)).toBe('80%');
	});

	it('is Unavailable, not 0, when the denominator is zero', () => {
		const { mergeRate } = toSummaryMetrics(
			{
				...statsEmptySummary,
				started: 3,
				outcomes: { ...statsEmptySummary.outcomes, open: 2, unknown: 1 }
			},
			cohort
		);

		expect(mergeRate.value).toBeNull();
		expect(mergeRate.availability).toBe('unavailable');
		expect(mergeRate.denominator).toBe(0);
		expect(mergeRate.excludedCount).toBe(3);
		expect(mergeRate.unavailableReason).toBeTruthy();
		expect(render(mergeRate)).toBe('—');
	});

	it('measures 0 merged over a non-zero denominator as 0%', () => {
		const { mergeRate } = toSummaryMetrics(statsZeroMergesSummary, cohort);

		expect(mergeRate).toMatchObject({
			value: 0,
			availability: 'complete',
			numerator: 0,
			denominator: 3,
			excludedCount: 3
		});
		expect(render(mergeRate)).toBe('0%');
		// The corrected legacy fixture agrees with stats.v1.
		expect(toSummaryMetrics(statsSummary, cohort).mergeRate.value).toBe(statsSummary.mergeRate);
	});

	it('ratioMetric marks a zero denominator unavailable', () => {
		const metric = ratioMetric({
			key: 'k',
			label: 'k',
			numerator: 0,
			denominator: 0,
			cohortId: 'c',
			definition: 'd'
		});
		expect(metric).toMatchObject({ value: null, availability: 'unavailable' });
	});
});

describe('toSummaryMetrics', () => {
	it('reports total tokens and cost as complete over the started tickets', () => {
		const { tokens, cost, started } = toSummaryMetrics(statsCompleteSummary, cohort);

		expect(tokens).toMatchObject({ value: 6_400_000, availability: 'complete', sampleSize: 26 });
		expect(cost).toMatchObject({ value: 48.2, unit: 'USD', availability: 'complete' });
		expect(render(cost)).toBe('$48.20');
		expect(started.value).toBe(26);
	});

	it('lists outcome counts in a fixed order', () => {
		const { outcomes } = toSummaryMetrics(statsCompleteSummary, cohort);

		expect(outcomes.map((metric) => [metric.key, metric.value])).toEqual([
			['merged', 16],
			['abandoned', 2],
			['cancelled', 2],
			['open', 4],
			['unknown', 2]
		]);
	});

	it('measures an empty window as zero tokens and cost, with merge rate Unavailable', () => {
		const metrics = toSummaryMetrics(statsEmptySummary, cohort);

		expect(metrics.tokens).toMatchObject({ value: 0, availability: 'complete' });
		expect(metrics.cost).toMatchObject({ value: 0, availability: 'complete' });
		expect(render(metrics.cost)).toBe('$0.00');
		expect(metrics.mergeRate).toMatchObject({ value: null, availability: 'unavailable' });
	});
});

describe('toStageTable', () => {
	it('orders stages plan, work, QA, review, wrapup with model setups as rows', () => {
		const table = toStageTable(statsCompleteStages, cohort);

		expect(table.map((group) => group.label)).toEqual(['plan', 'work', 'QA', 'review', 'wrapup']);
		expect(table.every((group) => !group.noRuns)).toBe(true);
		expect(defined(table[1]).rows.map((row) => row.setup)).toEqual([
			'claude-opus-5-5:high',
			'gpt-6:medium'
		]);
	});

	it('lists a stage absent from the response as no runs, and keeps unknown stages after', () => {
		const stages = {
			...statsQaDisabledStages,
			items: [
				{ ...planRow, stage: 'triage' },
				...statsQaDisabledStages.items,
				{ ...planRow, stage: 'audit' }
			]
		} satisfies StatsStages;
		const table = toStageTable(stages, cohort);

		expect(table.map((group) => group.stage)).toEqual([
			'plan',
			'work',
			'qa',
			'review',
			'wrapup',
			'triage',
			'audit'
		]);
		const qa = table.find((group) => group.stage === 'qa');
		expect(qa).toMatchObject({ noRuns: true, rows: [] });
	});

	it('lists every stage as no runs for an empty window', () => {
		const table = toStageTable(statsEmptyStages, cohort);
		expect(table).toHaveLength(5);
		expect(table.every((group) => group.noRuns)).toBe(true);
	});

	it('keeps every null ratio Unavailable and renders it —, never 0', () => {
		const table = toStageTable(statsPartialStages, cohort);
		const review = table.find((group) => group.stage === 'review');
		const unknown = review?.rows.find((row) => row.setup === 'claude-opus-5-5:high');
		expect(unknown).toBeDefined();
		if (!unknown) return;

		const ratios = [
			unknown.metrics.firstPassAcceptance,
			unknown.metrics.correctionsPerAcceptedOutput,
			unknown.metrics.reviewRoundsPerTask,
			unknown.metrics.tokensPerAcceptedOutput,
			unknown.metrics.costUsdPerAcceptedOutput
		];
		for (const metric of ratios) {
			expect(metric.value).toBeNull();
			expect(metric.availability).toBe('unavailable');
			expect(metric.unavailableReason).toBeTruthy();
			const text = render(metric);
			expect(text).toBe('—');
			expect(['0', '0%', '$0.00']).not.toContain(text);
		}
		// Counts on the same row are measurements, including zero.
		expect(unknown.metrics.runs.value).toBe(3);
		expect(unknown.metrics.acceptedOutputs).toMatchObject({ value: 0, availability: 'complete' });
		expect(unknown.metrics.infrastructureLost.value).toBe(2);
	});

	it('leaves the sample unknown where stats.v1 does not report its population', () => {
		const [plan] = toStageTable(statsCompleteStages, cohort);
		const { metrics } = defined(defined(plan).rows[0]);

		// Validated initial runs and distinct tasks are not in the response.
		expect(metrics.firstPassAcceptance.sampleSize).toBeNull();
		expect(metrics.reviewRoundsPerTask.sampleSize).toBeNull();
		expect(metrics.firstPassAcceptance.denominator).toBeUndefined();
		expect(metrics.reviewRoundsPerTask.denominator).toBeUndefined();
	});

	it('carries returns to work by origin, known origins first', () => {
		const table = toStageTable(
			{
				...statsCompleteStages,
				items: [{ ...workRow, returnsToWork: { ci: 1, review: 6 } }]
			},
			cohort
		);
		const row = defined(defined(table[1]).rows[0]);

		expect(row.returnsToWork.map((item) => [item.label, item.count.value])).toEqual([
			['QA', 0],
			['review', 6],
			['ci', 1]
		]);
	});

	it('maps the measured per-row figures', () => {
		const plan = defined(toStageTable(statsCompleteStages, cohort)[0]);
		const { metrics } = defined(plan.rows[0]);

		expect(render(metrics.firstPassAcceptance)).toBe('96%');
		expect(metrics.tokensPerAcceptedOutput).toMatchObject({ value: 40_000, denominator: 26 });
		expect(render(metrics.costUsdPerAcceptedOutput)).toBe('$0.31');
		expect(metrics.agentMs).toMatchObject({ value: 7_800_000, unit: 'ms' });
	});
});

describe('toTokensByStage', () => {
	it('derives stage totals that reconcile to the cohort tokens', () => {
		const result = toTokensByStage(statsCompleteStages, statsCompleteSummary, cohort);

		expect(result.stages.map((stage) => [stage.stage, stage.total.value])).toEqual([
			['plan', 1_040_000],
			['work', 3_600_000],
			['qa', 600_000],
			['review', 600_000],
			['wrapup', 560_000]
		]);
		expect(result.knownTotal).toBe(6_400_000);
		expect(result.stages.every((stage) => stage.total.availability === 'complete')).toBe(true);
		expect(result.coverage).toMatchObject({ value: 1, availability: 'complete' });
		const work = defined(result.stages[1]);
		expect(work.scale).toBe(1);
		expect(work.share).toBeCloseTo(3_600_000 / 6_400_000);
		expect(defined(result.stages[0]).scale).toBeCloseTo(1_040_000 / 3_600_000);
	});

	it('marks a stage partial when a row has unknown tokens, disclosing the excluded runs', () => {
		const result = toTokensByStage(statsPartialStages, statsCompleteSummary, cohort);
		const review = result.stages.find((stage) => stage.stage === 'review');

		expect(review?.total).toMatchObject({
			value: 600_000,
			availability: 'partial',
			excludedCount: 3
		});
		expect(result.coverage.excludedCount).toBe(3);
	});

	it('marks a stage unavailable when none of its rows has known tokens', () => {
		const result = toTokensByStage(
			{
				...statsHeaderOnly(statsPartialStages),
				items: statsPartialStages.items.filter(
					(row) => row.stage !== 'review' || row.tokensPerAcceptedOutput === null
				)
			},
			null,
			cohort
		);
		const review = result.stages.find((stage) => stage.stage === 'review');

		expect(review?.total).toMatchObject({
			value: null,
			availability: 'unavailable',
			excludedCount: 3
		});
		expect(review?.scale).toBe(0);
		expect(review?.share).toBeNull();
		expect(result.coverage).toMatchObject({ value: null, availability: 'unavailable' });
	});

	it('keeps a stage with no runs distinct and token categories Unavailable', () => {
		const result = toTokensByStage(statsQaDisabledStages, statsCompleteSummary, cohort);
		const qa = result.stages.find((stage) => stage.stage === 'qa');

		expect(qa).toMatchObject({ noRuns: true });
		expect(result.categories).toMatchObject({
			value: null,
			availability: 'unavailable',
			unavailableReason: CATEGORIES_UNAVAILABLE
		});
		expect(
			toTokensByStage(statsEmptyStages, statsEmptySummary, cohort).categories.availability
		).toBe('unavailable');
	});
});

function statsHeaderOnly({ definitions, factoryId, factoryVersions }: StatsStages) {
	return { definitions, factoryId, factoryVersions };
}

describe('parseCohortWindow', () => {
	it('defaults to the last 30 days from the injected clock', () => {
		const window = parseCohortWindow(params({}), NOW);

		expect(window).toMatchObject({
			from: '2026-09-24T12:34:56Z',
			to: '2026-10-24T12:34:56Z',
			cohortId: '2026-09-24T12:34:56Z/2026-10-24T12:34:56Z',
			isDefault: true,
			notice: null,
			fromLabel: '2026-09-24 12:34 UTC',
			toLabel: '2026-10-24 12:34 UTC'
		});
	});

	it('parses date-only input, with `to` exclusive at the start of the next day', () => {
		const window = parseCohortWindow(params({ from: '2026-10-01', to: '2026-10-07' }), NOW);

		expect(window).toMatchObject({
			from: '2026-10-01T00:00:00Z',
			to: '2026-10-08T00:00:00Z',
			isDefault: false,
			notice: null
		});
	});

	it('parses full Z date-times to whole seconds', () => {
		const window = parseCohortWindow(
			params({ from: '2026-10-01T08:00:00Z', to: '2026-10-02T09:30:15.250Z' }),
			NOW
		);

		expect(window.from).toBe('2026-10-01T08:00:00Z');
		expect(window.to).toBe('2026-10-02T09:30:16Z');
	});

	it('fills a missing bound from the other', () => {
		expect(parseCohortWindow(params({ to: '2026-10-10' }), NOW)).toMatchObject({
			from: '2026-09-11T00:00:00Z',
			to: '2026-10-11T00:00:00Z'
		});
		expect(parseCohortWindow(params({ from: '2026-10-10' }), NOW)).toMatchObject({
			from: '2026-10-10T00:00:00Z',
			to: '2026-10-24T12:34:56Z'
		});
	});

	it.each([
		[{ from: 'yesterday' }],
		[{ to: '2026-02-30' }],
		[{ from: '2026-10-01T08:00:00+02:00' }],
		[{ from: '2026-10-01T25:00:00Z' }],
		[{ from: '2026-10-10', to: '2026-10-01' }],
		[{ from: '2026-10-01T00:00:00Z', to: '2026-10-01T00:00:00Z' }]
	])('falls back to the default with a notice for %o', (query) => {
		const window = parseCohortWindow(params(query), NOW);

		expect(window.isDefault).toBe(true);
		expect(window.notice).toMatch(/last 30 days/);
		expect(window.from).toBe('2026-09-24T12:34:56Z');
		expect(window.to).toBe('2026-10-24T12:34:56Z');
	});

	it('accepts the lowest and highest four-digit-year dates', () => {
		expect(parseCohortWindow(params({ from: '0001-01-01', to: '0001-01-31' }), NOW)).toMatchObject({
			from: '0001-01-01T00:00:00Z',
			to: '0001-02-01T00:00:00Z',
			isDefault: false
		});
		expect(parseCohortWindow(params({ from: '0000-01-01', to: '0000-01-02' }), NOW)).toMatchObject({
			from: '0000-01-01T00:00:00Z',
			isDefault: false
		});
		expect(
			parseCohortWindow(params({ from: '9999-12-01', to: '9999-12-31T23:59:58Z' }), NOW)
		).toMatchObject({ to: '9999-12-31T23:59:58Z', isDefault: false });
	});

	it.each([
		[{ from: '9999-12-01', to: '9999-12-31' }],
		[{ from: '9999-12-01', to: '9999-12-31T23:59:59.999Z' }],
		[{ to: '0000-01-10' }]
	])('falls back when %o cannot become an API timestamp', (query) => {
		const window = parseCohortWindow(params(query), NOW);

		expect(window.isDefault).toBe(true);
		expect(window.notice).toMatch(/outside the dates/);
		expect(window.from).toMatch(API_DATE_TIME);
		expect(window.to).toMatch(API_DATE_TIME);
	});

	it('always emits values matching the API date-time pattern', () => {
		const queries: Array<{ from?: string; to?: string }> = [
			{},
			{ from: '2024-02-29', to: '2024-03-01' },
			{ from: '2026-10-01T08:00:00.999Z' },
			{ from: 'nonsense', to: 'also' },
			{ to: '2026-12-31' },
			{ from: '0001-01-01' },
			{ from: '0000-01-01', to: '0000-01-02' },
			{ to: '9999-12-31' },
			{ to: '9999-12-31T23:59:59.999Z' },
			{ from: '9999-12-31T23:59:58.5Z', to: '9999-12-31T23:59:59Z' }
		];
		for (const query of queries) {
			const window = parseCohortWindow(params(query), NOW);
			expect(window.from).toMatch(API_DATE_TIME);
			expect(window.to).toMatch(API_DATE_TIME);
		}
	});
});

describe('toCohort', () => {
	const window = parseCohortWindow(params({}), NOW);
	const observedAt = '2026-10-24T12:35:00Z';

	it('builds the header from the envelope', () => {
		expect(toCohort(statsCompleteSummary, window, observedAt)).toEqual({
			id: window.cohortId,
			window,
			observedAt,
			factoryId: 'factory-geut-01',
			factoryVersions: ['0.14.0', '0.15.1'],
			definitions: 'stats.v1',
			mismatch: false
		});
	});

	it('uses the first successful envelope and flags a disagreement instead of merging', () => {
		const other = { ...statsCompleteStages, factoryId: 'factory-other' };
		const cohortFrom = toCohort([null, statsCompleteSummary, other], window, observedAt);

		expect(cohortFrom.factoryId).toBe('factory-geut-01');
		expect(cohortFrom.mismatch).toBe(true);
		expect(toCohort([statsCompleteSummary, statsCompleteStages], window, observedAt).mismatch).toBe(
			false
		);
	});

	it('has no factory identity when no read succeeded', () => {
		expect(toCohort([null, null], window, observedAt)).toMatchObject({
			factoryId: null,
			definitions: null,
			factoryVersions: [],
			mismatch: false
		});
	});
});
