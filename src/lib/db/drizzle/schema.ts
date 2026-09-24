import { sqliteTable, foreignKey, type AnySQLiteColumn, primaryKey, index, check, text, integer, real } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const meta = sqliteTable("meta", {
	key: text().primaryKey(),
	value: text().notNull(),
});

export const tickets = sqliteTable("tickets", {
	id: text().primaryKey(),
	title: text(),
	type: text(),
	sourceKind: text("source_kind"),
	sourceRef: text("source_ref"),
	stage: text({ enum: ["plan", "work", "review", "wrapup", "done"] }).notNull(),
	status: text({ enum: ["active", "waiting_for_user", "blocked", "failed", "complete"] }).notNull(),
	currentTask: text("current_task"),
	message: text(),
	messageAt: text("message_at"),
	createdAt: text("created_at"),
	updatedAt: text("updated_at"),
	worktreePath: text("worktree_path"),
	worktreeBranch: text("worktree_branch"),
	worktreeBaseBranch: text("worktree_base_branch"),
	worktreeWorkspaceId: text("worktree_workspace_id"),
},
(table) => [index("tickets_status").on(table.status, table.stage),
check("tickets_check_1", sql`stage IN ('plan','work','review','wrapup','done')`),
check("tickets_check_2", sql`status IN ('active','waiting_for_user','blocked','failed','complete')`),
]);

export const blockers = sqliteTable("blockers", {
	ticketId: text("ticket_id").primaryKey().references(() => tickets.id, { onDelete: "cascade" } ),
	reason: text().notNull(),
	since: text().notNull(),
	owner: text().notNull(),
	task: text(),
},
(table) => [check("blockers_check_3", sql`owner IN ('user','agent','external')`),
]);

export const tasks = sqliteTable("tasks", {
	ticketId: text("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" } ),
	taskId: text("task_id").notNull(),
	status: text(),
	reviewRound: integer("review_round"),
	reviewVerdict: text("review_verdict"),
	reviewFindingCount: integer("review_finding_count"),
	reviewBlockingCount: integer("review_blocking_count"),
	reviewUpdatedAt: text("review_updated_at"),
	updatedAt: text("updated_at"),
},
(table) => [primaryKey({ columns: [table.ticketId, table.taskId], name: "tasks_pk"}),
check("tasks_check_4", sql`status IS NULL OR status IN ('pending','in_progress','ready_for_review','done','blocked')`),
check("tasks_check_5", sql`review_verdict IS NULL OR review_verdict IN ('approve','changes_requested','blocked')`),
]);

export const taskBlockedBy = sqliteTable("task_blocked_by", {
	ticketId: text("ticket_id").notNull(),
	taskId: text("task_id").notNull(),
	blockedByTaskId: text("blocked_by_task_id").notNull(),
},
(table) => [
		foreignKey({
			columns: [table.ticketId, table.taskId],
			foreignColumns: [tasks.ticketId, tasks.taskId],
			name: "fk_task_blocked_by_ticket_id_task_id_tasks_ticket_id_task_id_fk"
		}).onUpdate("no action").onDelete("cascade"),
primaryKey({ columns: [table.ticketId, table.taskId, table.blockedByTaskId], name: "task_blocked_by_pk"}),
]);

export const sessions = sqliteTable("sessions", {
	ticketId: text("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" } ),
	sessionId: text("session_id").notNull(),
	stage: text().notNull(),
	task: text(),
	round: integer(),
	model: text(),
	paneId: text("pane_id"),
	paneName: text("pane_name"),
	sessionFile: text("session_file"),
	status: text().notNull(),
	contextTokens: integer("context_tokens"),
	contextWindow: integer("context_window"),
	contextPercent: real("context_percent"),
	startedAt: text("started_at"),
	updatedAt: text("updated_at"),
},
(table) => [primaryKey({ columns: [table.ticketId, table.sessionId], name: "sessions_pk"}),
check("sessions_check_6", sql`stage IN ('plan','work','review','wrapup','done')`),
check("sessions_check_7", sql`status IN ('starting','running','waiting_for_user','completed','failed','closed')`),
]);

export const usage = sqliteTable("usage", {
	ticketId: text("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" } ),
	sessionId: text("session_id").notNull(),
	stage: text().notNull(),
	task: text(),
	round: integer(),
	model: text(),
	throughEntryId: text("through_entry_id"),
	tokensInput: integer("tokens_input").default(0).notNull(),
	tokensOutput: integer("tokens_output").default(0).notNull(),
	tokensCacheRead: integer("tokens_cache_read").default(0).notNull(),
	tokensCacheWrite: integer("tokens_cache_write").default(0).notNull(),
	tokensTotal: integer("tokens_total").default(0).notNull(),
	costUsd: real("cost_usd").default(0).notNull(),
	recordedAt: text("recorded_at"),
},
(table) => [primaryKey({ columns: [table.ticketId, table.sessionId], name: "usage_pk"}),
check("usage_check_8", sql`stage IN ('plan','work','review','wrapup','done')`),
]);

export const events = sqliteTable("events", {
	revision: integer().primaryKey(),
	at: text().notNull(),
	op: text().notNull(),
	ticketId: text("ticket_id"),
	taskId: text("task_id"),
	payload: text({"mode":"json"}).default({}).notNull(),
},
(table) => [index("events_ticket").on(table.ticketId, table.revision),
]);

