/**
 * The pending-feedback read `/api/factory/tickets/<key>/feedback` answers.
 * Every outcome, configuration and auth failures included, becomes a safe
 * `PendingFeedbackResult`: a refusal (409 no open pull request, 502 code host,
 * 404) keeps its status, type, title and detail.
 */
import type { PendingFeedbackResult } from '$lib/factory/feedback';

import { factoryClientFromEnv, type FactoryClientOptions } from './client';
import { normalizeFactoryFailure, type FactoryApiFailure } from './errors';
import { listPendingFeedback, type TicketKey } from './reads';

export type PendingFeedbackRead = {
	/** 200, or the normalized failure status. */
	status: number;
	result: PendingFeedbackResult;
};

function failed(failure: FactoryApiFailure): PendingFeedbackRead {
	return {
		status: failure.status,
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

/** Read one ticket's pending feedback. The key is opaque. Never throws or rejects. */
export async function readPendingFeedback(
	fetch: FactoryClientOptions['fetch'],
	key: TicketKey
): Promise<PendingFeedbackRead> {
	try {
		const client = factoryClientFromEnv(fetch);
		const read = await listPendingFeedback(client, key);
		if (!read.ok) return failed(read.failure);
		const { candidates, pullRequestUrl, skipped, ticket, truncated } = read.data;
		return {
			status: 200,
			result: { ok: true, candidates, pullRequestUrl, skipped, ticket, truncated }
		};
	} catch (cause) {
		return failed(normalizeFactoryFailure(cause));
	}
}
