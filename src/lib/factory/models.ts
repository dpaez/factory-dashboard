/**
 * Browser-safe view models the routes render. Adapters in `./adapters.ts`
 * build them from factory API responses. Only type imports from the generated
 * contract; never import from `$lib/server` or `$env` here.
 *
 * Conventions:
 * - Enum fields accept any string, so a value the API adds later still reaches
 *   `status.ts`, which shows it with a visible fallback.
 * - Timestamps stay ISO strings; components format them.
 * - A measurement the API does not supply is `null` (shown as unavailable),
 *   never `0`.
 */
import type { components } from '$lib/factory/generated/factory-api';

type Schemas = components['schemas'];

/** A known value, or any other string the API may send later. */
type Open<T extends string> = T | (string & {});

export type TicketKey = Schemas['TicketKey'];
export type Stage = Open<Schemas['TicketSummary']['stage']>;
export type ExecutionStatus = Open<Schemas['TicketSummary']['status']>;
export type TaskStatus = Open<Schemas['Task']['status']>;
export type TaskStage = Open<NonNullable<Schemas['Task']['stage']>>;
export type RunStage = Open<Schemas['Run']['stage']>;
export type RunStatus = Open<Schemas['Run']['status']>;
export type AttentionKind = Open<Schemas['Attention']['kind']>;
export type AttentionStatus = Open<Schemas['Attention']['status']>;
export type Usage = Schemas['Usage'];
export type Actor = Schemas['Actor'];
export type PullRequest = NonNullable<Schemas['TicketSummary']['pullRequest']>;

export type TicketProgress = {
	done: number;
	total: number;
	/** The task in work or review, such as `Overview page`; null when none. */
	current: string | null;
};

/** One row of a tickets table. */
export type TicketRow = {
	key: TicketKey;
	displayRef: string;
	title: string;
	stage: Stage;
	status: ExecutionStatus;
	needsUser: boolean;
	progress: TicketProgress;
	updatedAt: string;
	/** Cost of the current execution; null when the page did not read it. */
	costUsd: number | null;
};

/** A ticket list that says whether it holds every matching ticket. */
export type TicketList = {
	rows: TicketRow[];
	/** False when the pager stopped at its bound before the last page. */
	complete: boolean;
};

export type TicketHeader = {
	key: TicketKey;
	displayRef: string;
	sourceRef: string;
	title: string;
	stage: Stage;
	status: ExecutionStatus;
	statusReason: string | null;
	needsUser: boolean;
	/** The execution number shown. */
	execution: number;
	/** Whether the shown execution is the ticket's current one. */
	current: boolean;
	pullRequest: PullRequest | null;
	trackerWarnings: string[];
	progress: TicketProgress;
	updatedAt: string;
};

export type TaskBlocker = {
	id: string;
	/** True when the blocking task is not done (or is not in this execution). */
	open: boolean;
};

export type StageSummary = {
	stage: string;
	round: number;
	label: string;
	counts: Record<string, number>;
};

export type TaskView = {
	ordinal: number;
	id: string;
	title: string;
	status: TaskStatus;
	stage: TaskStage | null;
	blockedBy: TaskBlocker[];
	/** `review` and `qa` first, then the other stages in API order. */
	summaries: StageSummary[];
};

export type AttentionReplyView = {
	actor: Actor | null;
	answer: string;
	current: boolean;
	createdAt: string;
};

export type AttentionView = {
	id: string;
	kind: AttentionKind;
	status: AttentionStatus;
	question: string;
	replies: AttentionReplyView[];
};

export type ExecutionView = {
	generation: number;
	stage: Stage;
	status: ExecutionStatus;
	statusReason: string | null;
	current: boolean;
	createdAt: string;
	finishedAt: string | null;
	/** The execution the page shows. */
	selected: boolean;
};

export type RunView = {
	id: string;
	sequence: number;
	stage: RunStage;
	task: string | null;
	model: string;
	status: RunStatus;
	outcome: string;
	/** Null when the factory recorded no usage for the run. */
	usage: Usage | null;
	costUsd: number | null;
	startedAt: string | null;
	endedAt: string | null;
	activity: string | null;
};

export type TicketDetailView = {
	header: TicketHeader;
	tasks: TaskView[];
	attention: AttentionView[];
	/** The shown execution's usage total. */
	usage: Usage;
	executions: ExecutionView[];
	runs: RunView[];
	/** The latest run's activity, newest run with any first. */
	latestActivity: string | null;
};
