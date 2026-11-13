/**
 * The Feedback rounds box's pending list as a view: which comments are
 * ticked, the page shown, what a round would post and how its button reads.
 * Pure and browser-safe: no runes, no `$app/*`, no `$lib/server`.
 *
 * The `only` rule mirrors Pi's picker (factory-skills
 * `src/extension/feedback-picker.ts`, `pickedFeedback`): every comment ticked
 * posts no `only` (the round takes them all); some ticked posts their refs in
 * list order; none ticked starts nothing. With nothing pending, only a note
 * starts a round.
 */
import { commandTarget, type CommandAccess, type CommandPhase } from './commands';
import type { FeedbackCandidate, PendingFeedback } from './feedback';
import type { components } from './generated/factory-api';
import type { TicketDetailView } from './models';

type FeedbackRoundItem = components['schemas']['FeedbackRoundItem'];
import { ACTION_REASONS, type ActionAvailability } from './ticket-actions';

/** Comments shown per page. */
export const FEEDBACK_PAGE_SIZE = 5;

export const FEEDBACK_KIND_LABELS = {
	thread: 'Review thread',
	review: 'Review',
	comment: 'Comment'
} as const satisfies Record<FeedbackCandidate['kind'], string>;

/** An earlier round's item kinds: the pending kinds, and the operator's note. */
export const FEEDBACK_ITEM_KIND_LABELS = {
	...FEEDBACK_KIND_LABELS,
	note: "Operator's note"
} as const satisfies Record<FeedbackRoundItem['kind'], string>;

/** An earlier round's item kind label; an unknown kind shows as sent. */
export function feedbackItemKindLabel(kind: string): string {
	return Object.hasOwn(FEEDBACK_ITEM_KIND_LABELS, kind)
		? FEEDBACK_ITEM_KIND_LABELS[kind as FeedbackRoundItem['kind']]
		: kind;
}

export const FEEDBACK_COPY = {
	heading: 'Feedback rounds',
	earlierRounds: 'Earlier rounds',
	loading: "Reading the pull request's pending comments…",
	nothingPending: 'No pending feedback on the pull request. A note still starts a round.',
	tickOne: 'Tick at least one comment to start a round.',
	noteLabel: 'Note for the round (optional)',
	start: 'Start round',
	startNote: 'Start round with the note',
	note: 'Sends the ticked comments, and the note when there is one, back through work, review and wrap-up as one more task.'
} as const;

/** What a round posts beyond its ticket: `only` when some comments are left out. */
export type FeedbackChoice = { only?: string[]; note?: string };

/** Every candidate's ref: the initial selection, everything ticked. */
export function allRefs(candidates: readonly FeedbackCandidate[]): string[] {
	return candidates.map((candidate) => candidate.ref);
}

/** Whether two reads list the same comments, in the same order. */
export function sameCandidates(
	a: readonly FeedbackCandidate[],
	b: readonly FeedbackCandidate[]
): boolean {
	return a.length === b.length && a.every((candidate, index) => candidate.ref === b[index]!.ref);
}

/**
 * What starting posts, or null when there is nothing to start: no comment
 * ticked of a non-empty list, or nothing pending and no note. The note is
 * trimmed and dropped when blank.
 */
export function pickedFeedback(input: {
	candidates: readonly FeedbackCandidate[];
	ticked: readonly string[];
	note: string;
}): FeedbackChoice | null {
	const ticked = new Set(input.ticked);
	const note = input.note.trim();
	const only = input.candidates.map((c) => c.ref).filter((ref) => ticked.has(ref));
	const withNote = note !== '' ? { note } : {};
	if (only.length === input.candidates.length) {
		return only.length > 0 || note !== '' ? withNote : null;
	}
	return only.length > 0 ? { only, ...withNote } : null;
}

/**
 * "Start round with N comments", or with the note when nothing is pending;
 * plain "Start round" while the list is not read (null).
 */
