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
	statsConfigurations,
	statsTicketsComplete,
	statsTicketsMissingTimings,
	statsTicketsNoHandoffs,
	statsTicketsPageOne,
	statsTicketsSmallSample,
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
import {
	toConfigurationComparison,
	toContributors,
	toTicketsQuality,
	toTimeBreakdown,
	type ContributorMeasure,
	type StatsTicketRow
} from '$lib/factory/stats-tickets';

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

/*
 * Ticket-fact cohorts (`/v1/stats/tickets`, `/v1/stats/configurations`) for the
 * time, quality, contributors and configuration panels, through the real
 * adapters. `complete: false` is a pager that stopped at its page bound.
 */
function ticketsOf(
	rows: readonly StatsTicketRow[],
	complete = true,
	summary: StatsSummary | null = null
) {
	const cohort = toCohort(statsTicketsComplete, window, observedAt);
	return {
		rows,
		complete,
		time: toTimeBreakdown(rows, complete, cohort),
		quality: toTicketsQuality(rows, summary, complete, cohort),
		contributors: (measure: ContributorMeasure) => toContributors(rows, measure)
	};
}

export const completeTickets = ticketsOf(statsTicketsComplete.items);
export const smallSampleTickets = ticketsOf(statsTicketsSmallSample.items);
export const missingTimingsTickets = ticketsOf(statsTicketsMissingTimings.items);
export const noHandoffTickets = ticketsOf(statsTicketsNoHandoffs.items);
/** The pager stopped at its bound: only the first page loaded. */
export const incompleteTickets = ticketsOf(statsTicketsPageOne.items, false);
export const emptyTickets = ticketsOf([]);

export const configurations = toConfigurationComparison(
	statsConfigurations,
	toCohort(statsConfigurations, window, observedAt)
);
export const emptyConfigurations = toConfigurationComparison(
	{ ...statsConfigurations, items: [] },
	toCohort(statsConfigurations, window, observedAt)
);

/** A large-sample configuration beside the fixture's two small ones. */
export const mixedConfigurations = toConfigurationComparison(
	{
		...statsConfigurations,
		items: [
			{
				configuration: 'plan=claude-opus-5-5:high work=gpt-6:high qa=gpt-6:medium',
				interventions: 7,
				medianCostUsd: 3.4,
				medianExternalReviewRounds: 1.5,
				medianFactoryMs: 9_000_000,
				merged: 9,
				mergeRate: 0.9,
				tickets: 12
			},
			...statsConfigurations.items
		]
	},
	toCohort(statsConfigurations, window, observedAt)
);
