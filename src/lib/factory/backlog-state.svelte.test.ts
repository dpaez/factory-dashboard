import { describe, expect, it } from 'vitest';

import { backlogIssuePlain, backlogBlockedIssue, backlogUmbrellaIssue } from './fixtures/backlog';
import type { BacklogResult } from './backlog';
import { BacklogState } from './backlog-state.svelte';

const ok = (items = [backlogIssuePlain, backlogBlockedIssue, backlogUmbrellaIssue]) =>
	({ ok: true, items, fetchedAt: '2026-10-13T11:00:00Z', complete: true }) as const;
const failed = {
	ok: false,
	failure: { type: 'tracker_unavailable', title: 'Tracker unavailable', retryable: true }
} as const;

/** A fetch that answers the queued results in order and records the URLs. */
function fakeFetch(results: BacklogResult[]) {
	const urls: string[] = [];
	const fetch = async (input: string) => {
		urls.push(input);
		const next = results.shift()!;
		return new Response(JSON.stringify(next), { status: next.ok ? 200 : 503 });
	};
	return { fetch, urls };
}

describe('BacklogState', () => {
	it('loads from the streamed seed and counts ready issues', async () => {
		const state = new BacklogState(fakeFetch([]).fetch);
		expect(state.status).toBe('loading');
		expect(state.readyToStart).toBeNull();
		const seed = Promise.resolve(ok());
		state.seed(seed);
		await seed;
		await Promise.resolve();
		expect(state.status).toBe('ready');
		expect(state.cards).toHaveLength(3);
		expect(state.readyToStart).toBe(1);
	});

	it('keeps stale issues after a failed refresh, and Retry repeats the refresh', async () => {
		const { fetch, urls } = fakeFetch([failed, ok([backlogIssuePlain])]);
		const state = new BacklogState(fetch);
		const seed = Promise.resolve(ok());
		state.seed(seed);
		await seed;
		await Promise.resolve();

		await state.refresh();
		expect(state.status).toBe('failed');
		expect(state.cards).toHaveLength(3);
		expect(state.fetchedAt).toBe('2026-10-13T11:00:00Z');
		expect(state.readyToStart).toBeNull();
		expect(state.reason).toContain('Tracker unavailable');

		await state.retry();
		expect(urls).toEqual([
			'/api/factory/backlog?refresh=true',
			'/api/factory/backlog?refresh=true'
		]);
		expect(state.status).toBe('ready');
		expect(state.cards).toHaveLength(1);
		expect(state.refreshing).toBe(false);
	});

	it('Retry after a failed initial read re-reads without refresh', async () => {
		const { fetch, urls } = fakeFetch([ok()]);
		const state = new BacklogState(fetch);
		const seed = Promise.resolve(failed);
		state.seed(seed);
		await seed;
		await Promise.resolve();
		expect(state.status).toBe('failed');
		expect(state.cards).toHaveLength(0);
		await state.retry();
		expect(urls).toEqual(['/api/factory/backlog']);
		expect(state.status).toBe('ready');
	});

	it('a refresh that drops the selected label clears the filter; one that keeps it keeps it', async () => {
		const { fetch } = fakeFetch([
			ok([backlogIssuePlain, backlogUmbrellaIssue]),
			ok([backlogBlockedIssue])
		]);
		const state = new BacklogState(fetch);
		const seed = Promise.resolve(ok());
		state.seed(seed);
		await seed;
		await Promise.resolve();

		state.label = 'enhancement';
		await state.refresh();
		expect(state.label).toBe('enhancement');

		// The blocked issue has no labels: 'enhancement' is gone.
		await state.refresh();
		expect(state.status).toBe('ready');
		expect(state.label).toBeNull();
		expect(state.cards).toHaveLength(1);
	});

	it('a failed refresh keeps the filter on the stale issues', async () => {
		const { fetch } = fakeFetch([failed]);
		const state = new BacklogState(fetch);
		const seed = Promise.resolve(ok());
		state.seed(seed);
		await seed;
		await Promise.resolve();
		state.label = 'enhancement';
		await state.refresh();
		expect(state.status).toBe('failed');
		expect(state.label).toBe('enhancement');
	});

	it('an unreadable response is a failure, not a crash', async () => {
		const state = new BacklogState(async () => new Response('<html>', { status: 502 }));
		await state.refresh();
		expect(state.status).toBe('failed');
		expect(state.failure?.retryable).toBe(true);
	});
});
