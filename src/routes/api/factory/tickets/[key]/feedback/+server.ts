import { json } from '@sveltejs/kit';

import { readPendingFeedback } from '$lib/server/factory/feedback';
import type { RequestHandler } from './$types';

/**
 * The Feedback rounds box's read: the ticket's pending pull request comments
 * as a safe `PendingFeedbackResult`, with status 200 or the factory's refusal
 * status. Read-only: GET is the only verb (ADR 0005).
 */
export const GET: RequestHandler = async ({ fetch, params }) => {
	const { status, result } = await readPendingFeedback(fetch, params.key);
	return json(result, { status, headers: { 'cache-control': 'no-store' } });
};
