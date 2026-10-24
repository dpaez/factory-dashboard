/**
 * Factory stats view models. Browser-safe and pure: every stats panel reads
 * its figures from here, so each figure is computed once under stats.v1, with
 * its denominator and availability. Unknown stays `null` (Unavailable), never 0.
 */
import type { components } from './generated/factory-api';
import { formatTimestamp, stageLabel } from './format';

type Schemas = components['schemas'];
export type StatsSummary = Schemas['StatsSummary'];
export type StatsStages = Schemas['StatsStages'];
export type StatsStageRow = Schemas['StatsStageRow'];
export type StatsEnvelope = Pick<StatsSummary, 'definitions' | 'factoryId' | 'factoryVersions'>;

export const STATS_DEFINITIONS = 'stats.v1';

// ── Metric ──────────────────────────────────────────────────────────────────

export type MetricUnit = 'tokens' | 'USD' | 'ms' | 'count' | 'ratio';
export type Availability = 'complete' | 'partial' | 'unavailable';

/** The spec 04 Metric contract. */
export type Metric = {
	key: string;
	label: string;
	value: number | null;
	unit: MetricUnit;
	numerator?: number;
	denominator?: number;
	sampleSize: number | null;
	availability: Availability;
	cohortId: string;
	definition: string;
	excludedCount?: number;
	unavailableReason?: string;
};

type MetricBase = Pick<Metric, 'key' | 'label' | 'unit' | 'cohortId' | 'definition'> & {
	sampleSize?: number | null;
	excludedCount?: number;
};

const ZERO_DENOMINATOR = 'No outputs in the denominator for this cohort.';
const NOT_REPORTED = 'The factory did not report this figure for this cohort.';

function base(spec: MetricBase): Omit<Metric, 'value' | 'availability'> {
	const metric: Omit<Metric, 'value' | 'availability'> = {
		key: spec.key,
		label: spec.label,
		unit: spec.unit,
		sampleSize: spec.sampleSize ?? null,
		cohortId: spec.cohortId,
		definition: spec.definition
	};
	if (spec.excludedCount !== undefined) metric.excludedCount = spec.excludedCount;
	return metric;
}

/** A measured figure. Zero is a measurement. */
export function measured(spec: MetricBase & { value: number }): Metric {
	return { ...base(spec), value: spec.value, availability: 'complete' };
}

/** A figure the cohort cannot supply. */
export function unavailable(spec: MetricBase & { reason: string }): Metric {
	return {
		...base(spec),
		value: null,
		availability: 'unavailable',
		unavailableReason: spec.reason
	};
}

/** `numerator / denominator`, Unavailable when the denominator is 0. */
export function ratioMetric(
	spec: Omit<MetricBase, 'unit'> & { numerator: number; denominator: number }
): Metric {
	const shared = { ...spec, unit: 'ratio' as const };
	const metric =
		spec.denominator === 0
			? unavailable({ ...shared, reason: ZERO_DENOMINATOR })
			: measured({ ...shared, value: spec.numerator / spec.denominator });
	return { ...metric, numerator: spec.numerator, denominator: spec.denominator };
}

/** A figure the API reports as `number | null`; null stays Unavailable. */
function reported(spec: MetricBase & { value: number | null; reason?: string }): Metric {
	return spec.value === null
		? unavailable({ ...spec, reason: spec.reason ?? NOT_REPORTED })
		: measured({ ...spec, value: spec.value });
}

// ── Cohort window ───────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
export const DEFAULT_WINDOW_DAYS = 30;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?Z$/;

export type CohortWindow = {
	/** API value: tickets started at or after this time. */
	from: string;
	/** API value: tickets started before this time (exclusive). */
	to: string;
	cohortId: string;
	fromLabel: string;
	toLabel: string;
	/** True when no valid window was requested and the default applies. */
	isDefault: boolean;
	/** Why the requested window was replaced by the default, if it was. */
	notice: string | null;
};

/** `YYYY-MM-DDTHH:MM:SSZ`: whole seconds, which the API pattern always accepts. */
function apiTime(ms: number): string {
	return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
}

/** The API pattern allows four-digit years only: 0000-01-01 through 9999-12-31. */
const MIN_API_MS = new Date('0000-01-01T00:00:00Z').getTime();
const MAX_API_MS = new Date('9999-12-31T23:59:59Z').getTime();

