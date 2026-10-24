/*
 * Factory stats fixtures. Unknown facts stay `null` (unavailable), never zero:
 * medians with too few tickets, ratios with no accepted outputs, and a ticket
 * row that has not been handed off. Zero merges over finished tickets is a
 * measured `0` merge rate under stats.v1.
 */
import type { components } from '$lib/factory/generated/factory-api';

type Schemas = components['schemas'];

const statsHeader = {
	definitions: 'stats.v1',
	factoryId: 'factory-geut-01',
	factoryVersions: ['0.14.0', '0.15.1']
} satisfies Pick<Schemas['StatsSummary'], 'definitions' | 'factoryId' | 'factoryVersions'>;

const configurationOpus = 'plan=claude-opus-5-5:high work=claude-opus-5-5:high review=gpt-6:high';
const configurationGpt = 'plan=gpt-6:medium work=gpt-6:medium review=claude-opus-5-5:high';

const interventions = {
	limitPauses: 1,
	manualCompletes: 0,
	manualRetries: 2,
	questions: 3,
	replies: 3,
	stops: 1
} satisfies Schemas['Interventions'];

export const statsSummary = {
	...statsHeader,
	costUsd: 41.27,
	externalReviewRounds: {
		bot: 6,
		distribution: { '0': 3, '1': 2, '2': 1 },
		human: 4,
		median: null
	},
	followUpCommits: 5,
	handedOff: 6,
	interventions,
	medianMs: {
		factory: 5_400_000,
		handoffToMerge: null,
		lead: 7_200_000,
		waiting: null
	},
	mergeRate: 0,
	neededAPerson: 4,
	outcomes: { abandoned: 0, cancelled: 1, merged: 0, open: 5, unknown: 2 },
	started: 8,
	tokens: 9_812_000
} satisfies Schemas['StatsSummary'];

export const statsStages = {
	...statsHeader,
	items: [
		{
			acceptedOutputs: 6,
			agentMs: 2_400_000,
			correctionsPerAcceptedOutput: 0.5,
			costUsdPerAcceptedOutput: 1.9,
			firstPassAcceptance: 0.67,
			infrastructureLost: 0,
			model: 'claude-opus-5-5',
			returnsToWork: { review: 2, qa: 1 },
			reviewRoundsPerTask: 1.5,
			runs: 9,
			setup: 'claude-opus-5-5:high',
			stage: 'work',
			thinking: 'high',
			tokensPerAcceptedOutput: 640_000
		},
		{
			acceptedOutputs: 0,
			agentMs: 0,
			correctionsPerAcceptedOutput: null,
			costUsdPerAcceptedOutput: null,
			firstPassAcceptance: null,
			infrastructureLost: 1,
			model: 'gpt-6',
			returnsToWork: {},
			reviewRoundsPerTask: null,
			runs: 1,
			setup: 'gpt-6:medium',
			stage: 'qa',
			thinking: 'medium',
			tokensPerAcceptedOutput: null
		}
	]
} satisfies Schemas['StatsStages'];

export const statsConfigurations = {
	...statsHeader,
	items: [
		{
			configuration: configurationOpus,
			interventions: 4,
			medianCostUsd: 5.1,
			medianExternalReviewRounds: 1,
			medianFactoryMs: 5_400_000,
			merged: 3,
			mergeRate: 0.75,
			tickets: 4
		},
		{
			configuration: configurationGpt,
			interventions: 0,
			medianCostUsd: null,
			medianExternalReviewRounds: null,
			medianFactoryMs: null,
			merged: 0,
			mergeRate: null,
			tickets: 1
		}
	]
} satisfies Schemas['StatsConfigurations'];

