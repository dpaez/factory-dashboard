import type { SQLWrapper } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import {
	EXECUTION_STAGES,
	SESSION_STAGES,
	type AttentionKind,
	type AttentionStatus,
	type ExecutionStage,
	type ExecutionStatus,
	type Overview,
	type OverviewAttention,
	type ReviewVerdict,
	type SessionStage,
	type SessionStatus,
	type StageUsage,
	type TaskStatus,
	type TicketDetail,
	type TicketDetailAttention,
	type TicketDetailExecution,
	type TicketDetailSession,
	type TicketDetailTask,
	type TicketGeneration,
	type TicketListRow,
	type UsageTotals,
	type WorktreeStatus
} from './types';

/**
 * The slice of the drizzle database this module executes against. Any
 * `drizzle({ client })` instance over a read-only v2 connection satisfies it
 * (see `./client`); tests bind it directly to a scratch database. The
 * node-sqlite driver returns rows synchronously, but the results are awaited
 * so an async driver shape works too.
 */
export type ReadDb = {
	all: (query: SQLWrapper) => unknown[] | Promise<unknown[]>;
	get: (query: SQLWrapper) => unknown;
};

type RawRow = Record<string, unknown>;

/**
 * The one micros→USD conversion. Integer USD micros go in (that is what the
 * controller stores), a USD number comes out. Cost never leaves this module in
 * any other shape, and this division appears nowhere else in `src/`.
 */
export function usdFromMicros(micros: number): number {
	return micros / 1_000_000;
}

function asRow(value: unknown): RawRow {
	return value as RawRow;
}

function text(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}

function requiredText(value: unknown): string {
	return String(value);
}

function count(value: unknown): number {
	return value === null || value === undefined ? 0 : Number(value);
}

function integer(value: unknown): number | null {
	return value === null || value === undefined ? null : Number(value);
}

function usageTotals(raw: RawRow, costColumn: string): UsageTotals {
	return {
		costUsd: usdFromMicros(count(raw[costColumn])),
		tokensInput: count(raw.tokens_input),
		tokensOutput: count(raw.tokens_output),
		tokensCacheRead: count(raw.tokens_cache_read),
		tokensCacheWrite: count(raw.tokens_cache_write),
		tokensTotal: count(raw.tokens_total)
	};
}

/**
 * Overview query group: per-stage counts of current executions, status counts,
 * cumulative totals from `execution_usage_totals` (safe over resumed sessions),
 * the open-attention list with ticket titles, and the newest execution update
 * timestamp so the page never shows a hard-coded "Updated …".
 *
 * An empty database yields zeroed counts, zeroed totals, and empty arrays —
 * never `undefined`, never a division by zero.
 */
