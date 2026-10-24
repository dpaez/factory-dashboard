/**
 * Start rules: when a backlog issue offers Start, what a start failure means
 * and which field it belongs to, and how the backlog and the board's tickets
 * deduplicate. Pure and browser-safe: type imports only, no runes, no
 * `$app/*`, no `$lib/server`.
 *
 * - Availability precedence: read-only access, then a pending intent
 *   (submitting, accepted, unconfirmed), then umbrella > blocked > ready, as
 *   in `backlog.ts`.
 * - An unconfirmed start is resent under the same intent id, never started
 *   again, so Start stays disabled while one is unconfirmed.
 * - Start owns its failure copy. `classifyCommandFailure` calls
 *   `invalid_state` stale ("the ticket changed"); for a start it is a conflict.
 */
import type { BacklogCardModel } from './backlog';
import {
	commandFieldName,
	commandTarget,
	type CommandAccepted,
	type CommandAccess,
	type CommandFailure,
	type CommandPhase
} from './commands';
import { ACTION_REASONS, type ActionAvailability } from './ticket-actions';

export type StartAvailability = ActionAvailability;

export const START_REASONS = {
	readOnly: ACTION_REASONS.readOnly,
	submitting: 'Starting…',
	accepted: 'Start accepted, waiting for the factory.',
	unconfirmed: "The factory's answer was lost; resend the start instead of starting again.",
	umbrella: 'Umbrella issue: start its sub-issues instead.'
} as const;

/** "Blocked by a#1 and b#2. Start it once the blocker closes." */
export function blockedReason(blockers: readonly { displayRef: string }[]): string {
	const refs = blockers.map((blocker) => blocker.displayRef);
	const named =
		refs.length === 0
			? 'another issue'
			: refs.length === 1
				? refs[0]
				: `${refs.slice(0, -1).join(', ')} and ${refs.at(-1)}`;
	const closes = refs.length > 1 ? 'the blockers close' : 'the blocker closes';
	return `Blocked by ${named}. Start it once ${closes}.`;
}

export type StartAvailabilityInput = {
	card: Pick<BacklogCardModel, 'availability' | 'blockers'>;
	access: CommandAccess;
	/** The phase of the card's start target, such as `coordinator.phaseFor(startTargetFor(card))`. */
	phase: CommandPhase;
};

export function startAvailability({
	card,
	access,
	phase
}: StartAvailabilityInput): StartAvailability {
	if (access === 'read_only') return { kind: 'disabled', reason: START_REASONS.readOnly };
	if (phase === 'submitting') return { kind: 'disabled', reason: START_REASONS.submitting };
	if (phase === 'accepted') return { kind: 'disabled', reason: START_REASONS.accepted };
	if (phase === 'unconfirmed') return { kind: 'disabled', reason: START_REASONS.unconfirmed };
	switch (card.availability.kind) {
		case 'umbrella':
			return { kind: 'disabled', reason: START_REASONS.umbrella };
		case 'blocked':
			return { kind: 'disabled', reason: blockedReason(card.blockers) };
		default:
			return { kind: 'enabled' };
	}
}

/** The coordinator target of a backlog issue's start: `start:ref:<displayRef>`. */
export function startTargetFor(card: Pick<BacklogCardModel, 'displayRef'>): string {
	return commandTarget({ command: 'start', ref: card.displayRef });
}

/** Issue reference (`{ref}`) or written brief (`{id, text}`). */
export type StartMode = 'ref' | 'brief';
export type StartField = 'ref' | 'id' | 'text';

export type StartFailureMessage = {
	/** Where the message belongs; null for the form (or the card) as a whole. */
	field: StartField | null;
	message: string;
	/** Sending again may succeed: a retry for a rejection, a resend when unconfirmed. */
	retryable: boolean;
	/** Unconfirmed: resend under the same intent id (`retryDelivery`), never submit again. */
	resend: boolean;
	/** Validation messages per field this mode shows; empty otherwise. */
	fields: Partial<Record<StartField, string>>;
};

/** What a start failure carries: a coordinator intent, or its failure and field errors. */
export type StartFailureInput = {
	phase?: CommandPhase;
	failure?: CommandFailure;
	/** Validation messages keyed by field name, as the coordinator keeps them. */
	fieldErrors?: Record<string, string>;
};

