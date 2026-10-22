import { describe, expect, it } from 'vitest';

import { toRunDetail } from './adapters';
import { runHistoryReviewChanges, runWorkValidationFailed } from './fixtures';
import type { components } from './generated/factory-api';
import type { RunResult } from './inspector';
import { RunDetailState, runEndpoint } from './run-detail-state.svelte';

type Schemas = components['schemas'];

const RUN = runWorkValidationFailed.id;
const ok = (run: Schemas['Run'] = runWorkValidationFailed): RunResult => ({
	ok: true,
	run: toRunDetail(run)
});
const failed = (type: string, title: string, retryable = true): RunResult => ({
	ok: false,
	failure: { type, title, retryable }
});

/** A fetch whose answers the test releases by hand, recording the URLs. */
function heldFetch() {
	const urls: string[] = [];
	const pending: ((result: RunResult) => void)[] = [];
	const fetch = (input: string) => {
		urls.push(input);
		return new Promise<Response>((resolve) => {
			pending.push((result) =>
				resolve(new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 }))
			);
		});
	};
	return { fetch, urls, pending };
}

describe('RunDetailState', () => {
	it('reads the run through the endpoint, encoding the id', async () => {
		const { fetch, urls, pending } = heldFetch();
		const state = new RunDetailState(fetch);
		expect(state.view(2, RUN)).toEqual({ kind: 'loading' });
		const read = state.load(2, RUN);
		expect(state.view(2, RUN)).toEqual({ kind: 'loading' });
		pending[0]!(ok());
		await read;
		expect(urls).toEqual([`/api/factory/runs/${RUN}`]);
		const view = state.view(2, RUN);
		expect(view.kind).toBe('loaded');
		if (view.kind === 'loaded') expect(view.run.validation?.checks).toHaveLength(4);
		expect(runEndpoint('a/b#1')).toBe('/api/factory/runs/a%2Fb%231');
	});

	it('a second load of the same (execution, run) does not fetch; another execution does', async () => {
		const { fetch, urls, pending } = heldFetch();
		const state = new RunDetailState(fetch);
		const first = state.load(2, RUN);
		await state.load(2, RUN); // in flight: not read again
		pending[0]!(ok());
		await first;
		await state.load(2, RUN); // loaded: not read again
		expect(urls).toHaveLength(1);

		const other = state.load(1, RUN);
		expect(urls).toHaveLength(2);
		expect(state.view(1, RUN)).toEqual({ kind: 'loading' });
		expect(state.view(2, RUN).kind).toBe('loaded');
		pending[1]!(ok());
		await other;
		expect(state.view(1, RUN).kind).toBe('loaded');
	});

	it('keeps runs apart: each key holds its own answer', async () => {
		const { fetch, pending } = heldFetch();
		const state = new RunDetailState(fetch);
		const a = state.load(2, RUN);
		const b = state.load(2, runHistoryReviewChanges.id);
		pending[1]!(ok(runHistoryReviewChanges));
		pending[0]!(failed('internal_error', 'Factory unavailable'));
		await Promise.all([a, b]);
		expect(state.view(2, RUN)).toEqual({
			kind: 'error',
			title: 'Factory unavailable',
			retryable: true
		});
		const view = state.view(2, runHistoryReviewChanges.id);
		expect(view.kind === 'loaded' && view.run.review?.verdict).toBe('changes_requested');
	});

	it('drops a stale response that a later read of the same key superseded', async () => {
		const { fetch, pending } = heldFetch();
		const state = new RunDetailState(fetch);
		const older = state.load(2, RUN);
		const newer = state.retry(2, RUN);
		pending[1]!(ok());
		await newer;
		pending[0]!(failed('internal_error', 'Older failure'));
		await older;
		expect(state.view(2, RUN).kind).toBe('loaded');
	});

	it('caches a failure until retry; retry reads again', async () => {
		const { fetch, urls, pending } = heldFetch();
		const state = new RunDetailState(fetch);
		const broken = state.load(2, RUN);
		pending[0]!(failed('internal_error', 'Factory unavailable'));
		await broken;
		expect(state.view(2, RUN)).toEqual({
			kind: 'error',
			title: 'Factory unavailable',
			retryable: true
		});
		await state.load(2, RUN);
		expect(urls).toHaveLength(1);

		const retried = state.retry(2, RUN);
		expect(state.view(2, RUN)).toEqual({ kind: 'loading' });
		pending[1]!(ok());
		await retried;
		expect(urls).toHaveLength(2);
		expect(state.view(2, RUN).kind).toBe('loaded');
	});

	it('maps not found, and an unreadable answer or a network failure is a retryable error', async () => {
		const { fetch, pending } = heldFetch();
		const state = new RunDetailState(fetch);
		const missing = state.load(2, 'run_missing');
		pending[0]!(failed('not_found', 'Not found', false));
		await missing;
		expect(state.view(2, 'run_missing')).toEqual({ kind: 'not_found', id: 'run_missing' });

		const offline = new RunDetailState(async () => {
			throw new TypeError('offline');
		});
		await offline.load(2, RUN);
		expect(offline.view(2, RUN)).toEqual({
			kind: 'error',
			title: 'Run unreachable',
			retryable: true
		});
		const garbled = new RunDetailState(async () => new Response('<html>', { status: 502 }));
		await garbled.load(2, RUN);
		expect(garbled.view(2, RUN).kind).toBe('error');
	});
});