export async function getOverview(db: ReadDb): Promise<Overview> {
	const stageRows = (await db.all(
		sql`SELECT stage, COUNT(*) AS stage_count
			FROM current_ticket_executions
			GROUP BY stage`
	)) as RawRow[];

	const stageCounts = Object.fromEntries(EXECUTION_STAGES.map((stage) => [stage, 0])) as Record<
		ExecutionStage,
		number
	>;
	for (const raw of stageRows) {
		stageCounts[raw.stage as ExecutionStage] = count(raw.stage_count);
	}

	const statusRow = asRow(
		await db.get(
			sql`SELECT
				COALESCE(SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END), 0) AS complete_count,
				COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_count
			FROM current_ticket_executions`
		)
	);

	// `execution_usage_totals` sums cumulative columns over the latest snapshot
	// per session, so resumed sessions are counted once, at their newest value.
	// Restricting the join to current executions keeps superseded generations
	// out of the totals.
	const totalsRow = asRow(
		await db.get(
			sql`SELECT
				COALESCE(SUM(u.cost_usd_micros), 0) AS cost,
				COALESCE(SUM(u.tokens_input), 0) AS tokens_input,
				COALESCE(SUM(u.tokens_output), 0) AS tokens_output,
				COALESCE(SUM(u.tokens_cache_read), 0) AS tokens_cache_read,
				COALESCE(SUM(u.tokens_cache_write), 0) AS tokens_cache_write,
				COALESCE(SUM(u.tokens_total), 0) AS tokens_total
			FROM current_ticket_executions AS c
			LEFT JOIN execution_usage_totals AS u ON u.execution_id = c.id`
		)
	);

	const attentionRows = (await db.all(
		sql`SELECT
				a.id, a.execution_id, a.kind, a.status, a.question,
				a.created_at, a.answered_at, a.resolved_at,
				c.ticket_id, c.ticket_title
			FROM open_attention AS a
			JOIN current_ticket_executions AS c ON c.id = a.execution_id
			ORDER BY a.created_at DESC, a.id`
	)) as RawRow[];

	const updatedRow = asRow(
		await db.get(sql`SELECT MAX(updated_at) AS updated_at FROM ticket_executions`)
	);

	return {
		stageCounts,
		completeCount: count(statusRow.complete_count),
		activeCount: count(statusRow.active_count),
		totals: usageTotals(totalsRow, 'cost'),
		openAttention: attentionRows.map((raw): OverviewAttention => ({
			id: requiredText(raw.id),
			executionId: requiredText(raw.execution_id),
			ticketId: requiredText(raw.ticket_id),
			ticketTitle: text(raw.ticket_title),
			kind: raw.kind as AttentionKind,
			status: raw.status as AttentionStatus,
			question: requiredText(raw.question),
			createdAt: requiredText(raw.created_at),
			answeredAt: text(raw.answered_at),
			resolvedAt: text(raw.resolved_at)
		})),
		updatedAt: text(updatedRow.updated_at)
	};
}

/**
 * Tickets-list query group: one row per current execution, shaped so the
 * TanStack table columns can be re-pointed at it and a future `/tickets` page
 * can reuse it unchanged. `costUsd` comes from `execution_usage_totals`.
 */
export async function getTicketList(db: ReadDb): Promise<TicketListRow[]> {
	const rows = (await db.all(
		sql`SELECT
				c.ticket_id AS id,
				c.id AS execution_id,
				c.ticket_title AS title,
				c.ticket_type AS type,
				c.source_kind,
				c.source_ref,
				c.stage,
				c.status,
				c.updated_at,
				COALESCE(u.cost_usd_micros, 0) AS cost
			FROM current_ticket_executions AS c
			LEFT JOIN execution_usage_totals AS u ON u.execution_id = c.id
			ORDER BY c.updated_at DESC, c.ticket_id`
	)) as RawRow[];

	return rows.map((raw): TicketListRow => ({
		id: requiredText(raw.id),
		executionId: requiredText(raw.execution_id),
		title: text(raw.title),
		type: text(raw.type),
		sourceKind: requiredText(raw.source_kind),
		sourceRef: text(raw.source_ref),
		stage: raw.stage as ExecutionStage,
		status: raw.status as ExecutionStatus,
		costUsd: usdFromMicros(count(raw.cost)),
		updatedAt: requiredText(raw.updated_at)
	}));
}

async function getTicketDetailExecution(
	db: ReadDb,
	executionId: string
): Promise<TicketDetailExecution> {
	const raw = asRow(
		await db.get(
			sql`SELECT
					id, generation, stage, status, status_reason_code, status_reason,
					message, message_at, plan_path, adr_path,
					worktree_path, worktree_branch, worktree_base_branch, worktree_workspace_id,
					worktree_status, worktree_base_sha, worktree_head_sha,
					created_at, updated_at, finished_at
				FROM ticket_executions
				WHERE id = ${executionId} AND is_current = 1`
		)
	);
	return {
		id: requiredText(raw.id),
		generation: count(raw.generation),
		stage: raw.stage as ExecutionStage,
		status: raw.status as ExecutionStatus,
		statusReasonCode: text(raw.status_reason_code),
		statusReason: text(raw.status_reason),
		message: text(raw.message),
		messageAt: text(raw.message_at),
		planPath: text(raw.plan_path),
		adrPath: text(raw.adr_path),
		worktreePath: text(raw.worktree_path),
		worktreeBranch: text(raw.worktree_branch),
		worktreeBaseBranch: text(raw.worktree_base_branch),
		worktreeWorkspaceId: text(raw.worktree_workspace_id),
		worktreeStatus: raw.worktree_status === null ? null : (raw.worktree_status as WorktreeStatus),
		worktreeBaseSha: text(raw.worktree_base_sha),
		worktreeHeadSha: text(raw.worktree_head_sha),
		createdAt: requiredText(raw.created_at),
		updatedAt: requiredText(raw.updated_at),
		finishedAt: text(raw.finished_at)
	};
}

