/**
 * The inspector read the ticket page load and `/api/factory/tickets/<key>`
 * share: the ticket detail, its executions and every run page, read in
 * parallel and mapped to a `TicketDetailView`. Every outcome, configuration
 * and auth failures included, becomes a safe `TicketResult`.
 */
import { toTicketDetail } from '$lib/factory/adapters';
import type { TicketResult } from '$lib/factory/inspector';

import { factoryClientFromEnv, type FactoryClientOptions } from './client';
import { normalizeFactoryFailure, type FactoryApiFailure } from './errors';
import { listAllRuns } from './pages';
import { getTicket, listExecutions, type TicketKey } from './reads';

export type TicketRead =
	| { status: 200; result: Extract<TicketResult, { ok: true }> }
	| {
			/** The normalized failure status. */
			status: number;
			result: Extract<TicketResult, { ok: false }>;
			/** The normalized failure, for callers that map it to a page error. */
			failure: FactoryApiFailure;
	  };

function failed(failure: FactoryApiFailure): TicketRead {
	return {
		status: failure.status,
		failure,
		result: {
			ok: false,
			failure: {
				type: failure.type,
				title: failure.title,
				...(failure.detail !== undefined && { detail: failure.detail }),
				retryable: failure.retryable
			}
		}
	};
}

/**
 * Read one ticket's execution (the current one when `execution` is omitted).
 * The ticket read decides first (404s and auth), then executions, then runs.
 * The key is opaque: passed through verbatim. Never throws or rejects.
 */
export async function readTicket(
	fetch: FactoryClientOptions['fetch'],
	key: TicketKey,
	execution?: number
): Promise<TicketRead> {
	try {
		const client = factoryClientFromEnv(fetch);
		const query = execution === undefined ? {} : { execution };
		const [detail, executions, runs] = await Promise.all([
			getTicket(client, key, query),
			listExecutions(client, key),
			listAllRuns(client, key, query)
		]);
		if (!detail.ok) return failed(detail.failure);
		if (!executions.ok) return failed(executions.failure);
		if (!runs.ok) return failed(runs.failure);
		return {
			status: 200,
			result: {
				ok: true,
				detail: toTicketDetail({
					detail: detail.data,
					executions: executions.data,
					runs: runs.data.items
				}),
				runsComplete: runs.data.complete
			}
		};
	} catch (cause) {
		return failed(normalizeFactoryFailure(cause));
	}
}
