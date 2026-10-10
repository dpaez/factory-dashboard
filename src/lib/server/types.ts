/**
 * The v2 status vocabulary and the typed row shapes the read module returns.
 * These types — not drizzle table inference — are the contract the Svelte
 * pages consume (ADR 0004). The literal unions mirror the `CHECK` constraints
 * the controller owns in `state-schema.sql`; when the controller ships a new
 * schema version these are refreshed deliberately, together with the guard.
 */

export const EXECUTION_STAGES = ['plan', 'work', 'review', 'wrapup', 'done'] as const;
export type ExecutionStage = (typeof EXECUTION_STAGES)[number];

export const EXECUTION_STATUSES = [
	'queued',
	'active',
	'waiting_for_user',
	'paused',
	'resuming',
	'resume_failed',
	'failed',
	'ready_for_handoff',
	'complete',
	'cancelled'
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const TASK_STATUSES = [
	'pending',
	'working',
	'ready_for_review',
	'reviewing',
	'done',
	'blocked',
	'cancelled'
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const REVIEW_VERDICTS = ['approve', 'changes_requested', 'blocked'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const ATTENTION_KINDS = ['agent_question', 'policy_limit', 'manual_approval'] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export const ATTENTION_STATUSES = [
	'open',
	'answered',
	'resuming',
	'resolved',
	'cancelled'
] as const;
export type AttentionStatus = (typeof ATTENTION_STATUSES)[number];

/**
 * `agent_sessions.stage` cannot be `done` — do not confuse it with
 * {@link ExecutionStage}. Per-stage usage breakdowns use this domain.
 */
export const SESSION_STAGES = ['plan', 'work', 'review', 'wrapup'] as const;
export type SessionStage = (typeof SESSION_STAGES)[number];

export const SESSION_STATUSES = ['prepared', 'open', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const WORKTREE_STATUSES = ['preparing', 'ready', 'removed', 'failed'] as const;
export type WorktreeStatus = (typeof WORKTREE_STATUSES)[number];

/**
 * Token and cost totals, already converted: cost only ever leaves the read
 * module as USD, never as the integer micros the controller stores.
 */
export type UsageTotals = {
	costUsd: number;
	tokensInput: number;
	tokensOutput: number;
	tokensCacheRead: number;
	tokensCacheWrite: number;
	tokensTotal: number;
};

/** One unresolved attention request on the overview, joined to its ticket. */
export type OverviewAttention = {
	id: string;
	executionId: string;
	ticketId: string;
	ticketTitle: string | null;
	kind: AttentionKind;
	status: AttentionStatus;
	question: string;
	createdAt: string;
	answeredAt: string | null;
	resolvedAt: string | null;
};

/** Everything the overview page (`/`) renders, in one query group. */
export type Overview = {
	/** Current executions per stage, zero-filled for stages with none. */
	stageCounts: Record<ExecutionStage, number>;
	/** Current executions with status `complete`. */
	completeCount: number;
	/** Current executions with status `active`. */
	activeCount: number;
	/** Cumulative totals over the latest snapshot of every session of every current execution. */
	totals: UsageTotals;
	openAttention: OverviewAttention[];
	/** Newest `ticket_executions.updated_at`, or null on an empty database. */
	updatedAt: string | null;
};

/** One row of the tickets list: the current execution of one ticket. */
export type TicketListRow = {
	/** Opaque ticket id (e.g. `github:github.com:I_kw…`); never parse it. */
	id: string;
	executionId: string;
	title: string | null;
	/** Nullable: real GitHub-sourced tickets have no type. */
	type: string | null;
	sourceKind: string;
	sourceRef: string | null;
	stage: ExecutionStage;
	status: ExecutionStatus;
	costUsd: number;
	updatedAt: string;
};

/** One generation of a ticket, for the detail page's generation history. */
export type TicketGeneration = {
	id: string;
	generation: number;
	stage: ExecutionStage;
	status: ExecutionStatus;
	createdAt: string;
	updatedAt: string;
	finishedAt: string | null;
};

/** The current execution of a ticket, as the detail page needs it. */
export type TicketDetailExecution = {
	id: string;
	generation: number;
	stage: ExecutionStage;
	status: ExecutionStatus;
	statusReasonCode: string | null;
	statusReason: string | null;
	message: string | null;
	messageAt: string | null;
	/** Exposed as data only — the dashboard never reads these files (ADR 0002). */
	planPath: string | null;
	adrPath: string | null;
	worktreePath: string | null;
	worktreeBranch: string | null;
	worktreeBaseBranch: string | null;
	worktreeWorkspaceId: string | null;
	worktreeStatus: WorktreeStatus | null;
	worktreeBaseSha: string | null;
	worktreeHeadSha: string | null;
	createdAt: string;
	updatedAt: string;
	finishedAt: string | null;
};

export type TicketDetailTask = {
	taskId: string;
	ordinal: number;
	title: string | null;
	taskFile: string;
	status: TaskStatus;
	reviewRound: number;
	reviewVerdict: ReviewVerdict | null;
	findingCount: number | null;
	blockingCount: number | null;
	/** Task ids this task waits on, from `task_dependencies`. */
	dependsOnTaskIds: string[];
};

export type TicketDetailAttention = {
	id: string;
	kind: AttentionKind;
	status: AttentionStatus;
	question: string;
	createdAt: string;
	answeredAt: string | null;
	resolvedAt: string | null;
	cancelledAt: string | null;
};

export type TicketDetailSession = {
	id: string;
	stage: SessionStage;
	taskId: string | null;
	/** The status of `taskId`'s task, or `unknown` when the session has no task. */
	taskStatus: TaskStatus | 'unknown';
	model: string;
	status: SessionStatus;
	contextTokens: number | null;
	contextWindow: number | null;
	/** 0–100, straight from the controller; null when it has not reported yet. */
	contextPercent: number | null;
	/** The session's latest cumulative snapshot, or null when it has none. */
	usage: UsageTotals | null;
};

/** Per-stage usage for one execution: deltas over every snapshot. */
export type StageUsage = { stage: SessionStage } & UsageTotals;

export type TicketDetailTicket = {
	id: string;
	title: string | null;
	type: string | null;
	sourceKind: string;
	sourceRef: string | null;
	createdAt: string;
	updatedAt: string;
};

/**
 * Everything the ticket detail page renders. `execution` is null only in the
 * theoretical case of a ticket row without a current execution.
 */
export type TicketDetail = {
	ticket: TicketDetailTicket;
	execution: TicketDetailExecution | null;
	/** Superseded generations, newest first. */
	priorGenerations: TicketGeneration[];
	/** Ordered by `ordinal`. */
	tasks: TicketDetailTask[];
	/** Every attention request of the current execution, open and resolved, oldest first. */
	attention: TicketDetailAttention[];
	sessions: TicketDetailSession[];
	/** Ordered plan → work → review → wrapup; stages without usage are absent. */
	usageByStage: StageUsage[];
};
