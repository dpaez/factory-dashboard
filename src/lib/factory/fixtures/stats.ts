/*
 * Factory stats fixtures. Unknown facts stay `null` (unavailable), never zero:
 * medians with too few tickets, a merge rate with no finished tickets, and a
 * ticket row that has not been handed off.
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
	mergeRate: null,
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
