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
	type AttentionView,
	type CurrentTaskView,
	type SourceView,
	type ExecutionView,
	type RunView,
	type StageSummary,
	type TaskView,
	type TicketDetailView,
	type TicketList,
	type TicketProgress,
	type TicketRow
} from './models';

type Schemas = components['schemas'];

/** Stages whose summaries lead the list, in this order. */
const LEADING_SUMMARY_STAGES = ['review', 'qa'];

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

/** The source reference, with an href only when it is an http(s) URL. */
export function toSource(sourceRef: string): SourceView {
	let href: string | null = null;
	try {
		const url = new URL(sourceRef);
		if (url.protocol === 'http:' || url.protocol === 'https:') href = url.href;
	} catch {
		// Not a URL, such as `KAI-12` or `notes/ticket.md`: shown as text.
	}
	return { ref: sourceRef, href };
}

/**
 * The current task's label from `progress.current`, and the round of the
 * first active task's summary for its current stage when that summary exists.
 */
export function toCurrentTask(
	progress: Schemas['Progress'],
	tasks: Schemas['Task'][]
): CurrentTaskView | null {
	const label = progress.current?.label;
	if (!label) return null;
	const active = tasks.find((task) => task.status === 'active');
	const stage = active?.stage;
	const summary =
		active && stage && Object.hasOwn(active.summaries, stage) ? active.summaries[stage] : undefined;
	return { label, round: summary?.round ?? null };
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
			source: toSource(detail.sourceRef),
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
			currentTask: toCurrentTask(detail.progress, detail.tasks),
			updatedAt: detail.updatedAt
		},
		tasks: toTasks(detail.tasks),
		attention: toAttention(detail.attention),
		usage: detail.usage ? { ...detail.usage } : null,
		executions: toExecutions(executions, detail.execution),
		runs: runs.map(toRun),
		latestActivity: latestActivity(runs)
	};
}
