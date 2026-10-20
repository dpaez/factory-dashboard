import { json } from '@sveltejs/kit';

import { readBacklog } from '$lib/server/factory/backlog';
import type { RequestHandler } from './$types';

/**
 * The Backlog lane's Refresh and Retry: the same safe result the root load
 * streams, with status 200 or the normalized failure status. `?refresh=true`
 * asks the tracker again. Read-only: GET is the only verb (ADR 0005).
 */
export const GET: RequestHandler = async ({ fetch, url }) => {
	const refresh = url.searchParams.get('refresh') === 'true';
	const { status, result } = await readBacklog(fetch, { refresh });
	return json(result, { status, headers: { 'cache-control': 'no-store' } });
};
