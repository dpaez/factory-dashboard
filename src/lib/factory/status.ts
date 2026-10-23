/**
 * The single mapping from API status vocabulary to a display label and one of the five
 * signal tones (`--signal-*` in `src/routes/layout.css`, DESIGN.md → Signal strip).
 *
 * Browser-safe: only type imports from the generated API.
 */
import type { components } from '$lib/factory/generated/factory-api';
import type { ConnectionState } from '$lib/factory/live';

export type Signal = 'run' | 'wait' | 'standby' | 'fault' | 'clear';

export type StatusSignal = { label: string; signal: Signal };

/** TicketSummary and TicketDetail share this enum. */
export type ExecutionStatus = components['schemas']['Execution']['status'];
export type TaskStatus = components['schemas']['Task']['status'];
export type TaskStage = NonNullable<components['schemas']['Task']['stage']>;

export const EXECUTION_STATUS_SIGNALS = {
	active: { signal: 'run', label: 'Active' },
	resuming: { signal: 'run', label: 'Resuming' },
	queued: { signal: 'wait', label: 'Queued' },
	waiting_for_user: { signal: 'wait', label: 'Waiting for user' },
	ready_for_handoff: { signal: 'wait', label: 'Ready for handoff' },
	paused: { signal: 'standby', label: 'Paused' },
	cancelled: { signal: 'standby', label: 'Cancelled' },
	failed: { signal: 'fault', label: 'Failed' },
	resume_failed: { signal: 'fault', label: 'Resume failed' },
	complete: { signal: 'clear', label: 'Complete' }
} as const satisfies Record<ExecutionStatus, StatusSignal>;

/** Active tasks are Run at every stage: a stage agent is working, not a human. */
export const TASK_STATUS_SIGNALS = {
	pending: { signal: 'standby', label: 'Pending' },
	active: { signal: 'run', label: 'Active' },
	blocked: { signal: 'fault', label: 'Blocked' },
	done: { signal: 'clear', label: 'Done' },
	cancelled: { signal: 'standby', label: 'Cancelled' }
} as const satisfies Record<TaskStatus, StatusSignal>;

/** Stage names as GLOSSARY spells them in copy. */
export const TASK_STAGE_LABELS = {
	plan: 'plan',
	work: 'work',
	qa: 'QA',
	review: 'review',
	wrapup: 'wrapup'
} as const satisfies Record<TaskStage, string>;

const UNKNOWN_LABEL = 'Unknown';

function lookup<T>(table: Record<string, T>, key: string): T | undefined {
	return Object.hasOwn(table, key) ? table[key] : undefined;
}

function unknown(raw: string): StatusSignal {
	return { signal: 'standby', label: raw.trim() === '' ? UNKNOWN_LABEL : raw };
}

/** Accepts any string so runtime drift from the API still renders, as standby. */
export function executionStatusSignal(status: ExecutionStatus | (string & {})): StatusSignal {
	return lookup<StatusSignal>(EXECUTION_STATUS_SIGNALS, status) ?? unknown(status);
}

export const PREPARING_HANDOFF: StatusSignal = { signal: 'run', label: 'Preparing handoff' };

const HANDOFF_RUNNING_STATUSES: readonly string[] = ['active', 'queued', 'resuming'];

/**
 * The badge for a ticket in the Handoff (wrapup) lane: a running wrapup reads
 * "Preparing handoff", `ready_for_handoff` reads "Ready for handoff", and any
 * other status keeps its normal execution signal.
 */
export function handoffStatusSignal(status: ExecutionStatus | (string & {})): StatusSignal {
	if (HANDOFF_RUNNING_STATUSES.includes(status)) return PREPARING_HANDOFF;
	return executionStatusSignal(status);
}

/** Label is `Status · stage` when a stage is present, else the status alone. */
export function taskStatusSignal(
	status: TaskStatus | (string & {}),
	stage: TaskStage | (string & {}) | null | undefined
): StatusSignal {
	const base = lookup<StatusSignal>(TASK_STATUS_SIGNALS, status) ?? unknown(status);
	if (stage == null || stage === '') return base;
	const stageLabel = lookup<string>(TASK_STAGE_LABELS, stage) ?? stage;
	return { signal: base.signal, label: `${base.label} · ${stageLabel}` };
}

export type RunStatus = components['schemas']['Run']['status'];

/**
 * A run's own status. `terminal` says only that the run ended, not how, so it
 * is Standby rather than Clear; the run's outcome text says the rest.
 */
export const RUN_STATUS_SIGNALS = {
	prepared: { signal: 'wait', label: 'Prepared' },
	starting: { signal: 'run', label: 'Starting' },
	running: { signal: 'run', label: 'Running' },
	terminal: { signal: 'standby', label: 'Ended' }
} as const satisfies Record<RunStatus, StatusSignal>;

/** Accepts any string so runtime drift from the API still renders, as standby. */
export function runStatusSignal(status: RunStatus | (string & {})): StatusSignal {
	return lookup<StatusSignal>(RUN_STATUS_SIGNALS, status) ?? unknown(status);
}

/** Why a needs-attention ticket needs a person, in display order. */
export type AttentionReason =
	'question' | 'limit' | 'approval' | 'waiting' | 'paused' | 'failed' | 'handoff';

/**
 * Attention reasons. A person is awaited, so most are Wait; Paused is
 * Standby and Failed is Fault. Never Clear, and never Beacon Yellow.
 */
export const ATTENTION_REASON_SIGNALS = {
	question: { signal: 'wait', label: 'Question' },
	limit: { signal: 'wait', label: 'Limit' },
	approval: { signal: 'wait', label: 'Approval' },
	waiting: { signal: 'wait', label: 'Waiting for a reply' },
	paused: { signal: 'standby', label: 'Paused' },
	failed: { signal: 'fault', label: 'Failed' },
	handoff: { signal: 'wait', label: 'Ready for handoff' }
} as const satisfies Record<AttentionReason, StatusSignal>;