function representable(ms: number): boolean {
	return Number.isFinite(ms) && ms >= MIN_API_MS && ms <= MAX_API_MS;
}

function validDay([, year = '', month = '', day = '']: RegExpExecArray): number | null {
	// setUTCFullYear, unlike Date.UTC, does not map years 0–99 to 1900–1999.
	const date = new Date(0);
	date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
	const ms = date.getTime();
	if (!Number.isFinite(ms)) return null;
	return date.toISOString().slice(0, 10) === `${year}-${month}-${day}` ? ms : null;
}

/** Epoch ms for one bound, or null when the input is not a valid date. */
function parseBound(raw: string, bound: 'from' | 'to'): number | null {
	const value = raw.trim();
	const dateOnly = DATE_ONLY.exec(value);
	if (dateOnly) {
		const day = validDay(dateOnly);
		if (day === null) return null;
		// `to` is exclusive: a date-only `to` includes that whole day.
		return bound === 'to' ? day + DAY_MS : day;
	}
	const dateTime = DATE_TIME.exec(value);
	if (!dateTime) return null;
	const day = validDay(dateTime);
	if (day === null) return null;
	const ms = Date.parse(value);
	if (Number.isNaN(ms)) return null;
	// Whole seconds without narrowing the window: floor `from`, ceil `to`.
	return bound === 'from' ? Math.floor(ms / 1_000) * 1_000 : Math.ceil(ms / 1_000) * 1_000;
}

function windowOf(fromMs: number, toMs: number, isDefault: boolean, notice: string | null) {
	const from = apiTime(fromMs);
	const to = apiTime(toMs);
	return {
		from,
		to,
		cohortId: `${from}/${to}`,
		fromLabel: formatTimestamp(from),
		toLabel: formatTimestamp(to),
		isDefault,
		notice
	} satisfies CohortWindow;
}

/**
 * The cohort window from URL search params. Defaults to the last 30 days
 * ending now. An invalid or inverted window falls back to the default with a
 * notice, so an invalid query never reaches the API.
 */
export function parseCohortWindow(params: URLSearchParams, now: Date = new Date()): CohortWindow {
	const nowMs = Math.floor(now.getTime() / 1_000) * 1_000;
	const fallback = (notice: string | null) =>
		windowOf(nowMs - DEFAULT_WINDOW_DAYS * DAY_MS, nowMs, true, notice);

	const rawFrom = params.get('from')?.trim() || null;
	const rawTo = params.get('to')?.trim() || null;
	if (rawFrom === null && rawTo === null) return fallback(null);

	const toMs = rawTo === null ? nowMs : parseBound(rawTo, 'to');
	if (toMs === null) {
		return fallback(
			`"${rawTo}" is not a valid date. Showing the last ${DEFAULT_WINDOW_DAYS} days.`
		);
	}
	const fromMs =
		rawFrom === null ? toMs - DEFAULT_WINDOW_DAYS * DAY_MS : parseBound(rawFrom, 'from');
	if (fromMs === null) {
		return fallback(
			`"${rawFrom}" is not a valid date. Showing the last ${DEFAULT_WINDOW_DAYS} days.`
		);
	}
	if (!representable(fromMs) || !representable(toMs)) {
		return fallback(
			`The window is outside the dates the factory accepts. Showing the last ${DEFAULT_WINDOW_DAYS} days.`
		);
	}
	if (fromMs >= toMs) {
		return fallback(
			`The window must start before it ends. Showing the last ${DEFAULT_WINDOW_DAYS} days.`
		);
	}
	return windowOf(fromMs, toMs, false, null);
}

// ── Cohort ──────────────────────────────────────────────────────────────────

export type Cohort = {
	id: string;
	window: CohortWindow;
	observedAt: string;
	factoryId: string | null;
	factoryVersions: string[];
	definitions: string | null;
	/** The reads disagree on factoryId or definitions; figures may not compare. */
	mismatch: boolean;
};

/**
 * The cohort header: the first successful envelope describes the factory.
 * Envelopes that disagree on factoryId or definitions are flagged, not merged.
 */
