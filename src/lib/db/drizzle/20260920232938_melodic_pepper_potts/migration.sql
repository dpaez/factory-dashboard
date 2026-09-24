-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `meta` (
	`key` text,
	`value` text NOT NULL,
	CONSTRAINT `meta_pk` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text,
	`title` text,
	`type` text,
	`source_kind` text,
	`source_ref` text,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`current_task` text,
	`message` text,
	`message_at` text,
	`created_at` text,
	`updated_at` text,
	`worktree_path` text,
	`worktree_branch` text,
	`worktree_base_branch` text,
	`worktree_workspace_id` text,
	CONSTRAINT `tickets_pk` PRIMARY KEY(`id`),
	CONSTRAINT "tickets_check_1" CHECK(stage IN ('plan','work','review','wrapup','done')),
	CONSTRAINT "tickets_check_2" CHECK(status IN ('active','waiting_for_user','blocked','failed','complete'))
);
--> statement-breakpoint
CREATE TABLE `blockers` (
	`ticket_id` text,
	`reason` text NOT NULL,
	`since` text NOT NULL,
	`owner` text NOT NULL,
	`task` text,
	CONSTRAINT `blockers_pk` PRIMARY KEY(`ticket_id`),
	CONSTRAINT `fk_blockers_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
	CONSTRAINT "blockers_check_3" CHECK(owner IN ('user','agent','external'))
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`ticket_id` text NOT NULL,
	`task_id` text NOT NULL,
	`status` text,
	`review_round` integer,
	`review_verdict` text,
	`review_finding_count` integer,
	`review_blocking_count` integer,
	`review_updated_at` text,
	`updated_at` text,
	CONSTRAINT `tasks_pk` PRIMARY KEY(`ticket_id`, `task_id`),
	CONSTRAINT `fk_tasks_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
	CONSTRAINT "tasks_check_4" CHECK(status IS NULL OR status IN ('pending','in_progress','ready_for_review','done','blocked')),
	CONSTRAINT "tasks_check_5" CHECK(review_verdict IS NULL OR review_verdict IN ('approve','changes_requested','blocked'))
);
--> statement-breakpoint
CREATE TABLE `task_blocked_by` (
	`ticket_id` text NOT NULL,
	`task_id` text NOT NULL,
	`blocked_by_task_id` text NOT NULL,
	CONSTRAINT `task_blocked_by_pk` PRIMARY KEY(`ticket_id`, `task_id`, `blocked_by_task_id`),
	CONSTRAINT `fk_task_blocked_by_ticket_id_task_id_tasks_ticket_id_task_id_fk` FOREIGN KEY (`ticket_id`,`task_id`) REFERENCES `tasks`(`ticket_id`,`task_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`ticket_id` text NOT NULL,
	`session_id` text NOT NULL,
	`stage` text NOT NULL,
	`task` text,
	`round` integer,
	`model` text,
	`pane_id` text,
	`pane_name` text,
	`session_file` text,
	`status` text NOT NULL,
	`context_tokens` integer,
	`context_window` integer,
	`context_percent` real,
	`started_at` text,
	`updated_at` text,
	CONSTRAINT `sessions_pk` PRIMARY KEY(`ticket_id`, `session_id`),
	CONSTRAINT `fk_sessions_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
	CONSTRAINT "sessions_check_6" CHECK(stage IN ('plan','work','review','wrapup','done')),
	CONSTRAINT "sessions_check_7" CHECK(status IN ('starting','running','waiting_for_user','completed','failed','closed'))
);
--> statement-breakpoint
CREATE TABLE `usage` (
	`ticket_id` text NOT NULL,
	`session_id` text NOT NULL,
	`stage` text NOT NULL,
	`task` text,
	`round` integer,
	`model` text,
	`through_entry_id` text,
	`tokens_input` integer DEFAULT 0 NOT NULL,
	`tokens_output` integer DEFAULT 0 NOT NULL,
	`tokens_cache_read` integer DEFAULT 0 NOT NULL,
	`tokens_cache_write` integer DEFAULT 0 NOT NULL,
	`tokens_total` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`recorded_at` text,
	CONSTRAINT `usage_pk` PRIMARY KEY(`ticket_id`, `session_id`),
	CONSTRAINT `fk_usage_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
	CONSTRAINT "usage_check_8" CHECK(stage IN ('plan','work','review','wrapup','done'))
);
--> statement-breakpoint
CREATE TABLE `events` (
	`revision` integer,
	`at` text NOT NULL,
	`op` text NOT NULL,
	`ticket_id` text,
	`task_id` text,
	`payload` text DEFAULT '{}' NOT NULL,
	CONSTRAINT `events_pk` PRIMARY KEY(`revision`)
);
--> statement-breakpoint
CREATE INDEX `events_ticket` ON `events` (`ticket_id`,`revision`);--> statement-breakpoint
CREATE INDEX `tickets_status` ON `tickets` (`status`,`stage`);
*/