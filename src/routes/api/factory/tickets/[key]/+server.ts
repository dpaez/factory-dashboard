import { json } from '@sveltejs/kit';

import { parseExecution, type TicketResult } from '$lib/factory/inspector';
import { readTicket } from '$lib/server/factory/ticket';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * The board inspector's read: one ticket's execution (`?execution=n`, or the
 * current one) as a safe `TicketResult`, with status 200 or the normalized
 * failure status. An invalid `execution` is a 400 `invalid` failure.
 * Read-only: GET is the only verb (ADR 0005).
 */
export const GET: RequestHandler = async ({ fetch, params, url }) => {
	const execution = parseExecution(url.searchParams.get('execution'));
	if (!execution.valid) {
		const body: TicketResult = {
			ok: false,
			failure: {
				type: 'invalid',
				title: 'Invalid execution',
				detail: 'The execution must be a positive whole number.',
				retryable: false
			}
		};
		return json(body, { status: 400, headers: NO_STORE });
	}
	const { status, result } = await readTicket(fetch, params.key, execution.execution);
	return json(result, { status, headers: NO_STORE });
};
