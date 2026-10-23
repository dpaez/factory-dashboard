import { error } from '@sveltejs/kit';

import { runsKey, ticketKey } from '$lib/factory/events';
import { parseExecution } from '$lib/factory/inspector';
import { throwPageError } from '$lib/server/factory/pages';
import { readTicket } from '$lib/server/factory/ticket';
import type { PageServerLoad } from './$types';

/**
 * The ticket page. It reads `?execution` only, never `?tab`, so changing the
 * tab does not rerun this load.
 */
export const load: PageServerLoad = async ({ depends, fetch, params, url }) => {
	// An event for this ticket reruns this load; one for another ticket does not.
	depends(ticketKey(params.key), runsKey(params.key));
	// Absent is the current execution; anything but a positive whole number is
	// a 400, never a silent fallback to the current execution.
	const execution = parseExecution(url.searchParams.get('execution'));
	if (!execution.valid) {
		error(400, {
			kind: 'invalid',
			message: 'Invalid execution',
			detail: 'The execution must be a positive whole number.'
		});
	}

	// The key is opaque: passed through verbatim, never parsed.
	const read = await readTicket(fetch, params.key, execution.execution);
	if ('failure' in read) throwPageError(read.failure);

	return { detail: read.result.detail, runsComplete: read.result.runsComplete };
};
