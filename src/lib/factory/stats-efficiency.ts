/**
 * EfficiencySignals and "No returns to work" view models, built from a parsed
 * `/v1/stats/export` (ticket lines, run lines, completeness, diagnostics).
 * Browser-safe and pure: each figure is computed once here, with its
 * numerator, denominator, sample and availability.
 *
 * The export has no completion marker, so when it is not complete every
 * ratio, share and per-merge figure is Unavailable ("export incomplete"),
 * and counts are `partial`. Rework and infrastructure-lost overlap: they are
 * separate measures with the overlap disclosed, never a partition.
 */
import type { ExportDiagnostic, ExportRunLine, StatsExportParse } from './stats-export';
import {
	DEFINITIONS,
	measured,
	ratioMetric,
	unavailable,
	type Cohort,
	type Metric,
	type MetricUnit,
	type StatsEnvelope
} from './stats';
import { NO_HANDOFFS, waitingBeforeHandoff } from './stats-tickets';

type CohortRef = Pick<Cohort, 'id'>;

export const EXPORT_INCOMPLETE = 'export incomplete';
/** The export read failed, so a figure that needs it cannot be shown. */
export const EXPORT_UNAVAILABLE = 'export unavailable';
export const NO_MERGES = 'no merged executions';
export const NO_KNOWN_USAGE = 'no runs with known usage';

/** Purposes that are rework. A repeat run alone (initial, reentry, infrastructure retry) is not. */
export const REWORK_PURPOSES = ['return_to_work', 'validation_correction'] as const;
export type ReworkPurpose = (typeof REWORK_PURPOSES)[number];
const REWORK_LABELS: Record<ReworkPurpose, string> = {
	return_to_work: 'Return to work',
	validation_correction: 'Validation correction'
};

/**
 * The ticket-line count differs from `summary.started` of the same envelope:
 * the export likely ended early on a clean line boundary.
 */
export const SUMMARY_COUNT_MISMATCH = 'ticket lines differ from the summary';

/** Diagnostics about the whole export rather than one line's content. */
const CROSS_CHECK_REASONS = new Set([SUMMARY_COUNT_MISMATCH]);

/** Diagnostics from the stream itself, not from a line's content. */
const STREAM_REASONS = new Set([
	'read failed',
	'read aborted',
	'byte limit reached',
	'line limit reached'
]);

export type ExportStatus = {
	complete: boolean;
	/** Every diagnostic, whatever its cause. */
	diagnostics: number;
	/** Lines that did not parse or validate, a truncated final line included. */
	malformedLines: number;
	/** The body stopped before its end: a read failure, abort, bound, or truncated line. */
	endedEarly: boolean;
	/** `export incomplete — 2 malformed lines`, or null when complete. */
	reason: string | null;
};

function plural(value: number, one: string, many = `${one}s`): string {
	return `${value} ${value === 1 ? one : many}`;
}

export function toExportStatus(parse: Pick<StatsExportParse, 'complete' | 'diagnostics'>) {
	const diagnostics: readonly ExportDiagnostic[] = parse.diagnostics;
	const malformedLines = diagnostics.filter(
		(item) => !STREAM_REASONS.has(item.reason) && !CROSS_CHECK_REASONS.has(item.reason)
	).length;
	const countMismatch = diagnostics.some((item) => item.reason === SUMMARY_COUNT_MISMATCH);
	const endedEarly = diagnostics.some(
		(item) => STREAM_REASONS.has(item.reason) || item.reason === 'truncated line'
	);
	const complete = parse.complete && diagnostics.length === 0;
	const parts: string[] = [];
	if (malformedLines > 0) parts.push(plural(malformedLines, 'malformed line'));
	if (endedEarly) parts.push('export ended early');
	if (countMismatch) parts.push(SUMMARY_COUNT_MISMATCH);
	if (!complete && parts.length === 0) parts.push(plural(diagnostics.length, 'diagnostic'));
	return {
		complete,
		diagnostics: diagnostics.length,
		malformedLines,
		endedEarly,
		reason: complete ? null : `${EXPORT_INCOMPLETE} — ${parts.join(', ')}`
	} satisfies ExportStatus;
}

/**
 * Cross-check the export against the summary. The export has no completion
 * marker, so when the summary shares its envelope and counts a different
 * number of started executions, the export is not complete. The diagnostic
 * has line 0: it is about the whole export, not one line.
 */
export function reconcileExport(
	parse: StatsExportParse,
	summary: (StatsEnvelope & { started: number }) | null
): StatsExportParse {
	const envelope = parse.envelope;
	const comparable =
		summary !== null &&
		envelope !== null &&
		summary.factoryId === envelope.factoryId &&
		summary.definitions === envelope.definitions;
	if (!comparable || parse.tickets.length === summary.started) return parse;
	return {
		...parse,
		complete: false,
		diagnostics: [...parse.diagnostics, { line: 0, reason: SUMMARY_COUNT_MISMATCH }]
	};
}

/**
 * The export's envelope for `toCohort`, so a factory or definitions mismatch
 * with the other reads is flagged. The export carries no factory versions.
 */
