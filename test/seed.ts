import type { DatabaseSync } from 'node:sqlite';

/**
 * Fixture builders for the v2 scratch database. Every insert spells out its
 * timestamps so causality holds: parents are never earlier than their
 * children, terminal runs carry `terminal_kind` + `ended_at`, and finished
 * executions carry `finished_at` with stage `done`. The schema's `CHECK`s and
 * triggers reject violations — these helpers are written to satisfy them, not
 * to work around them.
 */

export type InsertTicket = {
	id: string;
	title?: string | null;
	type?: string | null;
	sourceKind?: string;
	sourceRef?: string | null;
	createdAt?: string;
	updatedAt?: string;
};

export function insertTicket(db: DatabaseSync, ticket: InsertTicket): void {
	db.prepare(
		`INSERT INTO tickets (id, title, type, source_kind, source_ref, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	).run(
		ticket.id,
		ticket.title ?? null,
		ticket.type ?? null,
		ticket.sourceKind ?? 'github',
		ticket.sourceRef ?? null,
		ticket.createdAt ?? '2026-01-01T00:00:00.000Z',
		ticket.updatedAt ?? '2026-01-01T00:00:00.000Z'
	);
}

export type InsertExecution = {
	id: string;
	ticketId: string;
	generation?: number;
	isCurrent?: boolean;
	stage: string;
	status: string;
	factoryDir?: string;
	statusReasonCode?: string | null;
	statusReason?: string | null;
	message?: string | null;
	messageAt?: string | null;
	planPath?: string | null;
	adrPath?: string | null;
	worktreePath?: string | null;
	worktreeBranch?: string | null;
	worktreeBaseBranch?: string | null;
	worktreeWorkspaceId?: string | null;
	worktreeStatus?: string | null;
	worktreeBaseSha?: string | null;
	worktreeHeadSha?: string | null;
	createdAt?: string;
	updatedAt?: string;
	finishedAt?: string | null;
};

export function insertExecution(db: DatabaseSync, execution: InsertExecution): void {
	db.prepare(
		`INSERT INTO ticket_executions (
			id, ticket_id, generation, is_current, stage, status, factory_dir,
			status_reason_code, status_reason, message, message_at, plan_path, adr_path,
			worktree_path, worktree_branch, worktree_base_branch, worktree_workspace_id,
			worktree_status, worktree_base_sha, worktree_head_sha,
			created_at, updated_at, finished_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		execution.id,
		execution.ticketId,
		execution.generation ?? 1,
		execution.isCurrent === false ? 0 : 1,
		execution.stage,
		execution.status,
		execution.factoryDir ?? '/tmp/scratch-factory',
		execution.statusReasonCode ?? null,
		execution.statusReason ?? null,
		execution.message ?? null,
		execution.messageAt ?? null,
		execution.planPath ?? null,
		execution.adrPath ?? null,
		execution.worktreePath ?? null,
		execution.worktreeBranch ?? null,
		execution.worktreeBaseBranch ?? null,
		execution.worktreeWorkspaceId ?? null,
		execution.worktreeStatus ?? null,
		execution.worktreeBaseSha ?? null,
		execution.worktreeHeadSha ?? null,
		execution.createdAt ?? '2026-01-01T00:00:00.000Z',
		execution.updatedAt ?? '2026-01-01T00:00:00.000Z',
		execution.finishedAt ?? null
	);
}

export type InsertTask = {
	executionId: string;
	taskId: string;
	ordinal: number;
	title?: string | null;
	taskFile: string;
	status: string;
	reviewRound?: number;
	reviewVerdict?: string | null;
	findingCount?: number | null;
	blockingCount?: number | null;
	createdAt?: string;
	updatedAt?: string;
};

export function insertTask(db: DatabaseSync, task: InsertTask): void {
	db.prepare(
		`INSERT INTO tasks (
			execution_id, task_id, ordinal, title, task_file, status,
			review_round, review_verdict, finding_count, blocking_count,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		task.executionId,
		task.taskId,
		task.ordinal,
		task.title ?? null,
		task.taskFile,
		task.status,
		task.reviewRound ?? 0,
		task.reviewVerdict ?? null,
		task.findingCount ?? null,
		task.blockingCount ?? null,
		task.createdAt ?? '2026-01-01T00:00:00.000Z',
		task.updatedAt ?? '2026-01-01T00:00:00.000Z'
	);
}

export function insertTaskDependency(
	db: DatabaseSync,
	executionId: string,
	taskId: string,
	dependsOnTaskId: string
): void {
	db.prepare(
		`INSERT INTO task_dependencies (execution_id, task_id, depends_on_task_id) VALUES (?, ?, ?)`
	).run(executionId, taskId, dependsOnTaskId);
}

export type InsertSession = {
	id: string;
	executionId: string;
	logicalKey: string;
	stage: string;
	taskId?: string | null;
	model?: string;
	status?: string;
	contextTokens?: number | null;
	contextWindow?: number | null;
	contextPercent?: number | null;
	createdAt?: string;
	updatedAt?: string;
};

export function insertSession(db: DatabaseSync, session: InsertSession): void {
	db.prepare(
		`INSERT INTO agent_sessions (
			id, execution_id, logical_key, stage, task_id, model, status,
			context_tokens, context_window, context_percent, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		session.id,
		session.executionId,
		session.logicalKey,
		session.stage,
		session.taskId ?? null,
		session.model ?? 'pi-model',
		session.status ?? 'completed',
		session.contextTokens ?? null,
		session.contextWindow ?? null,
		session.contextPercent ?? null,
		session.createdAt ?? '2026-01-01T00:00:00.000Z',
		session.updatedAt ?? '2026-01-01T00:00:00.000Z'
	);
}

export type InsertRun = {
	id: string;
	executionId: string;
	sessionId: string;
	sequence: number;
	parentRunId?: string | null;
	purpose?: string;
	status?: string;
	terminalKind?: string | null;
	createdAt?: string;
	startedAt?: string | null;
	updatedAt?: string;
	endedAt?: string | null;
};

export function insertRun(db: DatabaseSync, run: InsertRun): void {
	db.prepare(
		`INSERT INTO agent_runs (
			id, execution_id, session_id, sequence, parent_run_id, purpose, status,
			terminal_kind, created_at, started_at, updated_at, ended_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		run.id,
		run.executionId,
		run.sessionId,
		run.sequence,
		run.parentRunId ?? null,
		run.purpose ?? 'initial',
		run.status ?? 'terminal',
		run.terminalKind ?? 'subagent_done',
		run.createdAt ?? '2026-01-01T00:00:00.000Z',
		run.startedAt ?? null,
		run.updatedAt ?? '2026-01-01T00:00:00.000Z',
		run.endedAt ?? null
	);
}

export type InsertUsageSnapshot = {
	sessionId: string;
	runId: string;
	snapshotKey: string;
	cumulative: {
		tokensInput: number;
		tokensOutput: number;
		tokensCacheRead: number;
		tokensCacheWrite: number;
		tokensTotal: number;
		costMicros: number;
	};
	delta: {
		tokensInput: number;
		tokensOutput: number;
		tokensCacheRead: number;
		tokensCacheWrite: number;
		tokensTotal: number;
		costMicros: number;
	};
	contextTokens?: number | null;
	contextWindow?: number | null;
	recordedAt?: string;
};

export function insertUsageSnapshot(db: DatabaseSync, snapshot: InsertUsageSnapshot): void {
	db.prepare(
		`INSERT INTO usage_snapshots (
			session_id, run_id, snapshot_key,
			cumulative_tokens_input, cumulative_tokens_output,
			cumulative_tokens_cache_read, cumulative_tokens_cache_write,
			cumulative_tokens_total, cumulative_cost_usd_micros,
			delta_tokens_input, delta_tokens_output,
			delta_tokens_cache_read, delta_tokens_cache_write,
			delta_tokens_total, delta_cost_usd_micros,
			context_tokens, context_window, recorded_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		snapshot.sessionId,
		snapshot.runId,
		snapshot.snapshotKey,
		snapshot.cumulative.tokensInput,
		snapshot.cumulative.tokensOutput,
		snapshot.cumulative.tokensCacheRead,
		snapshot.cumulative.tokensCacheWrite,
		snapshot.cumulative.tokensTotal,
		snapshot.cumulative.costMicros,
		snapshot.delta.tokensInput,
		snapshot.delta.tokensOutput,
		snapshot.delta.tokensCacheRead,
		snapshot.delta.tokensCacheWrite,
		snapshot.delta.tokensTotal,
		snapshot.delta.costMicros,
		snapshot.contextTokens ?? null,
		snapshot.contextWindow ?? null,
		snapshot.recordedAt ?? '2026-01-01T00:00:00.000Z'
	);
}

export type InsertAttention = {
	id: string;
	executionId: string;
	runId?: string | null;
	kind: string;
	status: string;
	question: string;
	createdAt?: string;
	answeredAt?: string | null;
	resolvedAt?: string | null;
	cancelledAt?: string | null;
};

export function insertAttention(db: DatabaseSync, attention: InsertAttention): void {
	db.prepare(
		`INSERT INTO attention_requests (
			id, execution_id, run_id, kind, status, question,
			created_at, answered_at, resolved_at, cancelled_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		attention.id,
		attention.executionId,
		attention.runId ?? null,
		attention.kind,
		attention.status,
		attention.question,
		attention.createdAt ?? '2026-01-01T00:00:00.000Z',
		attention.answeredAt ?? null,
		attention.resolvedAt ?? null,
		attention.cancelledAt ?? null
	);
}

/** Identifiers and expected aggregates of {@link seedReadFixture}. */
export const readFixture = {
	ticketA: 'github:github.com:AAA',
	ticketB: 'github:github.com:BBB',
	executionA0: 'exec:A:1',
	executionA1: 'exec:A:2',
	executionB1: 'exec:B:1',
	sessionAPlan: 'sess:A:plan',
	sessionAWork: 'sess:A:work',
	sessionBPlan: 'sess:B:plan',
	runAPlan1: 'run:A:plan:1',
	runAWork1: 'run:A:work:1',
	runAWork2: 'run:A:work:2',
	runBPlan1: 'run:B:plan:1',
	attentionOpen: 'att:A:1',
	attentionResolved: 'att:A:2',
	/** A1's `updated_at` — the newest execution update in the fixture. */
	updatedAt: '2026-01-01T05:00:00.000Z',
	/**
	 * Expected overview totals: ticket A plan 500_000 + ticket A work
	 * 2_500_000 (the *latest* cumulative snapshot of the resumed session, not
	 * 1_000_000 + 2_500_000) + ticket B 1_000_000.
	 */
	totalCostMicros: 4_000_000,
	totalTokensInput: 1_310,
	totalTokensOutput: 135,
	totalTokensCacheRead: 520,
	totalTokensCacheWrite: 60,
	totalTokensTotal: 2_025
} as const;

/**
 * Seed a multi-ticket v2 scenario into a scratch database:
 *
 * - Ticket A (`type: 'feature'`): a superseded generation 1 (stage `done`,
 *   status `cancelled`, `finished_at` set) and a current generation 2 at stage
 *   `work` / status `active` with:
 *   - three tasks inserted out of ordinal order: `01` done (review round 1,
 *     verdict `approve`), `02` pending depending on done `01`, `03` pending
 *     depending on pending `02`;
 *   - a plan session with one terminal run and one snapshot ($0.50);
 *   - a **resumed** work session: two terminal runs, two snapshots, where the
 *     second snapshot's cumulative values are higher ($1.00 then $2.50
 *     cumulative; $1.00 + $1.50 deltas);
 *   - an `open` `agent_question` and a `resolved` `policy_limit`.
 * - Ticket B (`type: null`): a current execution at stage `done` / status
 *   `complete` with one plan session snapshot ($1.00).
 */
export function seedReadFixture(db: DatabaseSync): typeof readFixture {
	insertTicket(db, {
		id: readFixture.ticketA,
		title: 'Resumed session ticket',
		type: 'feature',
		sourceKind: 'github',
		sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/1',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	});
	insertTicket(db, {
		id: readFixture.ticketB,
		title: 'Completed ticket',
		type: null,
		sourceKind: 'github',
		sourceRef: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	});

	// Ticket A, superseded generation 1: quiescent (done/cancelled, finished).
	insertExecution(db, {
		id: readFixture.executionA0,
		ticketId: readFixture.ticketA,
		generation: 1,
		isCurrent: false,
		stage: 'done',
		status: 'cancelled',
		createdAt: '2026-01-01T00:01:00.000Z',
		updatedAt: '2026-01-01T01:00:00.000Z',
		finishedAt: '2026-01-01T01:00:00.000Z'
	});

	// Ticket A, current generation 2.
	insertExecution(db, {
		id: readFixture.executionA1,
		ticketId: readFixture.ticketA,
		generation: 2,
		isCurrent: true,
		stage: 'work',
		status: 'active',
		statusReasonCode: 'work_in_progress',
		statusReason: 'Implementing task 02',
		message: 'Writing the read module',
		messageAt: '2026-01-01T05:00:00.000Z',
		planPath: '.factory/tickets/x/plan.md',
		adrPath: '.factory/tickets/x/adr.md',
		worktreePath: '/tmp/worktrees/x',
		worktreeBranch: 'factory/x',
		worktreeBaseBranch: 'main',
		worktreeWorkspaceId: 'ws-1',
		worktreeStatus: 'ready',
		worktreeBaseSha: 'aaaaaaa',
		worktreeHeadSha: 'bbbbbbb',
		createdAt: '2026-01-01T01:01:00.000Z',
		updatedAt: readFixture.updatedAt,
		finishedAt: null
	});

	// Tasks inserted out of ordinal order to prove the ordering.
	insertTask(db, {
		executionId: readFixture.executionA1,
		taskId: '03',
		ordinal: 3,
		title: 'Overview page',
		taskFile: '03-task-overview-page.md',
		status: 'pending',
		createdAt: '2026-01-01T01:02:00.000Z',
		updatedAt: '2026-01-01T01:02:00.000Z'
	});
	insertTask(db, {
		executionId: readFixture.executionA1,
		taskId: '01',
		ordinal: 1,
		title: 'Connection',
		taskFile: '01-task-readonly-v2-connection.md',
		status: 'done',
		reviewRound: 1,
		reviewVerdict: 'approve',
		findingCount: 2,
		blockingCount: 0,
		createdAt: '2026-01-01T01:02:00.000Z',
		updatedAt: '2026-01-01T02:00:00.000Z'
	});
	insertTask(db, {
		executionId: readFixture.executionA1,
		taskId: '02',
		ordinal: 2,
		title: 'Read module',
		taskFile: '02-task-read-module.md',
		status: 'pending',
		createdAt: '2026-01-01T01:02:00.000Z',
		updatedAt: '2026-01-01T01:02:00.000Z'
	});
	insertTaskDependency(db, readFixture.executionA1, '02', '01');
	insertTaskDependency(db, readFixture.executionA1, '03', '02');

	// Ticket A plan session: one terminal run, one snapshot ($0.50).
	insertSession(db, {
		id: readFixture.sessionAPlan,
		executionId: readFixture.executionA1,
		logicalKey: 'plan',
		stage: 'plan',
		taskId: null,
		status: 'completed',
		contextTokens: 50_000,
		contextWindow: 200_000,
		contextPercent: 25,
		createdAt: '2026-01-01T01:03:00.000Z',
		updatedAt: '2026-01-01T01:30:00.000Z'
	});
	insertRun(db, {
		id: readFixture.runAPlan1,
		executionId: readFixture.executionA1,
		sessionId: readFixture.sessionAPlan,
		sequence: 1,
		status: 'terminal',
		terminalKind: 'subagent_done',
		createdAt: '2026-01-01T01:03:00.000Z',
		startedAt: '2026-01-01T01:03:00.000Z',
		updatedAt: '2026-01-01T01:30:00.000Z',
		endedAt: '2026-01-01T01:30:00.000Z'
	});
	insertUsageSnapshot(db, {
		sessionId: readFixture.sessionAPlan,
		runId: readFixture.runAPlan1,
		snapshotKey: 'plan-1',
		cumulative: {
			tokensInput: 1_000,
			tokensOutput: 100,
			tokensCacheRead: 500,
			tokensCacheWrite: 50,
			tokensTotal: 1_650,
			costMicros: 500_000
		},
		delta: {
			tokensInput: 1_000,
			tokensOutput: 100,
			tokensCacheRead: 500,
			tokensCacheWrite: 50,
			tokensTotal: 1_650,
			costMicros: 500_000
		},
		contextTokens: 50_000,
		contextWindow: 200_000,
		recordedAt: '2026-01-01T01:30:00.000Z'
	});

	// Ticket A work session, resumed: two terminal runs, two snapshots. The
	// second snapshot's cumulative values are higher than the first's.
	insertSession(db, {
		id: readFixture.sessionAWork,
		executionId: readFixture.executionA1,
		logicalKey: 'work:02',
		stage: 'work',
		taskId: '02',
		status: 'open',
		contextTokens: 150_000,
		contextWindow: 200_000,
		contextPercent: 75,
		createdAt: '2026-01-01T02:00:00.000Z',
		updatedAt: '2026-01-01T05:00:00.000Z'
	});
	insertRun(db, {
		id: readFixture.runAWork1,
		executionId: readFixture.executionA1,
		sessionId: readFixture.sessionAWork,
		sequence: 1,
		status: 'terminal',
		terminalKind: 'subagent_done',
		createdAt: '2026-01-01T02:00:00.000Z',
		startedAt: '2026-01-01T02:00:00.000Z',
		updatedAt: '2026-01-01T03:00:00.000Z',
		endedAt: '2026-01-01T03:00:00.000Z'
	});
	insertRun(db, {
		id: readFixture.runAWork2,
		executionId: readFixture.executionA1,
		sessionId: readFixture.sessionAWork,
		sequence: 2,
		parentRunId: readFixture.runAWork1,
		purpose: 'human_reply',
		status: 'terminal',
		terminalKind: 'caller_ping',
		createdAt: '2026-01-01T04:00:00.000Z',
		startedAt: '2026-01-01T04:00:00.000Z',
		updatedAt: '2026-01-01T05:00:00.000Z',
		endedAt: '2026-01-01T05:00:00.000Z'
	});
	insertUsageSnapshot(db, {
		sessionId: readFixture.sessionAWork,
		runId: readFixture.runAWork1,
		snapshotKey: 'work-1',
		cumulative: {
			tokensInput: 100,
			tokensOutput: 10,
			tokensCacheRead: 0,
			tokensCacheWrite: 0,
			tokensTotal: 110,
			costMicros: 1_000_000
		},
		delta: {
			tokensInput: 100,
			tokensOutput: 10,
			tokensCacheRead: 0,
			tokensCacheWrite: 0,
			tokensTotal: 110,
			costMicros: 1_000_000
		},
		contextTokens: 100_000,
		contextWindow: 200_000,
		recordedAt: '2026-01-01T03:00:00.000Z'
	});
	insertUsageSnapshot(db, {
		sessionId: readFixture.sessionAWork,
		runId: readFixture.runAWork2,
		snapshotKey: 'work-2',
		cumulative: {
			tokensInput: 300,
			tokensOutput: 30,
			tokensCacheRead: 20,
			tokensCacheWrite: 10,
			tokensTotal: 360,
			costMicros: 2_500_000
		},
		delta: {
			tokensInput: 200,
			tokensOutput: 20,
			tokensCacheRead: 20,
			tokensCacheWrite: 10,
			tokensTotal: 250,
			costMicros: 1_500_000
		},
		contextTokens: 150_000,
		contextWindow: 200_000,
		recordedAt: '2026-01-01T05:00:00.000Z'
	});

	// Attention: one open agent_question (must reference a run) and one
	// resolved policy_limit.
	insertAttention(db, {
		id: readFixture.attentionOpen,
		executionId: readFixture.executionA1,
		runId: readFixture.runAWork2,
		kind: 'agent_question',
		status: 'open',
		question: 'Which layout should the overview use?',
		createdAt: '2026-01-01T04:30:00.000Z'
	});
	insertAttention(db, {
		id: readFixture.attentionResolved,
		executionId: readFixture.executionA1,
		kind: 'policy_limit',
		status: 'resolved',
		question: 'Network approval required for github.com',
		createdAt: '2026-01-01T02:30:00.000Z',
		answeredAt: '2026-01-01T02:40:00.000Z',
		resolvedAt: '2026-01-01T02:45:00.000Z'
	});

	// Ticket B: complete, with one plan session snapshot ($1.00).
	insertExecution(db, {
		id: readFixture.executionB1,
		ticketId: readFixture.ticketB,
		generation: 1,
		isCurrent: true,
		stage: 'done',
		status: 'complete',
		createdAt: '2026-01-01T00:01:00.000Z',
		updatedAt: '2026-01-01T00:31:00.000Z',
		finishedAt: '2026-01-01T00:31:00.000Z'
	});
	insertSession(db, {
		id: readFixture.sessionBPlan,
		executionId: readFixture.executionB1,
		logicalKey: 'plan',
		stage: 'plan',
		taskId: null,
		status: 'completed',
		createdAt: '2026-01-01T00:02:00.000Z',
		updatedAt: '2026-01-01T00:30:00.000Z'
	});
	insertRun(db, {
		id: readFixture.runBPlan1,
		executionId: readFixture.executionB1,
		sessionId: readFixture.sessionBPlan,
		sequence: 1,
		status: 'terminal',
		terminalKind: 'subagent_done',
		createdAt: '2026-01-01T00:02:00.000Z',
		startedAt: '2026-01-01T00:02:00.000Z',
		updatedAt: '2026-01-01T00:30:00.000Z',
		endedAt: '2026-01-01T00:30:00.000Z'
	});
	insertUsageSnapshot(db, {
		sessionId: readFixture.sessionBPlan,
		runId: readFixture.runBPlan1,
		snapshotKey: 'plan-1',
		cumulative: {
			tokensInput: 10,
			tokensOutput: 5,
			tokensCacheRead: 0,
			tokensCacheWrite: 0,
			tokensTotal: 15,
			costMicros: 1_000_000
		},
		delta: {
			tokensInput: 10,
			tokensOutput: 5,
			tokensCacheRead: 0,
			tokensCacheWrite: 0,
			tokensTotal: 15,
			costMicros: 1_000_000
		},
		recordedAt: '2026-01-01T00:30:00.000Z'
	});

	return readFixture;
}
