/**
 * Which ticket commands the Inspector offers, and why the others are
 * unavailable. Pure and browser-safe: no runes, no `$app/*`, no `$lib/server`.
 *
 * The selector mirrors the controller's rules only to decide what to offer;
 * the factory still decides validity, and a refused command comes back as a
 * stale rejection and a reread. Rules (plan.md, "Action rules"):
 *
 * - A past execution offers nothing: no control may target it.
 * - Stop: shown while the execution has a non-terminal run; enabled once one
 *   run is chosen (automatically when there is only one).
 * - Reply: shown while an attention is open; enabled when the ticket waits
 *   for the user or is paused and that attention names the waiting run.
 * - Retry: shown when paused, failed or resume_failed.
 * - Cancel: shown while the stage is not `done` and the execution has not ended.
 * - Mark complete: shown at `ready_for_handoff` or in wrapup; enabled at
 *   `ready_for_handoff`.
 * - Rerun: shown when complete, cancelled or failed.
 * - An unknown status offers only Cancel (while the stage is not `done`).
 *
 * Overrides, in order: known read-only access disables every shown action;
 * a submitting or accepted intent for the action's target disables it.
 */
import { commandTarget, type CommandAccess, type CommandPhase } from './commands';
import type { RunStage, TicketDetailView } from './models';

export const TICKET_ACTIONS = ['stop', 'reply', 'retry', 'cancel', 'complete', 'rerun'] as const;
export type TicketAction = (typeof TICKET_ACTIONS)[number];

export type ActionAvailability =
	{ kind: 'hidden' } | { kind: 'enabled' } | { kind: 'disabled'; reason: string };

/** A run Stop can target: a non-terminal run of the current execution. */
export type StoppableRun = {
	id: string;
	sequence: number;
	stage: RunStage;
	task: string | null;
};

/** The open attention a reply answers. */
export type ReplyTarget = {
	id: string;
	question: string;
	/** The run waiting for the answer; null when none is (the reply is disabled). */
	runId: string | null;
};

export type TicketActionsInput = {
	detail: TicketDetailView;
	access: CommandAccess;
	/** The phase of a command target's latest intent, such as `coordinator.phaseFor`. */
	phaseFor: (target: string) => CommandPhase;
	/** The run the operator chose to stop, when several are active. */
	stopRun?: string | null;
};

export type TicketActions = {
	actions: Record<TicketAction, ActionAvailability>;
	/** Non-terminal runs of the current execution, in API order; empty for a past one. */
	stoppableRuns: StoppableRun[];
	/** The run Stop targets: the chosen one, or the only one; null when none is chosen. */
	stopRun: string | null;
	/** The open attention a reply answers; null when none is open. */
	reply: ReplyTarget | null;
};

export const ACTION_REASONS = {
	readOnly: "Action access required: this dashboard's token cannot send commands.",
	chooseRun: 'Choose which run to stop.',
	noWaitingRun: 'No agent is waiting for a reply to this pause; retry or cancel instead.',
	notWaiting: 'The factory is not waiting for a reply.',
	preparingHandoff: 'Wrapup is still preparing the handoff.',
	sending: 'Sending…',
	stopRequested: 'Stop requested.',
	accepted: 'Accepted, waiting for the factory.'
} as const;

const KNOWN_STATUSES = new Set([
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
]);
const RETRYABLE = new Set(['paused', 'failed', 'resume_failed']);
const ENDED = new Set(['complete', 'cancelled']);
const RERUNNABLE = new Set(['complete', 'cancelled', 'failed']);
const REPLYABLE = new Set(['waiting_for_user', 'paused']);

const HIDDEN: ActionAvailability = { kind: 'hidden' };
const ENABLED: ActionAvailability = { kind: 'enabled' };
const disabled = (reason: string): ActionAvailability => ({ kind: 'disabled', reason });

function allHidden(): Record<TicketAction, ActionAvailability> {
	return Object.fromEntries(TICKET_ACTIONS.map((action) => [action, HIDDEN])) as Record<
		TicketAction,
		ActionAvailability
	>;
}

/** A pending reason for a submitting or accepted intent; null otherwise. */
function pendingReason(action: TicketAction, phase: CommandPhase): string | null {
	if (action === 'stop' && (phase === 'submitting' || phase === 'accepted')) {
		return ACTION_REASONS.stopRequested;
	}
	if (phase === 'submitting') return ACTION_REASONS.sending;
	if (phase === 'accepted') return ACTION_REASONS.accepted;
	return null;
}

export function ticketActions(input: TicketActionsInput): TicketActions {
	const { detail, access, phaseFor } = input;
	const { header } = detail;
	if (!header.current) {
		return { actions: allHidden(), stoppableRuns: [], stopRun: null, reply: null };
	}

	const known = KNOWN_STATUSES.has(header.status);
	const status = header.status;
	const stoppableRuns: StoppableRun[] = detail.runs
		.filter((run) => run.status !== 'terminal')
		.map(({ id, sequence, stage, task }) => ({ id, sequence, stage, task }));
	const chosen = stoppableRuns.some((run) => run.id === input.stopRun) ? input.stopRun! : null;
	const stopRun = stoppableRuns.length === 1 ? stoppableRuns[0]!.id : chosen;
	const open = detail.attention.find((attention) => attention.status === 'open');
	const reply: ReplyTarget | null = open
		? { id: open.id, question: open.question, runId: open.runId }
		: null;

	const base: Record<TicketAction, ActionAvailability> = allHidden();
	if (known && stoppableRuns.length > 0) {
		base.stop = stopRun ? ENABLED : disabled(ACTION_REASONS.chooseRun);
	}
	if (known && reply) {
		if (!REPLYABLE.has(status)) base.reply = disabled(ACTION_REASONS.notWaiting);
		else if (reply.runId === null) base.reply = disabled(ACTION_REASONS.noWaitingRun);
		else base.reply = ENABLED;
	}
	if (RETRYABLE.has(status)) base.retry = ENABLED;
	if (header.stage !== 'done' && !ENDED.has(status)) base.cancel = ENABLED;
	if (status === 'ready_for_handoff') base.complete = ENABLED;
	else if (known && header.stage === 'wrapup') {
		base.complete = disabled(ACTION_REASONS.preparingHandoff);
	}
	if (RERUNNABLE.has(status)) base.rerun = ENABLED;

	const targets: Record<TicketAction, string | null> = {
		stop: stopRun ? commandTarget({ command: 'stop', run: stopRun }) : null,
		reply: commandTarget({ command: 'reply', ticket: header.key, answer: '' }),
		retry: commandTarget({ command: 'retry', ticket: header.key }),
		cancel: commandTarget({ command: 'cancel', ticket: header.key }),
		complete: commandTarget({ command: 'complete', ticket: header.key }),
		rerun: commandTarget({ command: 'rerun', ticket: header.key })
	};

	const actions = allHidden();
	for (const action of TICKET_ACTIONS) {
		const availability = base[action];
		if (availability.kind === 'hidden') continue;
		if (access === 'read_only') {
			actions[action] = disabled(ACTION_REASONS.readOnly);
			continue;
		}
		const target = targets[action];
		const pending = target ? pendingReason(action, phaseFor(target)) : null;
		actions[action] = pending ? disabled(pending) : availability;
	}

	return { actions, stoppableRuns, stopRun, reply };
}
