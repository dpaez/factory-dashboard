/**
 * Shared helpers for route loads: a bounded ticket pager and the one mapping
 * from a factory failure to a SvelteKit page error.
 */
import { error } from '@sveltejs/kit';

import type { components } from '$lib/factory/generated/factory-api';

import type { FactoryClient } from './client';
import { CONFIGURATION_ERROR, normalizeFactoryFailure, type FactoryApiFailure } from './errors';
import {
	listRuns,
	listTickets,
	type FactoryResult,
	type ListRunsParams,
	type ListTicketsParams,
	type TicketKey
} from './reads';

type TicketSummary = components['schemas']['TicketSummary'];
type Run = components['schemas']['Run'];

/** At most this many pages are read per list. */
export const TICKET_PAGE_BOUND = 20;
/** Page size the pager asks for. */
export const TICKET_PAGE_LIMIT = 100;

export type AllTickets = {
	items: TicketSummary[];
	/** False when the pager stopped at its bound with pages left. */
	complete: boolean;
};

/**
 * Follow `nextCursor` until the last page or the page bound. Returns the first
 * failure as is: never a partial list labelled complete.
 */
export async function listAllTickets(
	client: FactoryClient,
	query: Omit<ListTicketsParams, 'cursor' | 'limit'> = {},
	bound: { pages?: number; limit?: number } = {}
): Promise<FactoryResult<AllTickets>> {
	const pages = bound.pages ?? TICKET_PAGE_BOUND;
	const limit = bound.limit ?? TICKET_PAGE_LIMIT;
	const items: TicketSummary[] = [];
	let cursor: string | undefined;

	for (let page = 0; page < pages; page += 1) {
		const result = await listTickets(client, { ...query, limit, ...(cursor && { cursor }) });
		if (!result.ok) return result;
		items.push(...result.data.items);
		if (result.data.nextCursor === null || result.data.nextCursor === '') {
			return { ok: true, data: { items, complete: true } };
		}
		cursor = result.data.nextCursor;
	}
	return { ok: true, data: { items, complete: false } };
}

/** At most this many run pages are read per ticket detail. */
export const RUN_PAGE_BOUND = 10;
/** Page size the run pager asks for. */
export const RUN_PAGE_LIMIT = 100;

export type AllRuns = {
	items: Run[];
	/** False when the pager stopped at its bound with pages left. */
	complete: boolean;
};

/**
 * Follow a ticket's run pages until the last page or the bound. Returns the
 * first failure as is, never a partial list labelled complete.
 */
export async function listAllRuns(
	client: FactoryClient,
	key: TicketKey,
	query: Omit<ListRunsParams, 'cursor' | 'limit'> = {},
	bound: { pages?: number; limit?: number } = {}
): Promise<FactoryResult<AllRuns>> {
	const pages = bound.pages ?? RUN_PAGE_BOUND;
	const limit = bound.limit ?? RUN_PAGE_LIMIT;
	const items: Run[] = [];
	let cursor: string | undefined;

	for (let page = 0; page < pages; page += 1) {
		const result = await listRuns(client, key, { ...query, limit, ...(cursor && { cursor }) });
		if (!result.ok) return result;
		items.push(...result.data.items);
		if (result.data.nextCursor === null || result.data.nextCursor === '') {
			return { ok: true, data: { items, complete: true } };
		}
		cursor = result.data.nextCursor;
	}
	return { ok: true, data: { items, complete: false } };
}

/** Failures that mean the dashboard's own configuration or token is wrong. */
const CONFIGURATION_FAILURES: ReadonlySet<string> = new Set([
	'unauthorized',
	'insufficient_scope',
	CONFIGURATION_ERROR
]);

const NOT_FOUND_FAILURES: ReadonlySet<string> = new Set(['ticket_not_found', 'not_found']);

/** True when the failure must become the page-level configuration error. */
export function isConfigurationFailure(failure: FactoryApiFailure): boolean {
	return CONFIGURATION_FAILURES.has(failure.type);
}

/** The safe `App.Error` body and HTTP status for a failure. */
export function pageErrorFor(failure: FactoryApiFailure): { status: number; body: App.Error } {
	if (isConfigurationFailure(failure)) {
		return {
			status: 503,
			body: {
				kind: 'configuration',
				message: 'The dashboard cannot reach the factory',
				detail: failure.detail
			}
		};
	}
	if (NOT_FOUND_FAILURES.has(failure.type)) {
		return {
			status: 404,
			body: {
				kind: 'not_found',
				message: failure.type === 'ticket_not_found' ? 'No such ticket' : 'No such execution'
			}
		};
	}
	if (failure.type === 'validation_error') {
		return {
			status: 400,
			body: { kind: 'invalid', message: 'Invalid request', detail: failure.detail }
		};
	}
	// 503 when the factory said it is temporarily unable; 502 otherwise.
	const status = failure.status === 503 ? 503 : 502;
	return {
		status,
		body: { kind: 'unavailable', message: failure.title, detail: failure.detail }
	};
}

/**
 * Throw the SvelteKit page error for a failure, or for anything thrown while
 * building a client or reading (a `FactoryApiError` from
 * `factoryClientFromEnv` included). The body never carries the token, the
 * factory URL or an upstream body: failures are already normalized.
 */
export function throwPageError(cause: FactoryApiFailure | unknown): never {
	const failure = isFailure(cause) ? cause : normalizeFactoryFailure(cause);
	const { status, body } = pageErrorFor(failure);
	error(status, stripUndefined(body));
}

function isFailure(value: unknown): value is FactoryApiFailure {
	return (
		typeof value === 'object' &&
		value !== null &&
		!(value instanceof Error) &&
		typeof (value as FactoryApiFailure).type === 'string' &&
		typeof (value as FactoryApiFailure).status === 'number' &&
		typeof (value as FactoryApiFailure).title === 'string'
	);
}

function stripUndefined(body: App.Error): App.Error {
	return body.detail === undefined ? { kind: body.kind, message: body.message } : body;
}
