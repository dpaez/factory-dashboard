/**
 * The backlog read the root load streams and `/api/factory/backlog` answers.
 * Every outcome, configuration and auth failures included, becomes a safe
 * `BacklogResult`: a backlog failure stays inside the Backlog lane.
 */
import type { BacklogResult } from '$lib/factory/backlog';

import { factoryClientFromEnv, type FactoryClientOptions } from './client';
import { normalizeFactoryFailure, type FactoryApiFailure } from './errors';
import { listAllBacklog } from './pages';

export type BacklogRead = {
	/** 200, or the normalized failure status. */
	status: number;
	result: BacklogResult;
};

function failed(failure: FactoryApiFailure): BacklogRead {
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

/** Read every backlog page. Never throws or rejects. */
export async function readBacklog(
	fetch: FactoryClientOptions['fetch'],
	query: { refresh?: boolean } = {}
): Promise<BacklogRead> {
	try {
		const client = factoryClientFromEnv(fetch);
		const read = await listAllBacklog(client, query);
		if (!read.ok) return failed(read.failure);
		const { items, fetchedAt, complete } = read.data;
		return { status: 200, result: { ok: true, items, fetchedAt, complete } };
	} catch (cause) {
		return failed(normalizeFactoryFailure(cause));
	}
}