export const statsTickets = {
	...statsHeader,
	items: [
		{
			agentMs: 3_100_000,
			configuration: configurationOpus,
			costUsd: 6.4,
			displayRef: 'dpaez/factory-dashboard#12',
			execution: '1',
			externalReviewRounds: { bot: 1, human: 1, total: 2 },
			factoryMs: 5_400_000,
			factoryVersion: '0.15.1',
			followUpCommits: 1,
			handedOffAt: '2026-10-12T15:00:00Z',
			handoffToMergeMs: 11_040_000,
			interventions,
			key: 'dpaez-factory-dashboard-12-5c6d7e8f',
			leadMs: 7_200_000,
			mergedAt: '2026-10-12T18:04:00Z',
			outcome: 'merged',
			overheadMs: 300_000,
			stageMs: { plan: 600_000, work: 3_000_000, review: 1_200_000, wrapup: 600_000 },
			startedAt: '2026-10-12T09:00:00Z',
			startToHandoffMs: 21_600_000,
			tokens: 1_420_000,
			waitingMs: 0
		},
		{
			agentMs: 900_000,
			configuration: configurationGpt,
			costUsd: 1.2,
			displayRef: 'KAI-12',
			execution: '1',
			externalReviewRounds: { bot: 0, human: 0, total: 0 },
			factoryMs: null,
			factoryVersion: null,
			followUpCommits: 0,
			handedOffAt: null,
			handoffToMergeMs: null,
			interventions: { ...interventions, questions: 0, replies: 0 },
			key: 'kai-12-7a8b9c0d',
			leadMs: null,
			mergedAt: null,
			outcome: 'unknown',
			overheadMs: null,
			stageMs: { plan: 900_000 },
			startedAt: '2026-10-09T15:00:00Z',
			startToHandoffMs: null,
			tokens: 210_000,
			waitingMs: 0
		}
	],
	nextCursor: null
} satisfies Schemas['StatsTickets'];

/*
 * Cohort fixtures for the stats panels: complete, empty window, zero merges,
 * QA disabled, and partial (a stage row whose tokens are unknown).
 */

const noInterventions = {
	limitPauses: 0,
	manualCompletes: 0,
	manualRetries: 0,
	questions: 0,
	replies: 0,
	stops: 0
} satisfies Schemas['Interventions'];

/** The spec 04 example: merge rate 16/20, $48.20, 6.40M tokens. */
export const statsCompleteSummary = {
	...statsHeader,
	costUsd: 48.2,
	externalReviewRounds: {
		bot: 12,
		distribution: { '0': 6, '1': 8, '2': 4 },
		human: 10,
		median: 1
	},
	followUpCommits: 9,
	handedOff: 20,
	interventions,
	medianMs: {
		factory: 5_400_000,
		handoffToMerge: 10_800_000,
		lead: 18_000_000,
		waiting: 600_000
	},
	mergeRate: 0.8,
	neededAPerson: 7,
	outcomes: { abandoned: 2, cancelled: 2, merged: 16, open: 4, unknown: 2 },
	started: 26,
	tokens: 6_400_000
} satisfies Schemas['StatsSummary'];

type StageRow = Schemas['StatsStageRow'];

function stageRow(row: Pick<StageRow, 'stage' | 'model' | 'thinking'> & Partial<StageRow>) {
	return {
		acceptedOutputs: 0,
		agentMs: 0,
		correctionsPerAcceptedOutput: null,
		costUsdPerAcceptedOutput: null,
		firstPassAcceptance: null,
		infrastructureLost: 0,
		returnsToWork: {},
		reviewRoundsPerTask: null,
		runs: 0,
		setup: `${row.model}:${row.thinking}`,
		tokensPerAcceptedOutput: null,
		...row
	} satisfies StageRow;
}

const completePlan = stageRow({
	stage: 'plan',
	model: 'claude-opus-5-5',
	thinking: 'high',
	acceptedOutputs: 26,
	agentMs: 7_800_000,
	correctionsPerAcceptedOutput: 0.04,
	costUsdPerAcceptedOutput: 0.31,
	firstPassAcceptance: 0.96,
	reviewRoundsPerTask: 1,
	runs: 27,
	tokensPerAcceptedOutput: 40_000
});

