/**
 * Pure functions from factory API responses to the view models in
 * `./models.ts`. Browser-safe: type imports only, no `$lib/server`, no `$env`.
 *
 * - Missing or null usage becomes `null`, never `0`.
 * - Enum strings pass through unchanged, so unknown values reach `status.ts`.
 * - Timestamps stay ISO strings.
 */
import type { components } from '$lib/factory/generated/factory-api';

import {
	OVERVIEW_STAGES,
	type AttentionView,
	type ExecutionView,
	type Overview,
	type OverviewStage,
	type RunView,
	type StageSummary,
	type TaskView,
	type TicketDetailView,
	type TicketList,
	type TicketProgress,
	type TicketRow,
	type Usage,
	type UsageCard
} from './models';

type Schemas = components['schemas'];

/** Stages whose summaries lead the list, in this order. */
const LEADING_SUMMARY_STAGES = ['review', 'qa'];

export const OPEN_TICKETS_USAGE_LABEL = 'Cost · open tickets';
export const NO_OPEN_TICKETS_USAGE_LABEL = 'no open tickets';

function toProgress(progress: Schemas['Progress']): TicketProgress {
	return { done: progress.done, total: progress.total, current: progress.current?.label ?? null };
}

/** One tickets-table row. `costUsd` is null unless the caller read the ticket's usage. */
export function toTicketRow(
	ticket: Schemas['TicketSummary'],
	costUsd: number | null = null
): TicketRow {
	return {
		key: ticket.key,
		displayRef: ticket.displayRef,
		title: ticket.title,
		stage: ticket.stage,
		status: ticket.status,
		needsUser: ticket.needsUser,
		progress: toProgress(ticket.progress),
		updatedAt: ticket.updatedAt,
		costUsd
	};
}

export function toTicketList(page: {
	items: Schemas['TicketSummary'][];
	complete: boolean;
}): TicketList {
	return { rows: page.items.map((ticket) => toTicketRow(ticket)), complete: page.complete };
}

const ZERO_USAGE: Usage = {
	costUsd: 0,
	tokensCacheRead: 0,
	tokensCacheWrite: 0,
	tokensInput: 0,
	tokensOutput: 0,
	tokensTotal: 0
};

/** Sum distinct tickets' usage totals. Never pass several snapshots of one ticket. */
export function sumUsage(usages: Usage[]): Usage {
	return usages.reduce<Usage>(
		(sum, usage) => ({
			costUsd: sum.costUsd + usage.costUsd,
			tokensCacheRead: sum.tokensCacheRead + usage.tokensCacheRead,
			tokensCacheWrite: sum.tokensCacheWrite + usage.tokensCacheWrite,
			tokensInput: sum.tokensInput + usage.tokensInput,
			tokensOutput: sum.tokensOutput + usage.tokensOutput,
			tokensTotal: sum.tokensTotal + usage.tokensTotal
		}),
		{ ...ZERO_USAGE }
	);
}

function latest(timestamps: string[]): string | null {
	let best: string | null = null;
	let bestTime = -Infinity;
	for (const timestamp of timestamps) {
		const time = Date.parse(timestamp);
		if (Number.isFinite(time) && time > bestTime) {
			best = timestamp;
			bestTime = time;
		}
	}
	return best;
}

export type OverviewInput = {
	/** Open tickets, as the pager returned them. */
	tickets: Schemas['TicketSummary'][];
	/** False when the pager stopped at its bound. */
	complete: boolean;
	/** Null when the agents read failed. */
	agents: Schemas['AgentList'] | null;
	/** One detail per open ticket; null when any detail read failed. */
	details: Schemas['TicketDetail'][] | null;
};

/**
 * The overview: stage counts (no `done`), needs attention from `needsUser`
 * only, active agents, and the open tickets' usage. The usage card is
 * unavailable unless every listed ticket's detail was read; it is never a
 * silently partial sum.
 */
export function toOverview(input: OverviewInput): Overview {
	const { tickets, complete, agents, details } = input;

	const stageCounts = Object.fromEntries(OVERVIEW_STAGES.map((stage) => [stage, 0])) as Record<
		OverviewStage,
		number
	>;
	for (const ticket of tickets) {
		if ((OVERVIEW_STAGES as readonly string[]).includes(ticket.stage)) {
			stageCounts[ticket.stage as OverviewStage] += 1;
		}
	}

	const attention = tickets.filter((ticket) => ticket.needsUser);

	const usageByKey = new Map((details ?? []).map((detail) => [detail.key, detail.usage]));
	const everyUsageRead =
		details !== null && complete && tickets.every((ticket) => usageByKey.has(ticket.key));

	let usage: UsageCard;
	if (!everyUsageRead) {
		usage = { available: false, label: OPEN_TICKETS_USAGE_LABEL };
	} else if (tickets.length === 0) {
		usage = { available: true, label: NO_OPEN_TICKETS_USAGE_LABEL, usage: { ...ZERO_USAGE } };
	} else {
		usage = {
			available: true,
			label: OPEN_TICKETS_USAGE_LABEL,
			usage: sumUsage(tickets.map((ticket) => usageByKey.get(ticket.key) as Usage))
		};
	}

	return {
		stageCounts,
		needsAttention: {
			count: attention.length,
			refs: attention.map(({ key, displayRef }) => ({ key, displayRef }))
		},
		activeAgents: agents === null ? null : agents.items.length,
		usage,
		updatedAt: latest(tickets.map((ticket) => ticket.updatedAt)),
		complete,
		tickets: tickets.map((ticket) =>
			toTicketRow(ticket, usageByKey.get(ticket.key)?.costUsd ?? null)
		)
	};
}