export function attentionReasonSignal(reason: AttentionReason): StatusSignal {
	return ATTENTION_REASON_SIGNALS[reason];
}

export type BacklogAvailability = 'ready' | 'blocked' | 'umbrella';

/**
 * A backlog issue's availability. Blocked waits on another issue (Wait).
 * Ready and Umbrella are labels, not outcomes, so they are Standby: never
 * Clear, and never Beacon Yellow.
 */
export const BACKLOG_AVAILABILITY_SIGNALS = {
	ready: { signal: 'standby', label: 'Ready' },
	blocked: { signal: 'wait', label: 'Blocked' },
	umbrella: { signal: 'standby', label: 'Umbrella' }
} as const satisfies Record<BacklogAvailability, StatusSignal>;

export function backlogAvailabilitySignal(availability: BacklogAvailability): StatusSignal {
	return BACKLOG_AVAILABILITY_SIGNALS[availability];
}

export type ValidationStatus = components['schemas']['Validation']['status'];
export type CheckStatus = components['schemas']['ValidationCheck']['status'];
export type ReviewVerdict = components['schemas']['Review']['verdict'];
export type FindingSeverity = components['schemas']['Review']['findings'][number]['severity'];

/** The latest validation attempt: passed is Clear, failed and error Fault, in flight Wait or Run. */
export const VALIDATION_STATUS_SIGNALS = {
	passed: { signal: 'clear', label: 'Passed' },
	failed: { signal: 'fault', label: 'Failed' },
	error: { signal: 'fault', label: 'Error' },
	pending: { signal: 'wait', label: 'Pending' },
	running: { signal: 'run', label: 'Running' }
} as const satisfies Record<ValidationStatus, StatusSignal>;

/** One validation check. A skipped check said nothing, so it is Standby. */
export const CHECK_STATUS_SIGNALS = {
	passed: { signal: 'clear', label: 'Passed' },
	failed: { signal: 'fault', label: 'Failed' },
	error: { signal: 'fault', label: 'Error' },
	skipped: { signal: 'standby', label: 'Skipped' }
} as const satisfies Record<CheckStatus, StatusSignal>;

export const REVIEW_VERDICT_SIGNALS = {
	approve: { signal: 'clear', label: 'Approved' },
	changes_requested: { signal: 'wait', label: 'Changes requested' },
	blocked: { signal: 'fault', label: 'Blocked' }
} as const satisfies Record<ReviewVerdict, StatusSignal>;

export const FINDING_SEVERITY_SIGNALS = {
	critical: { signal: 'fault', label: 'Critical' },
	major: { signal: 'wait', label: 'Major' },
	minor: { signal: 'standby', label: 'Minor' }
} as const satisfies Record<FindingSeverity, StatusSignal>;

/** Accepts any string so runtime drift from the API still renders, as standby. */
export function validationStatusSignal(status: ValidationStatus | (string & {})): StatusSignal {
	return lookup<StatusSignal>(VALIDATION_STATUS_SIGNALS, status) ?? unknown(status);
}

/** Accepts any string so runtime drift from the API still renders, as standby. */
export function checkStatusSignal(status: CheckStatus | (string & {})): StatusSignal {
	return lookup<StatusSignal>(CHECK_STATUS_SIGNALS, status) ?? unknown(status);
}

/** Accepts any string so runtime drift from the API still renders, as standby. */
export function reviewVerdictSignal(verdict: ReviewVerdict | (string & {})): StatusSignal {
	return lookup<StatusSignal>(REVIEW_VERDICT_SIGNALS, verdict) ?? unknown(verdict);
}

/** Accepts any string so runtime drift from the API still renders, as standby. */
export function findingSeveritySignal(severity: FindingSeverity | (string & {})): StatusSignal {
	return lookup<StatusSignal>(FINDING_SEVERITY_SIGNALS, severity) ?? unknown(severity);
}

/**
 * The dashboard's connection to the factory event stream. Live is Run (never
 * Beacon Yellow); trying to connect is Standby; given up or refused is Fault.
 */
export const CONNECTION_STATE_SIGNALS = {
	connecting: { signal: 'standby', label: 'Connecting' },
	live: { signal: 'run', label: 'Live' },
	reconnecting: { signal: 'standby', label: 'Reconnecting' },
	disconnected: { signal: 'fault', label: 'Disconnected' },
	auth_failed: { signal: 'fault', label: 'Authentication failed' }
} as const satisfies Record<ConnectionState, StatusSignal>;

export function connectionStateSignal(state: ConnectionState): StatusSignal {
	return CONNECTION_STATE_SIGNALS[state];
}

export type CommandPhaseSignalKey =
	'submitting' | 'accepted' | 'confirmed' | 'rejected' | 'unconfirmed';

/**
 * A command intent's phase. Accepted is Run, not Clear: accepted is not done.
 * Only a confirmed command (its reads reread) is Clear. Rejected and
 * Unconfirmed are Fault and differ in label and explanation.
 */
export const COMMAND_PHASE_SIGNALS = {
	submitting: { signal: 'standby', label: 'Sending' },
	accepted: { signal: 'run', label: 'Accepted' },
	confirmed: { signal: 'clear', label: 'Confirmed' },
	rejected: { signal: 'fault', label: 'Rejected' },
	unconfirmed: { signal: 'fault', label: 'Unconfirmed' }
} as const satisfies Record<CommandPhaseSignalKey, StatusSignal>;

export function commandPhaseSignal(phase: CommandPhaseSignalKey): StatusSignal {
	return COMMAND_PHASE_SIGNALS[phase];
}
