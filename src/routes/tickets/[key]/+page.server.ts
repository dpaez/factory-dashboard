import { error } from '@sveltejs/kit';

import { toTicketDetail } from '$lib/factory/adapters';
import { factoryClientFromEnv, type FactoryClient } from '$lib/server/factory/client';
import { listAllRuns, throwPageError } from '$lib/server/factory/pages';
import { getTicket, listExecutions } from '$lib/server/factory/reads';
import type { PageServerLoad } from './$types';

/**
 * `?execution` is absent (the current execution) or a positive whole number.
 * Anything else is a 400, never a silent fallback to the current execution.
 */
function parseExecution(url: URL): number | undefined {
	const raw = url.searchParams.get('execution');
	if (raw === null) return undefined;
	if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
		error(400, {
			kind: 'invalid',
			message: 'Invalid execution',
			detail: 'The execution must be a positive whole number.'
		});
	}
	return Number(raw);
}

export const load: PageServerLoad = async ({ fetch, params, url }) => {
	const execution = parseExecution(url);

	let client: FactoryClient;
	try {
		client = factoryClientFromEnv(fetch);
	} catch (cause) {
		throwPageError(cause);
	}

	// The key is opaque: passed through verbatim, never parsed.
	const key = params.key;
	const query = execution === undefined ? {} : { execution };
	const [detail, executions, runs] = await Promise.all([
		getTicket(client, key, query),
		listExecutions(client, key),
		listAllRuns(client, key, query)
	]);

	// The ticket read decides 404s and auth first; the others fail the page too.
	if (!detail.ok) throwPageError(detail.failure);
	if (!executions.ok) throwPageError(executions.failure);
	if (!runs.ok) throwPageError(runs.failure);

	return {
		detail: toTicketDetail({
			detail: detail.data,
			executions: executions.data,
			runs: runs.data.items
		}),
		runsComplete: runs.data.complete
	};
};
