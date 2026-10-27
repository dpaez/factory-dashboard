/**
 * View models built from stats ticket fact rows (`/v1/stats/tickets`) and
 * configurations (`/v1/stats/configurations`). Browser-safe and pure.
 *
 * Every row is one execution started in the window. Figures are computed once
 * here, from the fully loaded row set: when the pager stopped early
 * (`complete: false`), every mean, quantile and share is Unavailable and
 * counts are `partial`.
 */
import type { components } from './generated/factory-api';
import { stageLabel } from './format';
import {
	DEFINITIONS,
	STAGE_ORDER,
	measured,
	ratioMetric,
	unavailable,
	type Cohort,
	type Metric,
	type MetricUnit
} from './stats';

type Schemas = components['schemas'];
export type StatsTicketRow = Schemas['StatsTicketRow'];
export type StatsConfigurations = Schemas['StatsConfigurations'];
export type StatsConfigurationRow = Schemas['StatsConfigurationRow'];
type StatsSummary = Schemas['StatsSummary'];
type Interventions = Schemas['Interventions'];
type CohortRef = Pick<Cohort, 'id'>;

export const TICKET_FACTS_INCOMPLETE = 'ticket facts incomplete';
export const NO_HANDOFFS = 'no executions reached handoff';
export const CHANGES_REQUESTED_UNAVAILABLE = 'needs review disposition (geut/factory-skills#63)';
export const SMALL_SAMPLE = 5;

// ── Quantiles ───────────────────────────────────────────────────────────────

function sorted(values: readonly number[]): number[] {
	return [...values].sort((left, right) => left - right);
}

/** The factory's median: the middle value, or the mean of the two middles. Null when empty. */
export function median(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const items = sorted(values);
	const middle = Math.floor(items.length / 2);
	return items.length % 2 === 1
		? (items[middle] ?? null)
		: ((items[middle - 1] ?? 0) + (items[middle] ?? 0)) / 2;
}

/** Nearest-rank P90: `sorted[ceil(0.9·n) − 1]`. Null when empty. */
export function p90(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	return sorted(values)[Math.ceil(0.9 * values.length) - 1] ?? null;
}