export function toExportEnvelope(parse: Pick<StatsExportParse, 'envelope'>): StatsEnvelope | null {
	return parse.envelope === null ? null : { ...parse.envelope, factoryVersions: [] };
}

// ── Metric builders ─────────────────────────────────────────────────────────

type Spec = {
	key: string;
	label: string;
	cohortId: string;
	definition: string;
	sampleSize: number;
	excludedCount?: number;
};

/** A count: measured when complete, `partial` with the read count otherwise. */
function count(spec: Spec, value: number, status: ExportStatus, unit: MetricUnit = 'count') {
	const metric = measured({ ...spec, unit, value });
	return status.complete
		? metric
		: { ...metric, availability: 'partial' as const, unavailableReason: status.reason ?? '' };
}

/** A share: Unavailable when incomplete or when the sample is empty; never 0. */
function share(
	spec: Spec & { numerator: number; denominator: number },
	status: ExportStatus,
	emptyReason: string
): Metric {
	const parts = { numerator: spec.numerator, denominator: spec.denominator };
	if (!status.complete) {
		return {
			...unavailable({ ...spec, unit: 'ratio', reason: status.reason ?? EXPORT_INCOMPLETE }),
			...parts
		};
	}
	if (spec.sampleSize === 0) {
		return { ...unavailable({ ...spec, unit: 'ratio', reason: emptyReason }), ...parts };
	}
	return ratioMetric(spec);
}

// ── Efficiency signals ──────────────────────────────────────────────────────

export type ReworkPart = {
	purpose: ReworkPurpose;
	label: string;
	/** Known-usage tokens of runs with this purpose. */
	tokens: Metric;
	/** Runs with this purpose, known usage or not. */
	runs: Metric;
	/** This purpose's tokens over known-usage tokens. */
	share: Metric;
};

export type EfficiencySignals = {
	status: ExportStatus;
	/** Ticket lines: executions started in the window. */
	executions: Metric;
	runs: Metric;
	waitingShare: Metric;
	blendedCostPerMerged: Metric;
	rework: {
		share: Metric;
		parts: ReworkPart[];
	};
	/** Runs with known usage over all runs; unknown runs are `excludedCount`. */
	usageCoverage: Metric;
	/** Overlaps with rework: a separate measure, never a partition. */
	infrastructureLost: {
		attempts: Metric;
		tokens: Metric;
		share: Metric;
		/** Runs and tokens counted both here and in rework. */
		overlap: { runs: Metric; tokens: Metric };
	};
};

const known = (run: ExportRunLine) => run.tokensInput !== null;
const isRework = (run: ExportRunLine) =>
	(REWORK_PURPOSES as readonly string[]).includes(run.purpose);
const tokensOf = (runs: readonly ExportRunLine[]) =>
	runs.filter(known).reduce((total, run) => total + run.tokens, 0);

