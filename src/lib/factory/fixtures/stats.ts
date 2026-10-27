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

/**
 * Token categories that sum to `tokens`, or all null when usage is unknown.
 * The split is illustrative; the dashboard does not read categories yet (#62).
 */
export function tokenCategories(tokens: number | null) {
	if (tokens === null) {
		return { tokensCacheRead: null, tokensCacheWrite: null, tokensInput: null, tokensOutput: null };
	}
	const tokensInput = Math.round(tokens * 0.1);
	const tokensOutput = Math.round(tokens * 0.05);
	const tokensCacheWrite = Math.round(tokens * 0.05);
	return {
		tokensCacheRead: tokens - tokensInput - tokensOutput - tokensCacheWrite,
		tokensCacheWrite,
		tokensInput,
		tokensOutput
	};
}

/**
 * A ticket's external review rounds. `changesRequested + commented = total`;
 * by default the rounds that requested changes are half the total, rounded up.
 */
export function reviewRounds(
	bot: number,
	human: number,
	total: number,
	changesRequested = Math.ceil(total / 2)
): Schemas['StatsTicketRow']['externalReviewRounds'] {
	return { bot, changesRequested, commented: total - changesRequested, human, total };
}

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
		// Four rounds over the merged-or-abandoned tickets (distribution).
		changesRequested: 3,
		commented: 1,
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
			tokens: 3_840_000,
			...tokenCategories(3_840_000),
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
			// The run was lost before usage was recorded.
			tokens: 0,
			...tokenCategories(null),
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
			externalReviewRounds: reviewRounds(1, 1, 2),
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
			...tokenCategories(1_420_000),
			waitingMs: 0
		},
		{
			agentMs: 900_000,
			configuration: configurationGpt,
			costUsd: 1.2,
			displayRef: 'KAI-12',
			execution: '1',
			externalReviewRounds: reviewRounds(0, 0, 0),
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
			...tokenCategories(210_000),
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
		// Sixteen rounds over the merged-or-abandoned tickets (distribution).
		changesRequested: 9,
		commented: 7,
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

/**
 * A stage row. Its `tokens` default to tokens per accepted output × accepted
 * outputs; with no accepted outputs usage is unknown: 0 tokens, null categories.
 */
function stageRow(row: Pick<StageRow, 'stage' | 'model' | 'thinking'> & Partial<StageRow>) {
	const known =
		row.tokensPerAcceptedOutput == null || row.acceptedOutputs === undefined
			? null
			: Math.round(row.tokensPerAcceptedOutput * row.acceptedOutputs);
	return {
		tokens: known ?? 0,
		...tokenCategories(known),
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
	externalReviewRounds: {
		bot: 0,
		changesRequested: 0,
		commented: 0,
		distribution: {},
		human: 0,
		median: null
	},
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

/*
 * Ticket fact rows (`/v1/stats/tickets`). One row per execution started in the
 * window. `execution` is the execution's internal UUID, not its generation.
 */

type TicketRow = Schemas['StatsTicketRow'];
const MINUTE = 60_000;

function ticketRow(
	row: Pick<TicketRow, 'key' | 'displayRef' | 'execution' | 'startedAt' | 'outcome'> &
		Partial<TicketRow>
) {
	return {
		...tokenCategories(row.tokens ?? 0),
		agentMs: 0,
		configuration: configurationOpus,
		costUsd: 0,
		externalReviewRounds: reviewRounds(0, 0, 0),
		factoryMs: null,
		factoryVersion: '0.15.1',
		followUpCommits: 0,
		handedOffAt: null,
		handoffToMergeMs: null,
		interventions: noInterventions,
		leadMs: null,
		mergedAt: null,
		overheadMs: null,
		stageMs: {},
		startToHandoffMs: null,
		tokens: 0,
		waitingMs: 0,
		...row
	} satisfies TicketRow;
}

/**
 * A row that reached handoff, built like factory-skills `facts.ts`:
 * `factoryMs = startToHandoff − waitingBefore`, `waitingMs` counts waiting
 * before and after handoff, and `overheadMs = Σ stage − agent` (null at 0).
 * Durations are in minutes.
 */
function handedOffRow(
	row: Pick<TicketRow, 'key' | 'displayRef' | 'execution' | 'startedAt' | 'outcome'> &
		Partial<TicketRow> & {
			minutes: {
				toHandoff: number;
				waitingBefore?: number;
				waitingAfter?: number;
				agent?: number;
				stages?: Record<string, number>;
			};
		}
) {
	const { minutes, ...rest } = row;
	const stageMs = Object.fromEntries(
		Object.entries(minutes.stages ?? {}).map(([stage, value]) => [stage, value * MINUTE])
	);
	const stageTotal = Object.values(stageMs).reduce((sum, value) => sum + value, 0);
	const agentMs = (minutes.agent ?? 0) * MINUTE;
	const startToHandoffMs = minutes.toHandoff * MINUTE;
	const waitingBefore = (minutes.waitingBefore ?? 0) * MINUTE;
	return ticketRow({
		agentMs,
		factoryMs: Math.max(0, startToHandoffMs - waitingBefore),
		handedOffAt: new Date(Date.parse(row.startedAt) + startToHandoffMs)
			.toISOString()
			.replace(/\.\d+Z$/, 'Z'),
		overheadMs: stageTotal === 0 ? null : Math.max(0, stageTotal - agentMs),
		stageMs,
		startToHandoffMs,
		waitingMs: waitingBefore + (minutes.waitingAfter ?? 0) * MINUTE,
		...rest
	});
}

/** Generation 1 of the multi-execution ticket: `startedAt` equals its `createdAt`. */
export const statsTicketMultiExecutionRow = handedOffRow({
	key: 'dpaez-factory-dashboard-9-9a0b1c2d',
	displayRef: 'dpaez/factory-dashboard#9',
	execution: '6f1c2a7e-3b9d-4e8a-9c41-5d2f7b8e0a11',
	startedAt: '2026-10-05T08:00:00Z',
	outcome: 'merged',
	costUsd: 3.9,
	tokens: 820_000,
	externalReviewRounds: reviewRounds(1, 1, 2),
	followUpCommits: 1,
	interventions: { ...noInterventions, questions: 1, replies: 1 },
	minutes: {
		toHandoff: 240,
		waitingBefore: 30,
		agent: 120,
		stages: { plan: 20, work: 100, review: 40, wrapup: 10 }
	}
});

/**
 * Waiting before handoff (60 min) and after it (90 min): waiting before +
 * factory time = start → handoff, and the 90 minutes belong to no time figure.
 */
export const statsTicketWaitingRow = handedOffRow({
	key: 'dpaez-factory-dashboard-14-1e2f3a4b',
	displayRef: 'dpaez/factory-dashboard#14',
	execution: 'a2d4e6f8-0b1c-4d3e-8f5a-6b7c8d9e0f12',
	startedAt: '2026-10-06T10:00:00Z',
	outcome: 'merged',
	costUsd: 7.2,
	tokens: 1_560_000,
	externalReviewRounds: reviewRounds(0, 1, 1),
	interventions: { ...noInterventions, questions: 2, replies: 2, limitPauses: 1 },
	minutes: {
		toHandoff: 600,
		waitingBefore: 60,
		waitingAfter: 90,
		agent: 300,
		// Work and review sum a return to work.
		stages: { plan: 30, work: 280, qa: 40, review: 90, wrapup: 15 }
	}
});

/** Ten executions reached handoff, two did not (open and cancelled). */
export const statsTicketsComplete = {
	...statsHeader,
	items: [
		statsTicketMultiExecutionRow,
		statsTicketWaitingRow,
		handedOffRow({
			key: 'dpaez-factory-dashboard-15-2a3b4c5d',
			displayRef: 'dpaez/factory-dashboard#15',
			execution: 'b3e5f7a9-1c2d-4e4f-9a6b-7c8d9e0f1a13',
			startedAt: '2026-10-07T09:00:00Z',
			outcome: 'merged',
			costUsd: 1.1,
			tokens: 240_000,
			minutes: { toHandoff: 60, agent: 30, stages: { plan: 10, work: 30, wrapup: 5 } }
		}),
		handedOffRow({
			key: 'dpaez-factory-dashboard-16-3b4c5d6e',
			displayRef: 'dpaez/factory-dashboard#16',
			execution: 'c4f6a8b0-2d3e-4f5a-8b7c-8d9e0f1a2b14',
			startedAt: '2026-10-07T13:00:00Z',
			outcome: 'merged',
			costUsd: 1.6,
			tokens: 310_000,
			minutes: { toHandoff: 90, agent: 50, stages: { plan: 10, work: 50, review: 15 } }
		}),
		handedOffRow({
			key: 'dpaez-factory-dashboard-17-4c5d6e7f',
			displayRef: 'dpaez/factory-dashboard#17',
			execution: 'd5a7b9c1-3e4f-4a6b-9c8d-9e0f1a2b3c15',
			startedAt: '2026-10-08T09:00:00Z',
			outcome: 'abandoned',
			configuration: configurationGpt,
			costUsd: 2.3,
			tokens: 450_000,
			externalReviewRounds: reviewRounds(2, 0, 2),
			interventions: { ...noInterventions, stops: 1 },
			minutes: { toHandoff: 120, agent: 60, stages: { plan: 15, work: 70, review: 20 } }
		}),
		handedOffRow({
			key: 'dpaez-factory-dashboard-18-5d6e7f8a',
			displayRef: 'dpaez/factory-dashboard#18',
			execution: 'e6b8c0d2-4f5a-4b7c-8d9e-0f1a2b3c4d16',
			startedAt: '2026-10-08T14:00:00Z',
			outcome: 'merged',
			costUsd: 2.8,
			tokens: 520_000,
			minutes: {
				toHandoff: 150,
				agent: 80,
				stages: { plan: 15, work: 90, qa: 15, review: 20 }
			}
		}),
		handedOffRow({
			key: 'dpaez-factory-dashboard-19-6e7f8a9b',
			displayRef: 'dpaez/factory-dashboard#19',
			execution: 'f7c9d1e3-5a6b-4c8d-9e0f-1a2b3c4d5e17',
			startedAt: '2026-10-09T09:00:00Z',
			outcome: 'merged',
			costUsd: 3.1,
			tokens: 600_000,
			externalReviewRounds: reviewRounds(1, 0, 1),
			followUpCommits: 2,
			minutes: { toHandoff: 180, agent: 90, stages: { plan: 20, work: 100, review: 30 } }
		}),
		handedOffRow({
			key: 'kai-21-7f8a9b0c',
			displayRef: 'KAI-21',
			execution: '08d0e2f4-6b7c-4d9e-8f1a-2b3c4d5e6f18',
			startedAt: '2026-10-10T09:00:00Z',
			outcome: 'merged',
			configuration: configurationGpt,
			costUsd: 2.2,
			tokens: 430_000,
			interventions: { ...noInterventions, manualRetries: 1 },
			minutes: {
				toHandoff: 300,
				waitingBefore: 20,
				agent: 140,
				stages: { plan: 20, work: 160, review: 40 }
			}
		}),
		handedOffRow({
			key: 'kai-22-8a9b0c1d',
			displayRef: 'KAI-22',
			execution: '19e1f3a5-7c8d-4e0f-9a2b-3c4d5e6f7a19',
			startedAt: '2026-10-11T09:00:00Z',
			outcome: 'merged',
			costUsd: 4.4,
			tokens: 900_000,
			externalReviewRounds: reviewRounds(0, 2, 2),
			minutes: {
				toHandoff: 360,
				agent: 200,
				stages: { plan: 30, work: 220, qa: 30, review: 50 }
			}
		}),
		// Handed off with the pull request still open: its review rounds are
		// outside the merged-or-abandoned sample.
		handedOffRow({
			key: 'kai-23-9b0c1d2e',
			displayRef: 'KAI-23',
			execution: '2af2a4b6-8d9e-4f1a-8b3c-4d5e6f7a8b20',
			startedAt: '2026-10-12T09:00:00Z',
			outcome: 'open',
			costUsd: 5,
			tokens: 1_020_000,
			externalReviewRounds: reviewRounds(1, 0, 1),
			interventions: { ...noInterventions, manualCompletes: 1 },
			minutes: {
				toHandoff: 480,
				waitingBefore: 40,
				agent: 250,
				stages: { plan: 30, work: 280, review: 60 }
			}
		}),
		ticketRow({
			key: 'dpaez-factory-dashboard-20-0c1d2e3f',
			displayRef: 'dpaez/factory-dashboard#20',
			execution: '3b03b5c7-9e0f-4a2b-9c4d-5e6f7a8b9c21',
			startedAt: '2026-10-13T09:00:00Z',
			outcome: 'open',
			agentMs: 40 * MINUTE,
			costUsd: 0.9,
			tokens: 180_000,
			interventions: { ...noInterventions, questions: 1 },
			stageMs: { plan: 15 * MINUTE, work: 30 * MINUTE },
			waitingMs: 120 * MINUTE
		}),
		ticketRow({
			key: 'kai-24-1d2e3f4a',
			displayRef: 'KAI-24',
			execution: '4c14c6d8-0f1a-4b3c-8d5e-6f7a8b9c0d22',
			startedAt: '2026-10-13T15:00:00Z',
			outcome: 'cancelled',
			agentMs: 10 * MINUTE,
			costUsd: 0.3,
			tokens: 60_000,
			stageMs: { plan: 12 * MINUTE }
		})
	],
	nextCursor: null
} satisfies Schemas['StatsTickets'];

/** The complete cohort split over two pages (`nextCursor` is an offset). */
export const statsTicketsPageOne = {
	...statsHeader,
	items: statsTicketsComplete.items.slice(0, 6),
	nextCursor: '6'
} satisfies Schemas['StatsTickets'];

export const statsTicketsPageTwo = {
	...statsHeader,
	items: statsTicketsComplete.items.slice(6),
	nextCursor: null
} satisfies Schemas['StatsTickets'];

/** Three executions reached handoff: n = 3. */
export const statsTicketsSmallSample = {
	...statsHeader,
	items: statsTicketsComplete.items.slice(0, 3),
	nextCursor: null
} satisfies Schemas['StatsTickets'];

/** Handed off, but stage timings are missing on two rows: no stage time, no overhead. */
export const statsTicketsMissingTimings = {
	...statsHeader,
	items: [
		statsTicketMultiExecutionRow,
		handedOffRow({
			key: 'kai-31-2e3f4a5b',
			displayRef: 'KAI-31',
			execution: '5d25d7e9-1a2b-4c4d-9e6f-7a8b9c0d1e23',
			startedAt: '2026-10-08T09:00:00Z',
			outcome: 'merged',
			agentMs: 70 * MINUTE,
			minutes: { toHandoff: 100 }
		}),
		handedOffRow({
			key: 'kai-32-3f4a5b6c',
			displayRef: 'KAI-32',
			execution: '6e36e8fa-2b3c-4d5e-8f7a-8b9c0d1e2f24',
			startedAt: '2026-10-09T09:00:00Z',
			outcome: 'abandoned',
			minutes: { toHandoff: 140, waitingBefore: 10 }
		})
	],
	nextCursor: null
} satisfies Schemas['StatsTickets'];

/** No execution reached handoff. */
export const statsTicketsNoHandoffs = {
	...statsHeader,
	items: statsTicketsComplete.items
		.filter((row) => row.startToHandoffMs === null)
		.concat(
			ticketRow({
				key: 'kai-33-4a5b6c7d',
				displayRef: 'KAI-33',
				execution: '7f47f90b-3c4d-4e6f-9a8b-9c0d1e2f3a25',
				startedAt: '2026-10-14T09:00:00Z',
				outcome: 'unknown',
				waitingMs: 30 * MINUTE
			})
		),
	nextCursor: null
} satisfies Schemas['StatsTickets'];
