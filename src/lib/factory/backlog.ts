/**
 * The backlog projection: backlog issues in, card display models, label
 * options, a label filter and the ready-to-start count out. Pure and
 * browser-safe: type imports only, no `$lib/server`, no `$env`.
 *
 * - Availability precedence is umbrella > blocked > ready. An umbrella issue
 *   that is also blocked keeps its blockers.
 * - Ready to start counts loaded issues that are neither blocked nor umbrella,
 *   whatever label filter the lane applies.
 */
import type { components } from '$lib/factory/generated/factory-api';

import { backlogAvailabilitySignal, type BacklogAvailability, type StatusSignal } from './status';

type Schemas = components['schemas'];

export type BacklogIssue = Schemas['BacklogIssue'];
export type IssueLink = Schemas['IssueLink'];

/**
 * Issue fields the API does not return yet. Read defensively: absent or
 * empty means `null`, shown as Unavailable.
 *
 * TODO(geut/factory-skills#61): delete once the regenerated `BacklogIssue`
 * carries these fields.
 */
export type PlannedIssueFields = {
	author?: string | null;
	createdAt?: string | null;
	updatedAt?: string | null;
	description?: string | null;
};

export type BacklogCardModel = {
	id: string;
	displayRef: string;
	title: string;
	url: string;
	labels: string[];
	availability: { kind: BacklogAvailability; badge: StatusSignal };
	blockers: IssueLink[];
	children: IssueLink[];
	author: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	description: string | null;
};

function availabilityOf(issue: BacklogIssue): BacklogAvailability {
	if (issue.umbrella) return 'umbrella';
	if (issue.blocked) return 'blocked';
	return 'ready';
}

/** A planned field when it is a non-empty string, else null. */
function planned(issue: BacklogIssue, field: keyof PlannedIssueFields): string | null {
	const value: unknown = (issue as BacklogIssue & PlannedIssueFields)[field];
	return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function toBacklogCard(issue: BacklogIssue): BacklogCardModel {
	const kind = availabilityOf(issue);
	return {
		id: issue.id,
		displayRef: issue.displayRef,
		title: issue.title,
		url: issue.url,
		labels: [...issue.labels],
		availability: { kind, badge: backlogAvailabilitySignal(kind) },
		blockers: [...issue.blockedBy],
		children: [...issue.children],
		author: planned(issue, 'author'),
		createdAt: planned(issue, 'createdAt'),
		updatedAt: planned(issue, 'updatedAt'),
		description: planned(issue, 'description')
	};
}

/** Cards in the order the tracker listed the issues. */
export function toBacklogCards(items: readonly BacklogIssue[]): BacklogCardModel[] {
	return items.map(toBacklogCard);
}

/** The labels present on the issues, sorted and unique: the filter's options. */
export function backlogLabels(items: readonly { labels: readonly string[] }[]): string[] {
	return [...new Set(items.flatMap((item) => item.labels))].sort((a, b) => a.localeCompare(b));
}

/** Cards carrying the label; every card when the label is null. */
export function filterByLabel(
	cards: readonly BacklogCardModel[],
	label: string | null
): BacklogCardModel[] {
	return label === null ? [...cards] : cards.filter((card) => card.labels.includes(label));
}

/** Loaded issues that are neither blocked nor umbrella. Ignores the label filter. */
export function readyToStart(items: readonly BacklogIssue[]): number {
	return items.filter((issue) => !issue.blocked && !issue.umbrella).length;
}

/** Why a backlog read failed: safe to show and to serialize to the browser. */
export type BacklogFailure = {
	type: string;
	title: string;
	detail?: string;
	retryable: boolean;
};

/**
 * One backlog read, as the root load streams it and `/api/factory/backlog`
 * answers it. Never carries the token, the factory URL or an upstream body.
 */
export type BacklogResult =
	| { ok: true; items: BacklogIssue[]; fetchedAt: string; complete: boolean }
	| { ok: false; failure: BacklogFailure };

/** The one line the lane shows for a failure. */
export function backlogFailureReason(failure: BacklogFailure): string {
	return failure.detail ? `${failure.title}. ${failure.detail}` : `${failure.title}.`;
}