export function toEfficiencySignals(
	parse: Pick<StatsExportParse, 'tickets' | 'runs' | 'complete' | 'diagnostics'>,
	cohort: CohortRef
): EfficiencySignals {
	const cohortId = cohort.id;
	const status = toExportStatus(parse);
	const { tickets, runs } = parse;

	// Waiting share: weighted over the TimeBreakdown sample.
	const eligible = tickets.flatMap((line) =>
		line.startToHandoffMs !== null && line.factoryMs !== null
			? [{ startToHandoffMs: line.startToHandoffMs, factoryMs: line.factoryMs }]
			: []
	);
	const waiting = eligible.reduce((total, line) => total + waitingBeforeHandoff(line), 0);
	const elapsed = eligible.reduce((total, line) => total + line.startToHandoffMs, 0);

	// Blended cost per merged execution.
	const merged = tickets.filter((line) => line.outcome === 'merged').length;
	const cost = tickets.reduce((total, line) => total + line.costUsd, 0);
	const blendedSpec = {
		key: 'blendedCostPerMerged',
		label: 'Blended cost per merged ticket',
		unit: 'USD' as const,
		cohortId,
		definition: DEFINITIONS.blendedCostPerMerged,
		sampleSize: tickets.length
	};
	const blendedParts = { numerator: cost, denominator: merged };
	const blendedCostPerMerged: Metric = !status.complete
		? {
				...unavailable({ ...blendedSpec, reason: status.reason ?? EXPORT_INCOMPLETE }),
				...blendedParts
			}
		: merged === 0
			? { ...unavailable({ ...blendedSpec, reason: NO_MERGES }), ...blendedParts }
			: { ...measured({ ...blendedSpec, value: cost / merged }), ...blendedParts };

	// Token shares: over runs with known usage only.
	const knownRuns = runs.filter(known);
	const unknownRuns = runs.length - knownRuns.length;
	const knownTokens = tokensOf(knownRuns);
	const tokenSpec = (key: string, label: string, definition: string): Spec => ({
		key,
		label,
		cohortId,
		definition,
		sampleSize: knownRuns.length,
		excludedCount: unknownRuns
	});
	const tokenShare = (key: string, label: string, definition: string, numerator: number) =>
		share(
			{ ...tokenSpec(key, label, definition), numerator, denominator: knownTokens },
			status,
			NO_KNOWN_USAGE
		);

	const reworkRuns = runs.filter(isRework);
	const parts = REWORK_PURPOSES.map((purpose) => {
		const purposeRuns = runs.filter((run) => run.purpose === purpose);
		const tokens = tokensOf(purposeRuns);
		const label = REWORK_LABELS[purpose];
		return {
			purpose,
			label,
			tokens: count(
				tokenSpec(`rework.${purpose}.tokens`, `${label} tokens`, DEFINITIONS.reworkPurpose),
				tokens,
				status,
				'tokens'
			),
			runs: count(
				{
					key: `rework.${purpose}.runs`,
					label: `${label} runs`,
					cohortId,
					definition: DEFINITIONS.reworkPurpose,
					sampleSize: runs.length
				},
				purposeRuns.length,
				status
			),
			share: tokenShare(
				`rework.${purpose}.share`,
				`${label} token share`,
				DEFINITIONS.reworkPurpose,
				tokens
			)
		};
	});

	const lost = runs.filter((run) => run.infrastructureLost);
	const overlap = lost.filter(isRework);
	const lostTokens = tokensOf(lost);

	return {
		status,
		executions: count(
			{
				key: 'export.executions',
				label: 'executions',
				cohortId,
				definition: DEFINITIONS.exportExecutions,
				sampleSize: tickets.length
			},
			tickets.length,
			status
		),
		runs: count(
			{
				key: 'export.runs',
				label: 'runs',
				cohortId,
				definition: DEFINITIONS.exportRuns,
				sampleSize: runs.length
			},
			runs.length,
			status
		),
		waitingShare: share(
			{
				key: 'waitingShare',
				label: 'Waiting share',
				cohortId,
				definition: DEFINITIONS.waitingShare,
				sampleSize: eligible.length,
				excludedCount: tickets.length - eligible.length,
				numerator: waiting,
				denominator: elapsed
			},
			status,
			NO_HANDOFFS
		),
		blendedCostPerMerged,
		rework: {
			share: tokenShare(
				'reworkTokenShare',
				'Rework token share',
				DEFINITIONS.reworkTokenShare,
				tokensOf(reworkRuns)
			),
			parts
		},
		usageCoverage: share(
			{
				key: 'usageCoverage',
				label: 'Runs with known usage',
				cohortId,
				definition: DEFINITIONS.usageCoverage,
				sampleSize: runs.length,
				excludedCount: unknownRuns,
				numerator: knownRuns.length,
				denominator: runs.length
			},
			status,
			'no runs in the export'
		),
		infrastructureLost: {
			attempts: count(
				{
					key: 'infrastructureLost.attempts',
					label: 'Infrastructure-lost attempts',
					cohortId,
					definition: DEFINITIONS.infrastructureLostAttempts,
					sampleSize: runs.length
				},
				lost.length,
				status
			),
			tokens: count(
				tokenSpec(
					'infrastructureLost.tokens',
					'Infrastructure-lost tokens',
					DEFINITIONS.infrastructureLostShare
				),
				lostTokens,
				status,
				'tokens'
			),
			share: tokenShare(
				'infrastructureLost.share',
				'Infrastructure-lost token share',
				DEFINITIONS.infrastructureLostShare,
				lostTokens
			),
			overlap: {
				runs: count(
					{
						key: 'infrastructureLost.overlap.runs',
						label: 'Runs also counted as rework',
						cohortId,
						definition: DEFINITIONS.infrastructureReworkOverlap,
						sampleSize: lost.length
					},
					overlap.length,
					status
				),
				tokens: count(
					tokenSpec(
						'infrastructureLost.overlap.tokens',
						'Tokens also counted as rework',
						DEFINITIONS.infrastructureReworkOverlap
					),
					tokensOf(overlap),
					status,
					'tokens'
				)
			}
		}
	};
}

// ── No returns to work ──────────────────────────────────────────────────────

/**
 * Handoff-reached executions with no `return_to_work` run, over handoff-reached
 * executions. Only a return to work excludes one; a correction does not.
 */
export function toNoReturnsToWork(
	parse: Pick<StatsExportParse, 'tickets' | 'runs' | 'complete' | 'diagnostics'>,
	cohort: CohortRef
): Metric {
	const status = toExportStatus(parse);
	const returned = new Set(
		parse.runs.filter((run) => run.purpose === 'return_to_work').map((run) => run.execution)
	);
	const handedOff = parse.tickets.filter((line) => line.handedOffAt !== null);
	return share(
		{
			key: 'noReturnsToWork',
			label: 'No returns to work',
			cohortId: cohort.id,
			definition: DEFINITIONS.noReturnsToWork,
			sampleSize: handedOff.length,
			excludedCount: parse.tickets.length - handedOff.length,
			numerator: handedOff.filter((line) => !returned.has(line.execution)).length,
			denominator: handedOff.length
		},
		status,
		NO_HANDOFFS
	);
}
