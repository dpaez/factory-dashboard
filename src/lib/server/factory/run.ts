/**
 * The run detail read behind `/api/factory/runs/<id>`: one run from
 * `GET /v1/runs/{id}`, mapped to a `RunDetailView`. Every outcome,
 * configuration and auth failures included, becomes a safe `RunResult`.
 */
import { toRunDetail } from '$lib/factory/adapters';
import type { RunResult } from '$lib/factory/inspector';

import { factoryClientFromEnv, type FactoryClientOptions } from './client';
import { normalizeFactoryFailure, type FactoryApiFailure } from './errors';
import { getRun, type RunId } from './reads';

export type RunRead =
	| { status: 200; result: Extract<RunResult, { ok: true }> }
	| {
			/** The normalized failure status. */
			status: number;
			result: Extract<RunResult, { ok: false }>;
			failure: FactoryApiFailure;
	  };

function failed(failure: FactoryApiFailure): RunRead {
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

/** Read one run. The id is opaque: passed through verbatim. Never throws or rejects. */
export async function readRun(fetch: FactoryClientOptions['fetch'], id: RunId): Promise<RunRead> {
	try {
		const client = factoryClientFromEnv(fetch);
		const run = await getRun(client, id);
		if (!run.ok) return failed(run.failure);
		return { status: 200, result: { ok: true, run: toRunDetail(run.data) } };
	} catch (cause) {
		return failed(normalizeFactoryFailure(cause));
	}
}
