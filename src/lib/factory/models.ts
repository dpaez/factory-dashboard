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

/** Where the ticket came from. `href` is set only when `ref` is an http(s) URL. */
export type SourceView = {
	ref: string;
	href: string | null;
};

/** The task in progress and, when the factory recorded one, its round at its current stage. */
export type CurrentTaskView = {
	label: string;
	/** Null when the active task has no summary for its current stage; never invented. */
	round: number | null;
};

export type TicketHeader = {
	key: TicketKey;
	displayRef: string;
	sourceRef: string;
	source: SourceView;
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
	/** Null when the factory names no current task. */
	currentTask: CurrentTaskView | null;
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

export type ValidationStatus = Open<Schemas['Validation']['status']>;
export type CheckStatus = Open<Schemas['ValidationCheck']['status']>;
export type ReviewVerdict = Open<Schemas['Review']['verdict']>;
export type FindingSeverity = Open<Schemas['Review']['findings'][number]['severity']>;

/** A run's review at a glance: the verdict and how many findings block. */
export type RunReviewSummary = {
	verdict: ReviewVerdict;
	round: number;
	findings: { total: number; blocking: number };
};

export type RunView = {
	id: string;
	sequence: number;
	stage: RunStage;
	task: string | null;
	/** The factory's raw purpose, such as `initial`; `run-purpose.ts` labels it. */
	purpose: string;
	/** The task's round at this stage. */
	round: number;
	model: string;
	thinking: string;
	status: RunStatus;
	/** How a terminal run ended, such as `subagent_done` or `crashed`; null before it ends. */
	terminalKind: string | null;
	outcome: string;
	/** The latest validation attempt's status; null when the run has none. */
	validationStatus: ValidationStatus | null;
	/** Null when the run has no review. */
	review: RunReviewSummary | null;
	/** Null when the factory recorded no usage for the run. */
	usage: Usage | null;
	costUsd: number | null;
	startedAt: string | null;
	endedAt: string | null;
	activity: string | null;
};

export type ValidationCheckView = {
	name: string;
	kind: string;
	status: CheckStatus;
	command: string | null;
	/** Null when the check ran no command or did not finish. */
	exitCode: number | null;
	durationMs: number | null;
};

export type ValidationView = {
	attempt: number;
	status: ValidationStatus;
	summary: string | null;
	checks: ValidationCheckView[];
};

export type FindingView = {
	id: string;
	number: number;
	title: string;
	severity: FindingSeverity;
	blocking: boolean;
	finding: string;
	/** Text, never a link. */
	evidence: string;
	/** A path as text, never a link; null when the finding names none. */
	location: string | null;
	suggestion: string | null;
};

export type ReviewView = {
	verdict: ReviewVerdict;
	round: number;
	summary: string;
	findings: FindingView[];
};

/** One run's evidence, as `GET /api/factory/runs/<id>` answers it. */
export type RunDetailView = Omit<RunView, 'review'> & {
	validation: ValidationView | null;
	review: ReviewView | null;
	/** The Pi session file path, as text; never a link. */
	sessionFile: string | null;
};

export type TicketDetailView = {
	header: TicketHeader;
	tasks: TaskView[];
	attention: AttentionView[];
	/** The shown execution's usage total; null when the factory sent none. */
	usage: Usage | null;
	executions: ExecutionView[];
	runs: RunView[];
	/** The latest run's activity, newest run with any first. */
	latestActivity: string | null;
};