function mean(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

// ── Shared metric builders ──────────────────────────────────────────────────

type Spec = {
	key: string;
	label: string;
	unit: MetricUnit;
	cohortId: string;
	definition: string;
	sampleSize: number;
	excludedCount?: number;
};

/**
 * A mean or quantile: Unavailable when the load is incomplete or the sample
 * is empty, never 0.
 */
function aggregate(
	spec: Spec,
	value: number | null,
	complete: boolean,
	emptyReason: string
): Metric {
	if (!complete) return unavailable({ ...spec, reason: TICKET_FACTS_INCOMPLETE });
	if (value === null) return unavailable({ ...spec, reason: emptyReason });
	return measured({ ...spec, value });
}

/** A count: measured when complete, `partial` with the loaded count otherwise. */
function count(spec: Spec, value: number, complete: boolean): Metric {
	const metric = measured({ ...spec, value });
	return complete
		? metric
		: { ...metric, availability: 'partial', unavailableReason: TICKET_FACTS_INCOMPLETE };
}

/** A share: Unavailable when the load is incomplete. */
function share(
	spec: Omit<Spec, 'unit'> & { numerator: number; denominator: number },
	complete: boolean
): Metric {
	if (!complete) {
		return {
			...unavailable({ ...spec, unit: 'ratio', reason: TICKET_FACTS_INCOMPLETE }),
			numerator: spec.numerator,
			denominator: spec.denominator
		};
	}
	return ratioMetric(spec);
}

// ── Time breakdown ──────────────────────────────────────────────────────────

type Eligible = StatsTicketRow & { startToHandoffMs: number; factoryMs: number };

/** Reached handoff with both durations: the one sample every time figure uses. */
function isEligible(row: StatsTicketRow): row is Eligible {
	return row.startToHandoffMs !== null && row.factoryMs !== null;
}

/** Waiting before handoff for one row. Never `waitingMs`, which includes waiting after handoff. */
export function waitingBeforeHandoff(
	row: Pick<Eligible, 'startToHandoffMs' | 'factoryMs'>
): number {
	return row.startToHandoffMs - row.factoryMs;
}

export type OutcomeCount = { outcome: StatsTicketRow['outcome']; count: number };

export type StageTime = {
	stage: string;
	label: string;
	/** No execution in the stage sample ran this stage. */
	noRuns: boolean;
	mean: Metric;
	/** Bar length on the shared duration scale: the longest stage is 1. */
	scale: number;
};

export type TimeBreakdown = {
	complete: boolean;
	/** Executions started in the window (all rows). */
	executions: Metric;
	/** Executions that reached handoff: the time sample. */
	reachedHandoff: Metric;
	sampleSize: number;
	excludedCount: number;
	/** Exclusions by outcome, in API outcome order of first appearance. */
	excludedByOutcome: OutcomeCount[];
	startToHandoff: { mean: Metric; median: Metric; p90: Metric };
	waitingBeforeHandoff: Metric;
	factoryTime: Metric;
	/**
	 * Executions with factory time 0 but a positive start → handoff: the
	 * factory clamps factory time at 0, so their waiting may be overstated.
	 */
	clampedCount: number;
	stages: StageTime[];
	/** Positive factory time not covered by the stage means, or Unavailable. */
	unattributed: Metric;
	/** Σ stage means exceeds factory time by this much (ms), else null. Flagged, not clamped. */
	inconsistencyMs: number | null;
	agentTime: Metric;
	overhead: Metric;
};

export function toTimeBreakdown(
	rows: readonly StatsTicketRow[],
	complete: boolean,
	cohort: CohortRef
): TimeBreakdown {
	const cohortId = cohort.id;
	const eligible = rows.filter(isEligible);
	const n = eligible.length;
	const excluded = rows.filter((row) => !isEligible(row));
	const excludedByOutcome: OutcomeCount[] = [];
	for (const row of excluded) {
		const entry = excludedByOutcome.find((item) => item.outcome === row.outcome);
		if (entry) entry.count += 1;
		else excludedByOutcome.push({ outcome: row.outcome, count: 1 });
	}
	const timeSpec = (key: string, label: string, definition: string): Spec => ({
		key,
		label,
		unit: 'ms',
		cohortId,
		definition,
		sampleSize: n,
		excludedCount: excluded.length
	});
	const timed = (key: string, label: string, definition: string, value: number | null) =>
		aggregate(timeSpec(key, label, definition), value, complete, NO_HANDOFFS);

	const durations = eligible.map((row) => row.startToHandoffMs);

	// Stage time: every eligible execution. A stage absent from an execution,
	// including an empty stage map, counts as 0 for that execution.
	const stageNames: string[] = [...STAGE_ORDER];
	for (const row of eligible) {
		for (const stage of Object.keys(row.stageMs)) {
			if (!stageNames.includes(stage)) stageNames.push(stage);
		}
	}
	const stageMeans = stageNames.map((stage) => ({
		stage,
		noRuns: !eligible.some((row) => (row.stageMs[stage] ?? 0) > 0),
		value: mean(eligible.map((row) => row.stageMs[stage] ?? 0))
	}));
	const longest = Math.max(0, ...stageMeans.map((item) => item.value ?? 0));
	const stageSpec = (key: string, label: string, definition: string): Spec => ({
		key,
		label,
		unit: 'ms',
		cohortId,
		definition,
		sampleSize: n,
		excludedCount: excluded.length
	});
	const stages = stageMeans.map((item) => ({
		stage: item.stage,
		label: stageLabel(item.stage),
		noRuns: item.noRuns,
		mean: aggregate(
			stageSpec(
				`stageTime.${item.stage}`,
				`${stageLabel(item.stage)} stage time`,
				DEFINITIONS.stageTime
			),
			item.value,
			complete,
			NO_HANDOFFS
		),
		scale: !complete || item.value === null || longest === 0 ? 0 : item.value / longest
	}));

	// Unattributed: factory time minus the stage means, over the same executions.
	const factoryMean = mean(eligible.map((row) => row.factoryMs));
	const remainder =
		factoryMean === null ? null : factoryMean - sum(stageMeans.map((item) => item.value ?? 0));
	const unattributedSpec = stageSpec('unattributed', 'Unattributed', DEFINITIONS.unattributed);
	const unattributed =
		remainder !== null && remainder < 0 && complete
			? unavailable({
					...unattributedSpec,
					reason: 'Stage time exceeds factory time for these executions.'
				})
			: aggregate(unattributedSpec, remainder, complete, NO_HANDOFFS);

	const overheads = eligible
		.map((row) => row.overheadMs)
		.filter((value): value is number => value !== null);
	const overheadSpec: Spec = {
		key: 'overhead',
		label: 'Overhead',
		unit: 'ms',
		cohortId,
		definition: DEFINITIONS.overhead,
		sampleSize: overheads.length,
		excludedCount: n - overheads.length
	};
	let overhead = aggregate(
		overheadSpec,
		mean(overheads),
		complete,
		n === 0 ? NO_HANDOFFS : 'no stage timings for executions that reached handoff'
	);
	if (complete && overhead.value !== null && overheads.length < n) {
		overhead = {
			...overhead,
			availability: 'partial',
			unavailableReason: `${n - overheads.length} executions without stage timings are left out.`
		};
	}

	const countSpec = (key: string, label: string, definition: string, sampleSize: number): Spec => ({
		key,
		label,
		unit: 'count',
		cohortId,
		definition,
		sampleSize
	});

	return {
		complete,
		executions: count(
			countSpec('executions', 'executions', DEFINITIONS.executions, rows.length),
			rows.length,
			complete
		),
		reachedHandoff: count(
			{
				...countSpec('reachedHandoff', 'reached handoff', DEFINITIONS.reachedHandoff, rows.length),
				excludedCount: excluded.length
			},
			n,
			complete
		),
		sampleSize: n,
		excludedCount: excluded.length,
		excludedByOutcome,
		startToHandoff: {
			mean: timed(
				'startToHandoff.mean',
				'Mean start → handoff',
				DEFINITIONS.startToHandoff,
				mean(durations)
			),
			median: timed(
				'startToHandoff.median',
				'Median start → handoff',
				DEFINITIONS.startToHandoffMedian,
				median(durations)
			),
			p90: timed(
				'startToHandoff.p90',
				'P90 start → handoff',
				DEFINITIONS.startToHandoffP90,
				p90(durations)
			)
		},
		waitingBeforeHandoff: timed(
			'waitingBeforeHandoff',
			'Waiting before handoff',
			DEFINITIONS.waitingBeforeHandoff,
			mean(eligible.map(waitingBeforeHandoff))
		),
		factoryTime: timed(
			'factoryTime',
			'Factory time',
			DEFINITIONS.factoryTime,
			mean(eligible.map((row) => row.factoryMs))
		),
		clampedCount: eligible.filter((row) => row.factoryMs === 0 && row.startToHandoffMs > 0).length,
		stages,
		unattributed,
		inconsistencyMs: complete && remainder !== null && remainder < 0 ? -remainder : null,
		agentTime: timed(
			'agentTime',
			'Agent time',
			DEFINITIONS.agentTime,
			mean(eligible.map((row) => row.agentMs))
		),
		overhead
	};
}

// ── Tickets quality ─────────────────────────────────────────────────────────

export const INTERVENTION_KINDS = [
	['questions', 'Questions'],
	['limitPauses', 'Limit pauses'],
	['replies', 'Replies'],
	['manualRetries', 'Manual retries'],
	['manualCompletes', 'Manual completes'],
	['stops', 'Stops']
] as const satisfies ReadonlyArray<readonly [keyof Interventions, string]>;

export type InterventionKind = (typeof INTERVENTION_KINDS)[number][0];

function interventionTotal(row: StatsTicketRow): number {
	return sum(Object.values(row.interventions));
}

/** Executions with a merged or abandoned pull request: the external review rounds sample. */
function hasPullRequest(row: StatsTicketRow): boolean {
	return row.outcome === 'merged' || row.outcome === 'abandoned';
}

export type InterventionCount = { kind: InterventionKind; label: string; count: Metric };

export type TicketsQuality = {
	complete: boolean;
	neededAPerson: Metric;
	interventions: InterventionCount[];
	/**
	 * True when the rows agree with the summary's needed-a-person count,
	 * intervention totals and started count; null without a summary or with
	 * an incomplete load.
	 */
	reconciled: boolean | null;
	externalReviewRounds: {
		/** Executions with a merged or abandoned pull request. */
		sampleSize: number;
		total: Metric;
		human: Metric;
		bot: Metric;
		median: Metric;
	};
	/** Always Unavailable until review disposition facts exist. */
	externalChangesRequested: Metric;
	followUpCommits: Metric;
};

export function toTicketsQuality(
	rows: readonly StatsTicketRow[],
	summary: StatsSummary | null,
	complete: boolean,
	cohort: CohortRef
): TicketsQuality {
	const cohortId = cohort.id;
	const needed = rows.filter((row) => interventionTotal(row) > 0).length;
	const totals = Object.fromEntries(
		INTERVENTION_KINDS.map(([kind]) => [kind, sum(rows.map((row) => row.interventions[kind]))])
	) as Record<InterventionKind, number>;
	const withPullRequest = rows.filter(hasPullRequest);
	const handedOff = rows.filter((row) => row.handedOffAt !== null);
	const roundsSpec = (key: string, label: string): Spec => ({
		key,
		label,
		unit: 'count',
		cohortId,
		definition: DEFINITIONS.externalReviewRounds,
		sampleSize: withPullRequest.length
	});

	const reconciled =
		summary === null || !complete
			? null
			: summary.neededAPerson === needed &&
				summary.started === rows.length &&
				INTERVENTION_KINDS.every(([kind]) => summary.interventions[kind] === totals[kind]);

	return {
		complete,
		neededAPerson: share(
			{
				key: 'neededAPerson',
				label: 'Needed a person',
				cohortId,
				definition: DEFINITIONS.neededAPerson,
				sampleSize: rows.length,
				numerator: needed,
				denominator: rows.length
			},
			complete
		),
		interventions: INTERVENTION_KINDS.map(([kind, label]) => ({
			kind,
			label,
			count: count(
				{
					key: `interventions.${kind}`,
					label,
					unit: 'count',
					cohortId,
					definition: DEFINITIONS.intervention,
					sampleSize: rows.length
				},
				totals[kind],
				complete
			)
		})),
		reconciled,
		externalReviewRounds: {
			sampleSize: withPullRequest.length,
			total: count(
				roundsSpec('externalReviewRounds.total', 'External review rounds'),
				sum(withPullRequest.map((row) => row.externalReviewRounds.total)),
				complete
			),
			human: count(
				roundsSpec('externalReviewRounds.human', 'Human'),
				sum(withPullRequest.map((row) => row.externalReviewRounds.human)),
				complete
			),
			bot: count(
				roundsSpec('externalReviewRounds.bot', 'Bot'),
				sum(withPullRequest.map((row) => row.externalReviewRounds.bot)),
				complete
			),
			median: aggregate(
				{
					...roundsSpec('externalReviewRounds.median', 'Median external review rounds'),
					definition: DEFINITIONS.externalReviewRoundsMedian
				},
				median(withPullRequest.map((row) => row.externalReviewRounds.total)),
				complete,
				'no executions with a merged or abandoned pull request'
			)
		},
		externalChangesRequested: unavailable({
			key: 'externalChangesRequested',
			label: 'External changes requested',
			unit: 'ratio',
			cohortId,
			definition: DEFINITIONS.externalChangesRequested,
			reason: CHANGES_REQUESTED_UNAVAILABLE
		}),
		followUpCommits: count(
			{
				key: 'followUpCommits',
				label: 'Follow-up commits after handoff',
				unit: 'count',
				cohortId,
				definition: DEFINITIONS.followUpCommits,
				sampleSize: handedOff.length
			},
			sum(handedOff.map((row) => row.followUpCommits)),
			complete
		)
	};
}

// ── Contributors ────────────────────────────────────────────────────────────

export const CONTRIBUTOR_MEASURES = [
	'timeSample',
	'timeExcluded',
	'neededAPerson',
	'externalReviewRounds',
	'followUpCommits'
] as const;
export type ContributorMeasure = (typeof CONTRIBUTOR_MEASURES)[number];

export type ContributorRow = {
	key: string;
	displayRef: string;
	outcome: StatsTicketRow['outcome'];
	startedAt: string;
	/** The measure's value for this execution; null when it has none (excluded rows). */
	value: number | null;
	unit: MetricUnit;
	/** Why this execution belongs to the population. */
	reason: string;
	/** Drill-down to this execution through the resolver. */
	href: string;
};

export type Contributors = {
	measure: ContributorMeasure;
	label: string;
	definition: string;
	rows: ContributorRow[];
};

/** The resolver link for one execution: `/stats/execution?key=…&startedAt=…`. */
export function executionHref(key: string, startedAt: string): string {
	return `/stats/execution?${new URLSearchParams({ key, startedAt })}`;
}

function plural(value: number, one: string, many = `${one}s`): string {
	return `${value} ${value === 1 ? one : many}`;
}

const INTERVENTION_WORDS: Record<InterventionKind, [string, string]> = {
	questions: ['question', 'questions'],
	limitPauses: ['limit pause', 'limit pauses'],
	replies: ['reply', 'replies'],
	manualRetries: ['manual retry', 'manual retries'],
	manualCompletes: ['manual complete', 'manual completes'],
	stops: ['stop', 'stops']
};

type Population = {
	label: string;
	definition: string;
	unit: MetricUnit;
	includes: (row: StatsTicketRow) => boolean;
	value: (row: StatsTicketRow) => number | null;
	reason: (row: StatsTicketRow) => string;
};

const POPULATIONS: Record<ContributorMeasure, Population> = {
	timeSample: {
		label: 'Reached handoff',
		definition: DEFINITIONS.startToHandoff,
		unit: 'ms',
		includes: isEligible,
		value: (row) => row.startToHandoffMs,
		reason: () => 'start → handoff'
	},
	timeExcluded: {
		label: 'Excluded from time figures',
		definition: 'Executions started in the window that did not reach handoff.',
		unit: 'ms',
		includes: (row) => !isEligible(row),
		value: () => null,
		reason: (row) => `${row.outcome}, no handoff`
	},
	neededAPerson: {
		label: 'Needed a person',
		definition: DEFINITIONS.neededAPerson,
		unit: 'count',
		includes: (row) => interventionTotal(row) > 0,
		value: interventionTotal,
		reason: (row) =>
			INTERVENTION_KINDS.filter(([kind]) => row.interventions[kind] > 0)
				.map(([kind]) => {
					const [one, many] = INTERVENTION_WORDS[kind];
					return plural(row.interventions[kind], one, many);
				})
				.join(', ')
	},
	externalReviewRounds: {
		label: 'External review rounds',
		definition: DEFINITIONS.externalReviewRounds,
		unit: 'count',
		// The figure's sample: merged or abandoned pull requests with rounds.
		includes: (row) => hasPullRequest(row) && row.externalReviewRounds.total > 0,
		value: (row) => row.externalReviewRounds.total,
		reason: (row) => `${row.externalReviewRounds.human} human, ${row.externalReviewRounds.bot} bot`
	},
	followUpCommits: {
		label: 'Follow-up commits after handoff',
		definition: DEFINITIONS.followUpCommits,
		unit: 'count',
		includes: (row) => row.handedOffAt !== null && row.followUpCommits > 0,
		value: (row) => row.followUpCommits,
		reason: (row) => plural(row.followUpCommits, 'follow-up commit')
	}
};

/** The exact executions behind one figure, in API order (oldest start first). */
export function toContributors(
	rows: readonly StatsTicketRow[],
	measure: ContributorMeasure
): Contributors {
	const population = POPULATIONS[measure];
	return {
		measure,
		label: population.label,
		definition: population.definition,
		rows: rows.filter(population.includes).map((row) => ({
			key: row.key,
			displayRef: row.displayRef,
			outcome: row.outcome,
			startedAt: row.startedAt,
			value: population.value(row),
			unit: population.unit,
			reason: population.reason(row),
			href: executionHref(row.key, row.startedAt)
		}))
	};
}

// ── Configuration comparison ────────────────────────────────────────────────

export type ConfigurationStage = { stage: string; label: string; setup: string };

export type ConfigurationRow = {
	configuration: string;
	stages: ConfigurationStage[];
	tickets: Metric;
	merged: Metric;
	mergeRate: Metric;
	medianFactoryTime: Metric;
	medianCost: Metric;
	medianExternalReviewRounds: Metric;
	interventions: Metric;
	/** Fewer than SMALL_SAMPLE executions. */
	smallSample: boolean;
};

export type ConfigurationComparison = {
	rows: ConfigurationRow[];
	factoryVersions: string[];
};

/**
 * `plan=model · thinking work=…` into stage/setup pairs. A setup may contain
 * spaces, so a pair ends only where the next `stage=` token begins.
 */
export function parseConfiguration(configuration: string): ConfigurationStage[] {
	return configuration
		.trim()
		.split(/\s+(?=[^\s=]+=)/)
		.filter((part) => part !== '')
		.map((part) => {
			const at = part.indexOf('=');
			if (at === -1) return { stage: '', label: '', setup: part };
			const stage = part.slice(0, at);
			return { stage, label: stageLabel(stage), setup: part.slice(at + 1) };
		});
}

export function toConfigurationComparison(
	configs: StatsConfigurations,
	cohort: CohortRef
): ConfigurationComparison {
	const cohortId = cohort.id;
	return {
		factoryVersions: [...configs.factoryVersions],
		rows: configs.items.map((row) => {
			const spec = (key: string, label: string, unit: MetricUnit, definition: string): Spec => ({
				key: `configuration.${key}`,
				label,
				unit,
				cohortId,
				definition,
				sampleSize: row.tickets
			});
			const reported = (s: Spec, value: number | null, reason: string) =>
				value === null ? unavailable({ ...s, reason }) : measured({ ...s, value });
			return {
				configuration: row.configuration,
				stages: parseConfiguration(row.configuration),
				tickets: measured({
					...spec('tickets', 'Executions', 'count', DEFINITIONS.configurationTickets),
					value: row.tickets
				}),
				merged: measured({
					...spec('merged', 'Merged', 'count', DEFINITIONS.configurationMerged),
					value: row.merged
				}),
				mergeRate: reported(
					spec('mergeRate', 'Merge rate', 'ratio', DEFINITIONS.mergeRate),
					row.mergeRate,
					'No merged, abandoned, or cancelled executions with this configuration.'
				),
				medianFactoryTime: reported(
					spec(
						'medianFactoryTime',
						'Median factory time',
						'ms',
						DEFINITIONS.configurationMedianFactoryTime
					),
					row.medianFactoryMs,
					NO_HANDOFFS
				),
				medianCost: reported(
					spec('medianCost', 'Median cost', 'USD', DEFINITIONS.configurationMedianCost),
					row.medianCostUsd,
					'The factory did not report a median cost for this configuration.'
				),
				medianExternalReviewRounds: reported(
					spec(
						'medianExternalReviewRounds',
						'Median external review rounds',
						'count',
						DEFINITIONS.configurationMedianExternalReviewRounds
					),
					row.medianExternalReviewRounds,
					'no executions with a merged or abandoned pull request'
				),
				interventions: measured({
					...spec(
						'interventions',
						'Interventions',
						'count',
						DEFINITIONS.configurationInterventions
					),
					value: row.interventions
				}),
				smallSample: row.tickets < SMALL_SAMPLE
			};
		})
	};
}