export const START_FAILURES = {
	umbrella: 'This is an umbrella issue; start one of its sub-issues.',
	tracker: 'The tracker could not be reached. Try again.',
	conflictRef:
		"Conflict: the factory cannot start this issue in its current state. Check the display reference, or open the issue's ticket.",
	conflictId:
		'Conflict: the factory cannot start a ticket with this ID in its current state. Choose another ID.',
	readOnly: ACTION_REASONS.readOnly,
	unconfirmed: "The factory's answer was lost; the start may have been applied. Resend it.",
	validation: 'Fix the highlighted fields.'
} as const;

/** The factory may have applied the command: resend under the same key. */
const UNCONFIRMED = new Set(['network_error', 'internal_error', 'contract_error']);
const MODE_FIELDS: Record<StartMode, readonly StartField[]> = {
	ref: ['ref'],
	brief: ['id', 'text']
};

function validationFields(input: StartFailureInput, mode: StartMode) {
	const named: Record<string, string> = { ...input.fieldErrors };
	for (const { path, message } of input.failure?.fieldErrors ?? []) {
		const name = commandFieldName(path);
		if (!(name in named)) named[name] = message;
	}
	const fields: Partial<Record<StartField, string>> = {};
	for (const field of MODE_FIELDS[mode]) {
		if (named[field] !== undefined) fields[field] = named[field];
	}
	return fields;
}

function titleAndDetail(failure: CommandFailure | undefined): string {
	if (!failure) return 'The start failed.';
	return failure.detail ? `${failure.title}. ${failure.detail}` : `${failure.title}.`;
}

/** Map a failed start to its field, message and next step, in the composer's mode. */
export function startFailureMessage(
	input: StartFailureInput,
	mode: StartMode
): StartFailureMessage {
	const failure = input.failure;
	const result = (
		field: StartField | null,
		message: string,
		retryable: boolean,
		extra: Partial<Pick<StartFailureMessage, 'resend' | 'fields'>> = {}
	): StartFailureMessage => ({ field, message, retryable, resend: false, fields: {}, ...extra });

	if (input.phase === 'unconfirmed' || (failure && UNCONFIRMED.has(failure.type))) {
		return result(null, START_FAILURES.unconfirmed, true, { resend: true });
	}
	switch (failure?.type) {
		case 'validation_error': {
			const fields = validationFields(input, mode);
			const first = MODE_FIELDS[mode].find((field) => fields[field] !== undefined);
			if (!first) return result(null, titleAndDetail(failure), false);
			return result(first, fields[first]!, false, { fields });
		}
		case 'umbrella_issue':
			return result(mode === 'ref' ? 'ref' : null, START_FAILURES.umbrella, false);
		case 'tracker_unavailable':
			return result(mode === 'ref' ? 'ref' : null, START_FAILURES.tracker, true);
		case 'invalid_state':
			return mode === 'ref'
				? result('ref', START_FAILURES.conflictRef, false)
				: result('id', START_FAILURES.conflictId, false);
		case 'insufficient_scope':
			return result(null, START_FAILURES.readOnly, false);
		default:
			return result(null, titleAndDetail(failure), failure?.retryable ?? false);
	}
}

/**
 * Backlog cards without a board ticket: drop a card whose `id` is a ticket's
 * `id` (a tracked ticket's id is its issue's id) or is hidden, keeping order.
 */
export function visibleBacklog<T extends { id: string }>(
	cards: readonly T[],
	{ ticketIds, hiddenIds = [] }: { ticketIds: Iterable<string>; hiddenIds?: Iterable<string> }
): T[] {
	const drop = new Set([...ticketIds, ...hiddenIds]);
	return cards.filter((card) => !drop.has(card.id));
}

/** True once a read lists the ticket an accepted start named. */
export function startedTicketKeyVisible(
	accepted: Pick<CommandAccepted, 'ticket'> | null | undefined,
	ticketKeys: Iterable<string>
): boolean {
	if (!accepted) return false;
	for (const key of ticketKeys) if (key === accepted.ticket) return true;
	return false;
}
