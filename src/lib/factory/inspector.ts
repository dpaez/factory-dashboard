/**
 * The ticket inspector's URL state and read result. Pure and browser-safe:
 * type imports only, no `$lib/server`, no `$env`.
 *
 * URL rules:
 * - `ticket` selects a ticket on the board; the detail page has it in the path.
 * - `execution` is absent for the current execution, else a positive whole number.
 * - `tab` is absent for the default tab (`tasks`). An unknown tab reads as
 *   `tasks`: the tab is presentation, never an error.
 */
import type { TicketDetailView } from './models';

export const INSPECTOR_TABS = ['tasks', 'activity', 'evidence', 'usage'] as const;
export type InspectorTab = (typeof INSPECTOR_TABS)[number];
export const DEFAULT_INSPECTOR_TAB: InspectorTab = 'tasks';

/** The tab a `?tab=` value names; anything else is the default tab. */
export function parseTab(raw: string | null | undefined): InspectorTab {
	return (INSPECTOR_TABS as readonly string[]).includes(raw ?? '')
		? (raw as InspectorTab)
		: DEFAULT_INSPECTOR_TAB;
}

export type ExecutionParam = { valid: true; execution: number | undefined } | { valid: false };

/**
 * A `?execution=` value: absent is the current execution (`undefined`), a
 * positive whole number is that execution, anything else is invalid. Never a
 * silent fallback to the current execution.
 */
export function parseExecution(raw: string | null | undefined): ExecutionParam {
	if (raw === null || raw === undefined) return { valid: true, execution: undefined };
	if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return { valid: false };
	return { valid: true, execution: Number(raw) };
}

/** A parameter to set, or `null` to clear it. `undefined` keeps it as is. */
export type InspectorParams = {
	ticket?: string | null;
	execution?: number | null;
	tab?: InspectorTab | null;
};

/**
 * The href for the same path with `ticket`, `execution` and `tab` set or
 * cleared, keeping every other parameter. The default tab is cleared, not
 * written. Values are URL-encoded.
 */
export function inspectorHref(url: URL, params: InspectorParams): string {
	const search = new URLSearchParams(url.search);
	const apply = (name: string, value: string | null | undefined) => {
		if (value === undefined) return;
		if (value === null) search.delete(name);
		else search.set(name, value);
	};
	apply('ticket', params.ticket);
	apply(
		'execution',
		params.execution === undefined || params.execution === null
			? params.execution
			: String(params.execution)
	);
	apply(
		'tab',
		params.tab === undefined ? undefined : params.tab === DEFAULT_INSPECTOR_TAB ? null : params.tab
	);
	const query = search.toString();
	return `${url.pathname}${query ? `?${query}` : ''}`;
}

/** The ticket page's href for a key, an execution (omit for current) and a tab. */
export function ticketPageHref(
	key: string,
	options: { execution?: number | null; tab?: InspectorTab | null } = {}
): string {
	const search = new URLSearchParams();
	if (options.execution != null) search.set('execution', String(options.execution));
	if (options.tab != null && options.tab !== DEFAULT_INSPECTOR_TAB) search.set('tab', options.tab);
	const query = search.toString();
	return `/tickets/${encodeURIComponent(key)}${query ? `?${query}` : ''}`;
}

/** A failure that is safe to send to the browser: no token, URL or upstream body. */
export type TicketFailure = {
	type: string;
	title: string;
	detail?: string;
	retryable: boolean;
};

/**
 * What the Inspector shows: a read in flight, a loaded execution, a ticket or
 * execution that does not exist, or a safe failure.
 */
export type InspectorState =
	| { kind: 'loading'; key?: string }
	| { kind: 'loaded'; detail: TicketDetailView; runsComplete: boolean }
	| { kind: 'not_found'; key: string; execution?: number }
	| { kind: 'error'; title: string; retryable: boolean };

/** One inspector read, as `GET /api/factory/tickets/<key>` answers it. */
export type TicketResult =
	| { ok: true; detail: TicketDetailView; runsComplete: boolean }
	| { ok: false; failure: TicketFailure };
