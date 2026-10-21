/**
 * The attention projection: the factory's needs-attention tickets in, a
 * headline, reason groups and a prioritized queue out. Pure and browser-safe:
 * type imports only, no `$lib/server`, no `$env`.
 *
 * - Membership is the input list, which the factory filters with
 *   `needsUser=true`. A ticket is never dropped; reasons only label it.
 * - Reasons come from the status and the ticket's open attention requests.
 *   When none applies, the ticket reads `waiting`. If the detail was not read
 *   (failed, or the ticket is beyond the open board list's bound), only the
 *   status can label it.
 * - Attention requests carry no timestamp, so `since` is the ticket's
 *   `updatedAt`: the best available "oldest first", not when attention began.
 */
import type { components } from '$lib/factory/generated/factory-api';

import type { AttentionKind, AttentionStatus, ExecutionStatus, TicketKey } from './models';
import { attentionReasonSignal, type AttentionReason, type Signal } from './status';

type Schemas = components['schemas'];

/** Display and grouping order. */
export const ATTENTION_REASONS = [
	'question',
	'limit',
	'approval',
	'waiting',
	'paused',
	'failed',
	'handoff'
] as const satisfies readonly AttentionReason[];

const KIND_REASONS: Record<string, AttentionReason> = {
	agent_question: 'question',
	policy_limit: 'limit',
	manual_approval: 'approval'
};

const STATUS_REASONS: Record<string, AttentionReason> = {
	paused: 'paused',
	failed: 'failed',
	resume_failed: 'failed',
	ready_for_handoff: 'handoff'
};

export type AttentionItem = {
	key: TicketKey;
	displayRef: string;
	title: string;
	/** De-duplicated, in `ATTENTION_REASONS` order; never empty. */
	reasons: AttentionReason[];
	/** 0: decisions, waiting, paused or failed. 1: ready for handoff only. */
	priority: 0 | 1;
	/** The ticket's `updatedAt`; the API has no attention start time. */
	since: string;
};

export type AttentionGroup = {
	reason: AttentionReason;
	label: string;
	signal: Signal;
	/** Tickets with this reason; groups may overlap, so they can sum past the headline. */
	count: number;
};

export type AttentionModel = {
	/** `count` is distinct tickets. When `complete` is false it is a lower bound. */
	headline: { count: number; complete: boolean };
	/** Non-empty groups only, in `ATTENTION_REASONS` order. */
	groups: AttentionGroup[];
	queue: AttentionItem[];
};

export type AttentionInput = {
	/** The `needsUser=true` list, as the pager returned it. */
	tickets: Schemas['TicketSummary'][];
	/** False when the pager stopped at its bound. */
	complete: boolean;
	/** Details already read, matched by key; a missing or `null` detail labels by status only. */
	details?: (Schemas['TicketDetail'] | null)[];
};

/** Reasons for one needs-attention ticket, with the `waiting` fallback. */
export function attentionReasons(
	ticket: { status: ExecutionStatus },
	detail:
		{ attention: readonly { kind: AttentionKind; status: AttentionStatus }[] } | null | undefined
): AttentionReason[] {
	const found = new Set<AttentionReason>();
	for (const request of detail?.attention ?? []) {
		if (request.status !== 'open') continue;
		const reason = Object.hasOwn(KIND_REASONS, request.kind) ? KIND_REASONS[request.kind] : null;
		if (reason) found.add(reason);
	}
	const byStatus = Object.hasOwn(STATUS_REASONS, ticket.status)
		? STATUS_REASONS[ticket.status]
		: null;
	if (byStatus) found.add(byStatus);
	if (found.size === 0) found.add('waiting');
	return ATTENTION_REASONS.filter((reason) => found.has(reason));
}

function byPriority(a: AttentionItem, b: AttentionItem): number {
	if (a.priority !== b.priority) return a.priority - b.priority;
	if (a.since !== b.since) return a.since < b.since ? -1 : 1;
	return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export function toAttention(input: AttentionInput): AttentionModel {
	const detailByKey = new Map<string, Schemas['TicketDetail']>();
	for (const detail of input.details ?? []) {
		if (detail !== null) detailByKey.set(detail.key, detail);
	}

	const seen = new Set<string>();
	const queue: AttentionItem[] = [];
	for (const ticket of input.tickets) {
		if (seen.has(ticket.key)) continue;
		seen.add(ticket.key);
		const reasons = attentionReasons(ticket, detailByKey.get(ticket.key));
		queue.push({
			key: ticket.key,
			displayRef: ticket.displayRef,
			title: ticket.title,
			reasons,
			priority: reasons.every((reason) => reason === 'handoff') ? 1 : 0,
			since: ticket.updatedAt
		});
	}
	queue.sort(byPriority);

	const groups = ATTENTION_REASONS.map((reason): AttentionGroup => {
		const { label, signal } = attentionReasonSignal(reason);
		const count = queue.filter((item) => item.reasons.includes(reason)).length;
		return { reason, label, signal, count };
	}).filter((group) => group.count > 0);

	return { headline: { count: queue.length, complete: input.complete }, groups, queue };
}

export type NextAttention = { key: TicketKey; visited: ReadonlySet<TicketKey> };

/**
 * The ticket "Open next" selects: the first queue item that is neither
 * visited nor the current selection. When every item is visited, the set
 * clears and the queue wraps to the first item that is not current; a lone
 * item that is already current is re-selected. Null for an empty queue.
 *
 * Visited keys no longer in the queue are dropped, so a resolved ticket is
 * never returned. Only calling this moves the selection.
 */
export function nextAttention(
	queue: readonly Pick<AttentionItem, 'key'>[],
	currentKey: TicketKey | null,
	visited: ReadonlySet<TicketKey>
): NextAttention | null {
	if (queue.length === 0) return null;
	const keys = queue.map((item) => item.key);
	const unvisited = keys.find((key) => key !== currentKey && !visited.has(key));
	if (unvisited !== undefined) {
		const kept = keys.filter((key) => visited.has(key));
		return { key: unvisited, visited: new Set([...kept, unvisited]) };
	}
	const wrapped = keys.find((key) => key !== currentKey) ?? keys[0]!;
	return { key: wrapped, visited: new Set([wrapped]) };
}
