/**
 * The single mapping from API status vocabulary to a display label and one of the five
 * signal tones (`--signal-*` in `src/routes/layout.css`, DESIGN.md → Signal strip).
 *
 * Browser-safe: only type imports from the generated API.
 */
import type { components } from '$lib/factory/generated/factory-api';

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