export function toCohort(
	envelope: StatsEnvelope | null | ReadonlyArray<StatsEnvelope | null | undefined>,
	window: CohortWindow,
	observedAt: string
): Cohort {
	const envelopes = (Array.isArray(envelope) ? envelope : [envelope]).filter(
		(item): item is StatsEnvelope => item != null
	);
	const [first] = envelopes;
	return {
		id: window.cohortId,
		window,
		observedAt,
		factoryId: first?.factoryId ?? null,
		factoryVersions: first ? [...first.factoryVersions] : [],
		definitions: first?.definitions ?? null,
		mismatch: envelopes.some(
			(item) => item.factoryId !== first?.factoryId || item.definitions !== first?.definitions
		)
	};
}

type CohortRef = Pick<Cohort, 'id'>;

// ── Summary ─────────────────────────────────────────────────────────────────

export const OUTCOME_ORDER = ['merged', 'abandoned', 'cancelled', 'open', 'unknown'] as const;
export type Outcome = (typeof OUTCOME_ORDER)[number];

export type SummaryMetrics = {
	tokens: Metric;
	cost: Metric;
	mergeRate: Metric;
	/** Outcome counts, in OUTCOME_ORDER. */
	outcomes: Metric[];
	started: Metric;
};

export const DEFINITIONS = {
	tokens: 'Sum of run tokens for tickets started in the window, all outcomes.',
	cost: 'Sum of run cost (USD) for tickets started in the window, all outcomes.',
	mergeRate:
		'Merged over merged, abandoned, and cancelled. Open and unknown outcomes are left out.',
	outcome: 'Tickets started in the window with this outcome.',
	started: 'Tickets started in the window.',
	firstPassAcceptance: 'Initial runs accepted on the first pass over initial runs with a verdict.',
	correctionsPerAcceptedOutput: 'Validation-correction runs per accepted output.',
	returnsToWork: 'Runs returned to work, by the stage that sent the task back.',
	reviewRoundsPerTask: 'Mean of the highest round per task.',
	tokensPerAcceptedOutput: 'Run tokens over accepted outputs.',
	costUsdPerAcceptedOutput: 'Run cost (USD) over accepted outputs.',
	agentMs: 'Sum of agent time across runs.',
	infrastructureLost: 'Attempts lost to infrastructure.',
	runs: 'Runs of this stage and model setup.',
	acceptedOutputs: 'Runs whose output was accepted.',
	stageTokens: 'Tokens per accepted output × accepted outputs, summed over model setups (rounded).',
	coverage: 'Known stage tokens over cohort tokens.',
	tokenCategories: 'Input, cache read, cache write, and output tokens.'
} as const;

export function toSummaryMetrics(summary: StatsSummary, cohort: CohortRef): SummaryMetrics {
	const cohortId = cohort.id;
	const sampleSize = summary.started;
	const { merged, abandoned, cancelled, open, unknown } = summary.outcomes;
	return {
		tokens: measured({
			key: 'tokens',
			label: 'Total tokens',
			unit: 'tokens',
			value: summary.tokens,
			sampleSize,
			cohortId,
			definition: DEFINITIONS.tokens
		}),
		cost: measured({
			key: 'costUsd',
			label: 'Total cost',
			unit: 'USD',
			value: summary.costUsd,
			sampleSize,
			cohortId,
			definition: DEFINITIONS.cost
		}),
		mergeRate: ratioMetric({
			key: 'mergeRate',
			label: 'Merge rate',
			numerator: merged,
			denominator: merged + abandoned + cancelled,
			excludedCount: open + unknown,
			sampleSize,
			cohortId,
			definition: DEFINITIONS.mergeRate
		}),
		outcomes: OUTCOME_ORDER.map((outcome) =>
			measured({
				key: outcome,
				label: outcome,
				unit: 'count',
				value: summary.outcomes[outcome],
				sampleSize,
				cohortId,
				definition: DEFINITIONS.outcome
			})
		),
		started: measured({
			key: 'started',
			label: 'started',
			unit: 'count',
			value: summary.started,
			sampleSize,
			cohortId,
			definition: DEFINITIONS.started
		})
	};
}

// ── Stages ──────────────────────────────────────────────────────────────────

export const STAGE_ORDER = ['plan', 'work', 'qa', 'review', 'wrapup'] as const;
/** Origins that always show in returns to work; others follow in API order. */
export const RETURN_ORIGINS = ['qa', 'review'] as const;

