/**
 * Cohorts for the stats panel stories, built from the stats fixtures through
 * the real view-model adapters: complete, empty window, zero merges, QA
 * disabled, and partial (a stage whose tokens are unknown).
 */
import {
	statsCompleteStages,
	statsCompleteSummary,
	statsEmptyStages,
	statsEmptySummary,
	statsPartialStages,
	statsQaDisabledStages,
	statsZeroMergesSummary
} from '$lib/factory/fixtures';
import {
	parseCohortWindow,
	toCohort,
	toStageTable,
	toSummaryMetrics,
	toTokensByStage,
	type StatsStages,
	type StatsSummary
} from '$lib/factory/stats';

const window = parseCohortWindow(
	new URLSearchParams({ from: '2026-09-24', to: '2026-10-23' }),
	new Date('2026-10-24T09:00:00Z')
);
const observedAt = '2026-10-24T09:00:00Z';

function cohortOf(summary: StatsSummary, stages: StatsStages) {
	const cohort = toCohort([summary, stages], window, observedAt);
	return {
		cohort,
		summary: toSummaryMetrics(summary, cohort),
		stages: toStageTable(stages, cohort),
		tokens: toTokensByStage(stages, summary, cohort)
	};
}

export const completeCohort = cohortOf(statsCompleteSummary, statsCompleteStages);
export const emptyCohort = cohortOf(statsEmptySummary, statsEmptyStages);
export const zeroMergesCohort = cohortOf(statsZeroMergesSummary, statsCompleteStages);
export const qaDisabledCohort = cohortOf(statsCompleteSummary, statsQaDisabledStages);
export const partialCohort = cohortOf(statsCompleteSummary, statsPartialStages);

/** Every read failed: the header still shows the window. */
export const noReadsCohort = toCohort(null, window, observedAt);

/** The summary and stages came from different factories. */
export const mismatchCohort = toCohort(
	[statsCompleteSummary, { ...statsCompleteStages, factoryId: 'factory-geut-02' }],
	window,
	observedAt
);

export const panelFailure = { title: 'Stats unavailable', retryable: true };