async function getPriorGenerations(db: ReadDb, ticketId: string): Promise<TicketGeneration[]> {
	const rows = (await db.all(
		sql`SELECT id, generation, stage, status, created_at, updated_at, finished_at
			FROM ticket_executions
			WHERE ticket_id = ${ticketId} AND is_current = 0
			ORDER BY generation DESC`
	)) as RawRow[];
	return rows.map((raw): TicketGeneration => ({
		id: requiredText(raw.id),
		generation: count(raw.generation),
		stage: raw.stage as ExecutionStage,
		status: raw.status as ExecutionStatus,
		createdAt: requiredText(raw.created_at),
		updatedAt: requiredText(raw.updated_at),
		finishedAt: text(raw.finished_at)
	}));
}

async function getTasks(db: ReadDb, executionId: string): Promise<TicketDetailTask[]> {
	const [taskRows, dependencyRows] = await Promise.all([
		db.all(
			sql`SELECT task_id, ordinal, title, task_file, status,
					review_round, review_verdict, finding_count, blocking_count
				FROM tasks
				WHERE execution_id = ${executionId}
				ORDER BY ordinal`
		) as Promise<RawRow[]>,
		db.all(
			sql`SELECT task_id, depends_on_task_id
				FROM task_dependencies
				WHERE execution_id = ${executionId}
				ORDER BY task_id, depends_on_task_id`
		) as Promise<RawRow[]>
	]);

	const dependsOn = new Map<string, string[]>();
	for (const raw of dependencyRows) {
		const taskId = requiredText(raw.task_id);
		const list = dependsOn.get(taskId) ?? [];
		list.push(requiredText(raw.depends_on_task_id));
		dependsOn.set(taskId, list);
	}

	return taskRows.map((raw): TicketDetailTask => ({
		taskId: requiredText(raw.task_id),
		ordinal: count(raw.ordinal),
		title: text(raw.title),
		taskFile: requiredText(raw.task_file),
		status: raw.status as TaskStatus,
		reviewRound: count(raw.review_round),
		reviewVerdict: raw.review_verdict === null ? null : (raw.review_verdict as ReviewVerdict),
		findingCount: integer(raw.finding_count),
		blockingCount: integer(raw.blocking_count),
		dependsOnTaskIds: dependsOn.get(requiredText(raw.task_id)) ?? []
	}));
}

async function getAttention(db: ReadDb, executionId: string): Promise<TicketDetailAttention[]> {
	const rows = (await db.all(
		sql`SELECT id, kind, status, question, created_at, answered_at, resolved_at, cancelled_at
			FROM attention_requests
			WHERE execution_id = ${executionId}
			ORDER BY created_at, id`
	)) as RawRow[];
	return rows.map((raw): TicketDetailAttention => ({
		id: requiredText(raw.id),
		kind: raw.kind as AttentionKind,
		status: raw.status as AttentionStatus,
		question: requiredText(raw.question),
		createdAt: requiredText(raw.created_at),
		answeredAt: text(raw.answered_at),
		resolvedAt: text(raw.resolved_at),
		cancelledAt: text(raw.cancelled_at)
	}));
}