/** Known stages first in STAGE_ORDER, then unknown stages in API order. */
function groupByStage(rows: readonly StatsStageRow[]): Array<[string, StatsStageRow[]]> {
	const groups = new Map<string, StatsStageRow[]>(STAGE_ORDER.map((stage) => [stage, []]));
	for (const row of rows) {
		const group = groups.get(row.stage);
		if (group) group.push(row);
		else groups.set(row.stage, [row]);
	}
	return [...groups.entries()];
}

export type ReturnToWork = { origin: string; label: string; count: Metric };

export type StageRowMetrics = {
	firstPassAcceptance: Metric;
	correctionsPerAcceptedOutput: Metric;
	reviewRoundsPerTask: Metric;
	tokensPerAcceptedOutput: Metric;
	costUsdPerAcceptedOutput: Metric;
	agentMs: Metric;
	infrastructureLost: Metric;
	runs: Metric;
	acceptedOutputs: Metric;
};

export type StageSetupRow = {
	stage: string;
	setup: string;
	model: string;
	thinking: string;
	metrics: StageRowMetrics;
	returnsToWork: ReturnToWork[];
};

export type StageGroup = {
	stage: string;
	label: string;
	/** No runs of this stage in the cohort: distinct from zero and from Unavailable. */
	noRuns: boolean;
	rows: StageSetupRow[];
};

function toSetupRow(row: StatsStageRow, cohortId: string): StageSetupRow {
	const runs = row.runs;
	const accepted = row.acceptedOutputs;
	const perAccepted = (
		key: 'correctionsPerAcceptedOutput' | 'tokensPerAcceptedOutput' | 'costUsdPerAcceptedOutput',
		label: string,
		unit: MetricUnit
	) => {
		const metric = reported({
			key,
			label,
			unit,
			value: row[key],
			sampleSize: accepted,
			cohortId,
			definition: DEFINITIONS[key],
			reason: accepted === 0 ? 'No accepted outputs for this model setup.' : undefined
		});
		return metric.value === null ? metric : { ...metric, denominator: accepted };
	};
	const count = (
		key: 'agentMs' | 'infrastructureLost' | 'runs' | 'acceptedOutputs',
		label: string,
		unit: MetricUnit
	) =>
		measured({
			key,
			label,
			unit,
			value: row[key],
			sampleSize: runs,
			cohortId,
			definition: DEFINITIONS[key]
		});
	const returns = Object.entries(row.returnsToWork);
	const origins = [
		...RETURN_ORIGINS,
		...returns
			.map(([origin]) => origin)
			.filter((origin) => !RETURN_ORIGINS.includes(origin as never))
	];
	return {
		stage: row.stage,
		setup: row.setup,
		model: row.model,
		thinking: row.thinking,
		metrics: {
			firstPassAcceptance: reported({
				key: 'firstPassAcceptance',
				label: 'First-pass acceptance',
				unit: 'ratio',
				value: row.firstPassAcceptance,
				// Validated initial runs, which stats.v1 does not report.
				sampleSize: null,
				cohortId,
				definition: DEFINITIONS.firstPassAcceptance
			}),
			correctionsPerAcceptedOutput: perAccepted(
				'correctionsPerAcceptedOutput',
				'Corrections per accepted output',
				'ratio'
			),
			reviewRoundsPerTask: reported({
				key: 'reviewRoundsPerTask',
				label: 'Review rounds per task',
				unit: 'ratio',
				value: row.reviewRoundsPerTask,
				// Distinct tasks, which stats.v1 does not report.
				sampleSize: null,
				cohortId,
				definition: DEFINITIONS.reviewRoundsPerTask
			}),
			tokensPerAcceptedOutput: perAccepted(
				'tokensPerAcceptedOutput',
				'Tokens per accepted output',
				'tokens'
			),
			costUsdPerAcceptedOutput: perAccepted(
				'costUsdPerAcceptedOutput',
				'Cost per accepted output',
				'USD'
			),
			agentMs: count('agentMs', 'Agent time', 'ms'),
			infrastructureLost: count('infrastructureLost', 'Infrastructure-lost attempts', 'count'),
			runs: count('runs', 'Runs', 'count'),
			acceptedOutputs: count('acceptedOutputs', 'Accepted outputs', 'count')
		},
		returnsToWork: origins.map((origin) => ({
			origin,
			label: stageLabel(origin),
			count: measured({
				key: `returnsToWork.${origin}`,
				label: `Returns to work from ${stageLabel(origin)}`,
				unit: 'count',
				value: row.returnsToWork[origin] ?? 0,
				sampleSize: runs,
				cohortId,
				definition: DEFINITIONS.returnsToWork
			})
		}))
	};
}