function toSummaries(summaries: Schemas['Task']['summaries']): StageSummary[] {
	const entries = Object.entries(summaries);
	const leading = LEADING_SUMMARY_STAGES.flatMap((stage) =>
		entries.filter(([key]) => key === stage)
	);
	const rest = entries.filter(([key]) => !LEADING_SUMMARY_STAGES.includes(key));
	return [...leading, ...rest].map(([stage, summary]) => ({
		stage,
		round: summary.round,
		label: summary.label,
		counts: { ...summary.counts }
	}));
}

/** Tasks in API order. A blocker is open unless a task with that id in this execution is done. */
export function toTasks(tasks: Schemas['Task'][]): TaskView[] {
	const statusById = new Map(tasks.map((task) => [task.id, task.status as string]));
	return tasks.map((task) => ({
		ordinal: task.ordinal,
		id: task.id,
		title: task.title,
		status: task.status,
		stage: task.stage ?? null,
		blockedBy: task.blockedBy.map((id) => ({ id, open: statusById.get(id) !== 'done' })),
		summaries: toSummaries(task.summaries)
	}));
}

export function toAttention(attention: Schemas['Attention'][]): AttentionView[] {
	return attention.map((request) => ({
		id: request.id,
		kind: request.kind,
		status: request.status,
		question: request.question,
		replies: request.replies.map((reply) => ({
			actor: reply.actor,
			answer: reply.answer,
			current: reply.current,
			createdAt: reply.createdAt
		}))
	}));
}

/** Executions in API order (oldest first). `selected` marks the shown one. */
export function toExecutions(
	executions: Schemas['ExecutionList'],
	selectedGeneration: number
): ExecutionView[] {
	return executions.items.map((execution) => ({
		generation: execution.generation,
		stage: execution.stage,
		status: execution.status,
		statusReason: execution.statusReason,
		current: execution.current,
		createdAt: execution.createdAt,
		finishedAt: execution.finishedAt,
		selected: execution.generation === selectedGeneration
	}));
}

export function toRun(run: Schemas['Run']): RunView {
	const usage = run.usage ?? null;
	return {
		id: run.id,
		sequence: run.sequence,
		stage: run.stage,
		task: run.task,
		model: run.model,
		status: run.status,
		outcome: run.outcome,
		usage,
		costUsd: usage === null ? null : usage.costUsd,
		startedAt: run.startedAt,
		endedAt: run.endedAt,
		activity: run.activity
	};
}

/** The activity of the highest-sequence run that has one. */
function latestActivity(runs: Schemas['Run'][]): string | null {
	const withActivity = runs.filter((run) => run.activity !== null && run.activity !== '');
	if (withActivity.length === 0) return null;
	return withActivity.reduce((a, b) => (b.sequence > a.sequence ? b : a)).activity;
}

export type TicketDetailInput = {
	detail: Schemas['TicketDetail'];
	executions: Schemas['ExecutionList'];
	runs: Schemas['Run'][];
};

export function toTicketDetail(input: TicketDetailInput): TicketDetailView {
	const { detail, executions, runs } = input;
	const shown = executions.items.find((execution) => execution.generation === detail.execution);
	return {
		header: {
			key: detail.key,
			displayRef: detail.displayRef,
			sourceRef: detail.sourceRef,
			title: detail.title,
			stage: detail.stage,
			status: detail.status,
			statusReason: detail.statusReason,
			needsUser: detail.needsUser,
			execution: detail.execution,
			current: shown?.current ?? false,
			pullRequest: detail.pullRequest,
			trackerWarnings: [...detail.trackerWarnings],
			progress: toProgress(detail.progress),
			updatedAt: detail.updatedAt
		},
		tasks: toTasks(detail.tasks),
		attention: toAttention(detail.attention),
		usage: { ...detail.usage },
		executions: toExecutions(executions, detail.execution),
		runs: runs.map(toRun),
		latestActivity: latestActivity(runs)
	};
}