/** Work runs on two model setups; together the stages sum to 6,400,000 tokens. */
const completeStageRows = [
	stageRow({
		stage: 'review',
		model: 'gpt-6',
		thinking: 'high',
		acceptedOutputs: 30,
		agentMs: 9_000_000,
		correctionsPerAcceptedOutput: 0,
		costUsdPerAcceptedOutput: 0.15,
		firstPassAcceptance: 1,
		reviewRoundsPerTask: 1.4,
		runs: 30,
		tokensPerAcceptedOutput: 20_000
	}),
	completePlan,
	stageRow({
		stage: 'work',
		model: 'claude-opus-5-5',
		thinking: 'high',
		acceptedOutputs: 20,
		agentMs: 36_000_000,
		correctionsPerAcceptedOutput: 0.25,
		costUsdPerAcceptedOutput: 1.3,
		firstPassAcceptance: 0.75,
		infrastructureLost: 1,
		returnsToWork: { review: 6, qa: 3 },
		reviewRoundsPerTask: 1.5,
		runs: 31,
		tokensPerAcceptedOutput: 150_000
	}),
	stageRow({
		stage: 'work',
		model: 'gpt-6',
		thinking: 'medium',
		acceptedOutputs: 6,
		agentMs: 9_600_000,
		correctionsPerAcceptedOutput: 0.5,
		costUsdPerAcceptedOutput: 0.9,
		firstPassAcceptance: 0.5,
		returnsToWork: { review: 2 },
		reviewRoundsPerTask: 2,
		runs: 11,
		tokensPerAcceptedOutput: 100_000
	}),
	stageRow({
		stage: 'qa',
		model: 'claude-opus-5-5',
		thinking: 'medium',
		acceptedOutputs: 24,
		agentMs: 7_200_000,
		correctionsPerAcceptedOutput: 0.08,
		costUsdPerAcceptedOutput: 0.2,
		firstPassAcceptance: 0.875,
		reviewRoundsPerTask: 1.1,
		runs: 26,
		tokensPerAcceptedOutput: 25_000
	}),
	stageRow({
		stage: 'wrapup',
		model: 'claude-opus-5-5',
		thinking: 'low',
		acceptedOutputs: 20,
		agentMs: 3_000_000,
		correctionsPerAcceptedOutput: 0,
		costUsdPerAcceptedOutput: 0.18,
		firstPassAcceptance: 1,
		reviewRoundsPerTask: 1,
		runs: 20,
		tokensPerAcceptedOutput: 28_000
	})
];

export const statsCompleteStages = {
	...statsHeader,
	items: completeStageRows
} satisfies Schemas['StatsStages'];

/** No tickets started in the window. */
export const statsEmptySummary = {
	...statsHeader,
	costUsd: 0,
	externalReviewRounds: { bot: 0, distribution: {}, human: 0, median: null },
	followUpCommits: 0,
	handedOff: 0,
	interventions: noInterventions,
	medianMs: { factory: null, handoffToMerge: null, lead: null, waiting: null },
	mergeRate: null,
	neededAPerson: 0,
	outcomes: { abandoned: 0, cancelled: 0, merged: 0, open: 0, unknown: 0 },
	started: 0,
	tokens: 0
} satisfies Schemas['StatsSummary'];

export const statsEmptyStages = {
	...statsHeader,
	items: []
} satisfies Schemas['StatsStages'];

/** Finished tickets, none merged: a measured 0% merge rate over 3. */
export const statsZeroMergesSummary = {
	...statsEmptySummary,
	costUsd: 7.45,
	handedOff: 2,
	interventions,
	medianMs: { factory: 3_600_000, handoffToMerge: null, lead: 9_000_000, waiting: 0 },
	mergeRate: 0,
	neededAPerson: 2,
	outcomes: { abandoned: 2, cancelled: 1, merged: 0, open: 3, unknown: 0 },
	started: 6,
	tokens: 1_120_000
} satisfies Schemas['StatsSummary'];

/** QA is disabled: no `qa` rows. */
export const statsQaDisabledStages = {
	...statsHeader,
	items: completeStageRows.filter((row) => row.stage !== 'qa')
} satisfies Schemas['StatsStages'];

/** Review has one setup with no accepted outputs, so its tokens are unknown. */
export const statsPartialStages = {
	...statsHeader,
	items: [
		...completeStageRows,
		stageRow({
			stage: 'review',
			model: 'claude-opus-5-5',
			thinking: 'high',
			agentMs: 1_200_000,
			infrastructureLost: 2,
			runs: 3
		})
	]
} satisfies Schemas['StatsStages'];