async function getSessions(db: ReadDb, executionId: string): Promise<TicketDetailSession[]> {
	// `latest_usage_by_session` is one row per session (the snapshot of its
	// highest-sequence run), so this join cannot double-count a resumed session.
	// The task join lets the read module supply each session's task status
	// directly, so pages never map `task_id` back to a task by hand.
	const rows = (await db.all(
		sql`SELECT
				s.id, s.stage, s.task_id, s.model, s.status,
				s.context_tokens, s.context_window, s.context_percent,
				t.status AS task_status,
				u.run_id AS usage_run_id,
				u.cumulative_tokens_input AS tokens_input,
				u.cumulative_tokens_output AS tokens_output,
				u.cumulative_tokens_cache_read AS tokens_cache_read,
				u.cumulative_tokens_cache_write AS tokens_cache_write,
				u.cumulative_tokens_total AS tokens_total,
				u.cumulative_cost_usd_micros AS cost
			FROM agent_sessions AS s
			LEFT JOIN latest_usage_by_session AS u ON u.session_id = s.id
			LEFT JOIN tasks AS t ON t.execution_id = s.execution_id AND t.task_id = s.task_id
			WHERE s.execution_id = ${executionId}
			ORDER BY s.created_at, s.id`
	)) as RawRow[];

	return rows.map((raw): TicketDetailSession => ({
		id: requiredText(raw.id),
		stage: raw.stage as SessionStage,
		taskId: text(raw.task_id),
		taskStatus:
			raw.task_status === null || raw.task_status === undefined
				? 'unknown'
				: (raw.task_status as TaskStatus),
		model: requiredText(raw.model),
		status: raw.status as SessionStatus,
		contextTokens: integer(raw.context_tokens),
		contextWindow: integer(raw.context_window),
		contextPercent: integer(raw.context_percent),
		usage: raw.usage_run_id === null ? null : usageTotals(raw, 'cost')
	}));
}

async function getUsageByStage(db: ReadDb, executionId: string): Promise<StageUsage[]> {
	// `execution_usage_by_stage` sums delta columns over every snapshot, which
	// is the correct aggregation for a per-stage breakdown.
	const rows = (await db.all(
		sql`SELECT stage,
				tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, tokens_total,
				cost_usd_micros AS cost
			FROM execution_usage_by_stage
			WHERE execution_id = ${executionId}`
	)) as RawRow[];

	return rows
		.map((raw): StageUsage => ({
			stage: raw.stage as SessionStage,
			...usageTotals(raw, 'cost')
		}))
		.sort((a, b) => SESSION_STAGES.indexOf(a.stage) - SESSION_STAGES.indexOf(b.stage));
}

/**
 * Ticket-detail query group, keyed by the opaque ticket id (parameterized;
 * never interpolated, never parsed). Returns `null` for an unknown ticket id
 * so the route can raise a 404 instead of catching a throw.
 */
export async function getTicketDetail(db: ReadDb, ticketId: string): Promise<TicketDetail | null> {
	const ticketRow = (await db.get(
		sql`SELECT id, title, type, source_kind, source_ref, created_at, updated_at
			FROM tickets
			WHERE id = ${ticketId}`
	)) as RawRow | undefined;
	if (ticketRow === undefined) {
		return null;
	}

	const currentRow = (await db.get(
		sql`SELECT id FROM ticket_executions WHERE ticket_id = ${ticketId} AND is_current = 1`
	)) as RawRow | undefined;

	const ticket = {
		id: requiredText(ticketRow.id),
		title: text(ticketRow.title),
		type: text(ticketRow.type),
		sourceKind: requiredText(ticketRow.source_kind),
		sourceRef: text(ticketRow.source_ref),
		createdAt: requiredText(ticketRow.created_at),
		updatedAt: requiredText(ticketRow.updated_at)
	};

	if (currentRow === undefined) {
		return {
			ticket,
			execution: null,
			priorGenerations: [],
			tasks: [],
			attention: [],
			sessions: [],
			usageByStage: []
		};
	}

	const executionId = requiredText(currentRow.id);
	const [execution, priorGenerations, tasks, attention, sessions, usageByStage] = await Promise.all(
		[
			getTicketDetailExecution(db, executionId),
			getPriorGenerations(db, ticketId),
			getTasks(db, executionId),
			getAttention(db, executionId),
			getSessions(db, executionId),
			getUsageByStage(db, executionId)
		]
	);

	return { ticket, execution, priorGenerations, tasks, attention, sessions, usageByStage };
}
