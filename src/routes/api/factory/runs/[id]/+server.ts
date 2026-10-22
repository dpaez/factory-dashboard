import { json } from '@sveltejs/kit';

import { readRun } from '$lib/server/factory/run';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * The inspector's run detail read: one run's validation, review and session
 * file as a safe `RunResult`, with status 200 or the normalized failure
 * status. The id is opaque. Read-only: GET is the only verb (ADR 0005).
 */
export const GET: RequestHandler = async ({ fetch, params }) => {
	const { status, result } = await readRun(fetch, params.id);
	return json(result, { status, headers: NO_STORE });
};
