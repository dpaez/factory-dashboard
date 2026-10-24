import { error, redirect } from '@sveltejs/kit';

import { ticketPageHref } from '$lib/factory/inspector';
import { factoryClientFromEnv } from '$lib/server/factory/client';
import {
	CONFIGURATION_ERROR,
	normalizeFactoryFailure,
	type FactoryApiFailure
} from '$lib/server/factory/errors';
import { isConfigurationFailure, throwPageError } from '$lib/server/factory/pages';
import { listExecutions } from '$lib/server/factory/reads';
import type { PageServerLoad } from './$types';

/**
 * A Stats contributor's execution in the inspector. A stats row names its
 * execution by an internal id, not the generation `?execution=` takes, so this
 * resolves the row's `startedAt` against the ticket's executions'
 * `createdAt` (both are the execution's creation time) and redirects to that
 * generation. No match is a 404: never a fallback to the current execution.
 */
export const load: PageServerLoad = async ({ fetch, url }) => {
	const key = url.searchParams.get('key') ?? '';
	const startedAt = url.searchParams.get('startedAt') ?? '';
	if (key === '' || startedAt === '') {
		error(400, {
			kind: 'invalid',
			message: 'Invalid execution link',
			detail: 'The link needs a ticket key and an execution start time.'
		});
	}

	let result;
	try {
		result = await listExecutions(factoryClientFromEnv(fetch), key);
	} catch (cause) {
		fail(normalizeFactoryFailure(cause));
	}
	if (!result.ok) fail(result.failure);

	const matches = result.data.items.filter((execution) => execution.createdAt === startedAt);
	if (matches.length !== 1) {
		error(404, { kind: 'not_found', message: NO_SUCH_EXECUTION });
	}
	// Always name the generation, the current one too, so the link stays stable.
	redirect(303, ticketPageHref(key, { execution: matches[0]!.generation }));
};

const NO_SUCH_EXECUTION = 'No such execution in this ticket';

/** The page error for a failure, never with the upstream Problem detail. */
function fail(failure: FactoryApiFailure): never {
	const { status, type, title, retryable } = failure;
	if (isConfigurationFailure(failure)) {
		// The dashboard's own configuration detail (missing variables) is safe;
		// an upstream Problem's detail is not.
		throwPageError(type === CONFIGURATION_ERROR ? failure : { status, type, title, retryable });
	}
	if (type === 'ticket_not_found' || type === 'not_found') {
		error(404, { kind: 'not_found', message: 'No such ticket' });
	}
	error(status === 503 ? 503 : 502, { kind: 'unavailable', message: title });
}