/** One group per stage, ordered plan, work, QA, review, wrapup, then unknown stages. */
export function toStageTable(stages: StatsStages, cohort: CohortRef): StageGroup[] {
	return groupByStage(stages.items).map(([stage, rows]) => ({
		stage,
		label: stageLabel(stage),
		noRuns: rows.length === 0,
		rows: rows.map((row) => toSetupRow(row, cohort.id))
	}));
}

// ── Tokens by stage ─────────────────────────────────────────────────────────

export type StageTokens = {
	stage: string;
	label: string;
	noRuns: boolean;
	total: Metric;
	/** Share of the summed known stage totals, or null when unknown. */
	share: number | null;
	/** Bar length on the shared scale: the largest stage is 1. */
	scale: number;
};

export type TokensByStage = {
	stages: StageTokens[];
	/** Sum of the known stage totals. */
	knownTotal: number;
	/** Known stage tokens over `summary.tokens`. */
	coverage: Metric;
	/** Always Unavailable until stats facts carry categories. */
	categories: Metric;
};

export const CATEGORIES_UNAVAILABLE = 'not in stats.v1 (geut/factory-skills#62)';

function stageTotal(stage: string, rows: StatsStageRow[], cohortId: string): Metric {
	let total = 0;
	let known = 0;
	let excluded = 0;
	for (const row of rows) {
		if (row.tokensPerAcceptedOutput === null) {
			if (row.runs > 0) excluded += row.runs;
			continue;
		}
		known += 1;
		total += Math.round(row.tokensPerAcceptedOutput * row.acceptedOutputs);
	}
	const spec = {
		key: `tokens.${stage}`,
		label: `${stageLabel(stage)} tokens`,
		unit: 'tokens' as const,
		sampleSize: rows.reduce((sum, row) => sum + row.runs, 0),
		cohortId,
		definition: DEFINITIONS.stageTokens
	};
	if (excluded === 0) return measured({ ...spec, value: total });
	if (known === 0) {
		return unavailable({
			...spec,
			excludedCount: excluded,
			reason: 'No accepted outputs, so the factory reports no tokens for this stage.'
		});
	}
	return {
		...measured({ ...spec, value: total, excludedCount: excluded }),
		availability: 'partial',
		unavailableReason: `${excluded} runs without accepted outputs have unknown tokens.`
	};
}

export function toTokensByStage(
	stages: StatsStages,
	summary: StatsSummary | null,
	cohort: CohortRef
): TokensByStage {
	const cohortId = cohort.id;
	const totals = groupByStage(stages.items).map(([stage, rows]) => ({
		stage,
		label: stageLabel(stage),
		noRuns: rows.length === 0,
		total: stageTotal(stage, rows, cohortId)
	}));
	const knownTotal = totals.reduce((sum, item) => sum + (item.total.value ?? 0), 0);
	const max = Math.max(0, ...totals.map((item) => item.total.value ?? 0));
	const excluded = totals.reduce((sum, item) => sum + (item.total.excludedCount ?? 0), 0);
	const coverageSpec = {
		key: 'tokens.coverage',
		label: 'Coverage of cohort tokens',
		cohortId,
		definition: DEFINITIONS.coverage,
		...(excluded > 0 ? { excludedCount: excluded } : {})
	};
	return {
		stages: totals.map((item) => ({
			...item,
			share: item.total.value === null || knownTotal === 0 ? null : item.total.value / knownTotal,
			scale: item.total.value === null || max === 0 ? 0 : item.total.value / max
		})),
		knownTotal,
		coverage:
			summary === null
				? unavailable({
						...coverageSpec,
						unit: 'ratio',
						reason: 'The cohort summary is unavailable.'
					})
				: ratioMetric({
						...coverageSpec,
						numerator: knownTotal,
						denominator: summary.tokens,
						sampleSize: summary.started
					}),
		categories: unavailable({
			key: 'tokens.categories',
			label: 'Token categories',
			unit: 'tokens',
			cohortId,
			definition: DEFINITIONS.tokenCategories,
			reason: CATEGORIES_UNAVAILABLE
		})
	};
}