export function startLabel(total: number | null, ticked: number): string {
	if (total === null) return FEEDBACK_COPY.start;
	if (total === 0) return FEEDBACK_COPY.startNote;
	return `Start round with ${ticked} ${ticked === 1 ? 'comment' : 'comments'}`;
}

export type FeedbackPage = {
	/** Zero-based page shown, clamped to the pages there are. */
	page: number;
	pages: number;
	items: FeedbackCandidate[];
	/** "1–5 of 30"; empty when nothing is pending. */
	position: string;
};

/** One page of `FEEDBACK_PAGE_SIZE` comments. */
export function feedbackPage(candidates: readonly FeedbackCandidate[], page: number): FeedbackPage {
	const total = candidates.length;
	const pages = Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE));
	const shown = Math.min(Math.max(0, Math.trunc(page) || 0), pages - 1);
	const start = shown * FEEDBACK_PAGE_SIZE;
	const items = candidates.slice(start, start + FEEDBACK_PAGE_SIZE);
	const position = total === 0 ? '' : `${start + 1}–${start + items.length} of ${total}`;
	return { page: shown, pages, items, position };
}

/**
 * The muted line under the list: who was skipped and whether GitHub had more
 * than one page. Null when there is neither.
 */
export function skippedLine(
	skipped: PendingFeedback['skipped'],
	truncated: boolean
): string | null {
	const parts: string[] = [];
	if (skipped.length > 0) {
		const authors = [...new Set(skipped.map((item) => item.author))].join(', ');
		parts.push(
			`${skipped.length} skipped: ${authors} (not collaborators or codeHost.feedback.authors)`
		);
	}
	if (truncated) {
		parts.push(
			parts.length > 0
				? 'only the newest 100 of each list were read'
				: 'Only the newest 100 of each list were read'
		);
	}
	return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Whether the pending list is worth reading: at `ready_for_handoff` with an
 * open pull request. Elsewhere a round cannot start, and the read is not made.
 * A read-only token still reads it.
 */
export function pendingFeedbackReadable(header: TicketDetailView['header']): boolean {
	return header.status === 'ready_for_handoff' && header.pullRequest?.state === 'open';
}

/** The coordinator target of the ticket's feedback round, whatever it picks. */
export const feedbackTarget = (ticket: string) => commandTarget({ command: 'feedback', ticket });

/**
 * Whether a round can start, moved here from the action bar's Feedback round.
 * Enabled only at `ready_for_handoff` while the pull request is open.
 * Otherwise disabled with a reason: a merged or closed pull request names its
 * state; wrapup still preparing the handoff says so; before that it says a
 * round needs an open pull request at handoff. Overrides, in order, as for
 * every Inspector action: known read-only access, then a submitting or
 * accepted round.
 */
export function feedbackRoundAvailability(input: {
	header: TicketDetailView['header'];
	access: CommandAccess;
	/** The phase of the ticket's latest feedback intent. */
	phase: CommandPhase;
}): Exclude<ActionAvailability, { kind: 'hidden' }> {
	const { header, access, phase } = input;
	if (access === 'read_only') return { kind: 'disabled', reason: ACTION_REASONS.readOnly };
	const state = header.pullRequest?.state ?? null;
	if (state === 'merged') return { kind: 'disabled', reason: ACTION_REASONS.pullRequestMerged };
	if (state === 'closed') return { kind: 'disabled', reason: ACTION_REASONS.pullRequestClosed };
	if (header.status === 'ready_for_handoff') {
		if (state !== 'open') return { kind: 'disabled', reason: ACTION_REASONS.noPullRequest };
	} else if (header.stage === 'wrapup') {
		return { kind: 'disabled', reason: ACTION_REASONS.preparingHandoff };
	} else return { kind: 'disabled', reason: ACTION_REASONS.notAtHandoff };
	if (phase === 'submitting') return { kind: 'disabled', reason: ACTION_REASONS.sending };
	if (phase === 'accepted') return { kind: 'disabled', reason: ACTION_REASONS.accepted };
	return { kind: 'enabled' };
}
