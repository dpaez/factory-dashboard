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

/**
 * What a backlog failure means for the operator. The factory sends every
 * tracker error as `tracker_unavailable` with the raw `gh` output as detail,
 * so the kind is read from that detail (until geut/factory-skills#103 adds a
 * reason field). Precedence: no tracker, missing CLI, 401, 403, 404, unknown.
 */
export type BacklogFailureKind =
	'no_tracker' | 'cli_missing' | 'unauthorized' | 'forbidden' | 'not_found' | 'unknown';

/**
 * The lane's failure display model. `message` and `action` mark inline code
 * with backticks (see `codeSegments`). `reason` is the one-line fallback for
 * an unknown failure. `detail` is the raw detail, unescaped and with a JSON
 * body pretty-printed; null when the failure has none.
 */
export type BacklogFailureView = {
	kind: BacklogFailureKind;
	message: string;
	action: string | null;
	reason: string | null;
	detail: string | null;
};

const NO_TRACKER = /FACTORY\.json has no tracker/;
const CLI_MISSING = /gh: command not found|\bENOENT\b/;
const UNAUTHORIZED = /\b401\b|Bad credentials/;
const FORBIDDEN = /\b403\b|rate limit/i;
const NOT_FOUND = /\b404\b|Could not resolve/;

const KNOWN: Record<Exclude<BacklogFailureKind, 'unknown'>, { message: string; action: string }> = {
	no_tracker: {
		message: 'No tracker configured.',
		action: 'Add `tracker` to `.factory/FACTORY.json`.'
	},
	cli_missing: {
		message: "The factory server can't find `gh`.",
		action: 'Install the GitHub CLI where the server runs.'
	},
	unauthorized: {
		message: 'GitHub rejected the credentials the factory server uses.',
		action:
			'Run `gh api graphql -f query=\'{ viewer { login } }\'` in the sandbox (`gh auth status` says "not logged in" in sbx even when the proxy injects credentials). ' +
			'If it fails, set the token on the host: `sbx secret set github --sandbox <name> -t "$(gh auth token)"`. ' +
			'If it works, a stale `gh` cache is replaying an old 401: clear `~/.cache/gh` (`rm -rf ~/.cache/gh`).'
	},
	forbidden: {
		message: 'GitHub refused the request (rate limit or missing scope).',
		action: 'The token needs `repo` read access. Try again later if rate limited.'
	},
	not_found: {
		message: "The tracker repository wasn't found.",
		action: 'Check `tracker.owner` / `tracker.repo` in `.factory/FACTORY.json`.'
	}
};

function kindOf(failure: BacklogFailure): BacklogFailureKind {
	const detail = failure.detail;
	// Only tracker errors carry gh output; a 401 from the factory itself is not GitHub's.
	if (failure.type !== 'tracker_unavailable' || !detail) return 'unknown';
	if (NO_TRACKER.test(detail)) return 'no_tracker';
	if (CLI_MISSING.test(detail)) return 'cli_missing';
	if (UNAUTHORIZED.test(detail)) return 'unauthorized';
	if (FORBIDDEN.test(detail)) return 'forbidden';
	if (NOT_FOUND.test(detail)) return 'not_found';
	return 'unknown';
}

const ESCAPES: Record<string, string> = {
	'r\\n': '\n',
	n: '\n',
	r: '\n',
	t: '\t',
	'"': '"',
	'\\': '\\'
};

/**
 * A raw tracker detail made readable: Go-quoted escapes (`\r\n`, `\n`, `\"`,
 * `\\`) become the characters they stand for, and a JSON body after `body: `
 * is pretty-printed. A body that is not JSON stays as is.
 */
export function readableDetail(detail: string): string {
	const marker = detail.indexOf('body: ');
	const parsed = marker === -1 ? null : jsonBody(detail.slice(marker + 'body: '.length).trim());
	if (parsed === null) return unescapeGo(detail);
	const head = unescapeGo(detail.slice(0, marker)).trimEnd();
	return `${head}\nbody:\n${JSON.stringify(parsed, null, 2)}`;
}

/** Go-quoted escapes in display text turned into the characters they stand for. */
function unescapeGo(text: string): string {
	return text.replace(/\\(r\\n|n|r|t|"|\\)/g, (_, escape: string) => ESCAPES[escape]!);
}

/**
 * A raw body parsed as a JSON object or array, or null. A Go-quoted body is
 * unquoted once first, so the JSON's own escapes survive until it is parsed.
 */
function jsonBody(raw: string): object | null {
	try {
		let value: unknown = JSON.parse(raw);
		if (typeof value === 'string') value = JSON.parse(value);
		return typeof value === 'object' && value !== null ? value : null;
	} catch {
		return null;
	}
}

/** Classify a backlog failure into the message, action and detail the lane shows. */
export function describeBacklogFailure(failure: BacklogFailure): BacklogFailureView {
	const kind = kindOf(failure);
	const detail = failure.detail ? readableDetail(failure.detail) : null;
	if (kind === 'unknown') {
		return {
			kind,
			message: 'Backlog unavailable.',
			action: null,
			reason: backlogFailureReason(failure),
			detail
		};
	}
	return { kind, ...KNOWN[kind], reason: null, detail };
}

/** Text split on backticks: odd segments are inline code. */
export function codeSegments(text: string): { text: string; code: boolean }[] {
	return text
		.split('`')
		.map((part, index) => ({ text: part, code: index % 2 === 1 }))
		.filter((segment) => segment.text !== '');
}
