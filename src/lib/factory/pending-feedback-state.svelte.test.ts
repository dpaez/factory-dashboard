import { describe, expect, it } from 'vitest';

import { pendingFeedback, pendingFeedbackMany, pendingFeedbackNone } from './fixtures/feedback';
import type { PendingFeedbackResult } from './feedback';
import { PendingFeedbackState } from './pending-feedback-state.svelte';

const KEY = 'dpaez-factory-dashboard-14-1e2f3a4b';
const ok = (value: typeof pendingFeedback = pendingFeedback): PendingFeedbackResult => ({
	ok: true,
	...value
});
const failed: PendingFeedbackResult = {
	ok: false,
	failure: {
		type: 'code_host_unavailable',
		title: 'Code host unavailable',
		detail: 'gh: HTTP 502',
		retryable: true
	}
};

/** A fetch that answers queued results in order and records the URLs. */
function fakeFetch(results: PendingFeedbackResult[]) {
	const urls: string[] = [];
	const fetch = async (input: string) => {
		urls.push(input);
		const next = results.shift()!;
		return new Response(JSON.stringify(next), { status: next.ok ? 200 : 502 });
	};
	return { fetch, urls };
}

/** A fetch whose answers resolve only when released, to interleave reads. */
function gatedFetch() {
	const pending: { url: string; release: (result: PendingFeedbackResult) => void }[] = [];
	const fetch = (input: string) =>
		new Promise<Response>((resolve) => {
			pending.push({
				url: input,
				release: (result) =>
					resolve(new Response(JSON.stringify(result), { status: result.ok ? 200 : 502 }))
			});
		});
	return { fetch, pending };
}

const refs = (value: typeof pendingFeedback) => value.candidates.map((c) => c.ref);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('PendingFeedbackState', () => {
	it('reads the ticket list and ticks every comment', async () => {
		const { fetch, urls } = fakeFetch([ok()]);
		const state = new PendingFeedbackState(fetch);
		expect(state.status).toBe('idle');
		const read = state.load(KEY);
		expect(state.status).toBe('loading');
		expect(state.reading).toBe(true);
		await read;
		expect(urls).toEqual([`/api/factory/tickets/${KEY}/feedback`]);
		expect(state.status).toBe('ready');
		expect(state.reading).toBe(false);
		expect(state.candidates).toHaveLength(3);
		expect(state.ticked).toEqual(refs(pendingFeedback));
	});

	it('loads once per ticket', async () => {
		const { fetch, urls } = fakeFetch([ok()]);
		const state = new PendingFeedbackState(fetch);
		await state.load(KEY);
		await state.load(KEY);
		expect(urls).toHaveLength(1);
	});

	it('keeps the ticks when a refresh lists the same comments', async () => {
		const { fetch, urls } = fakeFetch([ok(), ok()]);
		const state = new PendingFeedbackState(fetch);
		await state.load(KEY);
		state.ticked = [refs(pendingFeedback)[1]!];
		await state.refresh();
		expect(urls).toHaveLength(2);
		expect(state.ticked).toEqual([refs(pendingFeedback)[1]!]);
	});

	it('ticks every comment again when a read lists different ones', async () => {
		const { fetch } = fakeFetch([ok(), ok(pendingFeedbackMany), ok(pendingFeedbackNone)]);
		const state = new PendingFeedbackState(fetch);
		await state.load(KEY);
		state.ticked = [];
		await state.refresh();
		expect(state.ticked).toEqual(refs(pendingFeedbackMany));
		await state.refresh();
		expect(state.candidates).toEqual([]);
		expect(state.ticked).toEqual([]);
	});

	it('a failed read keeps the list and ticks; Retry reads again', async () => {
		const { fetch, urls } = fakeFetch([ok(), failed, ok()]);
		const state = new PendingFeedbackState(fetch);
		await state.load(KEY);
		state.ticked = [refs(pendingFeedback)[0]!];
		await state.refresh();
		expect(state.status).toBe('failed');
		expect(state.failure).toEqual(failed.ok ? null : failed.failure);
		expect(state.candidates).toHaveLength(3);
		await state.refresh();
		expect(urls).toHaveLength(3);
		expect(state.status).toBe('ready');
		expect(state.failure).toBeNull();
		expect(state.ticked).toEqual([refs(pendingFeedback)[0]!]);
	});

	it('a failed first read, then a good one, ticks every comment', async () => {
		const { fetch } = fakeFetch([failed, ok()]);
		const state = new PendingFeedbackState(fetch);
		await state.load(KEY);
		expect(state.status).toBe('failed');
		expect(state.candidates).toEqual([]);
		await state.refresh();
		expect(state.ticked).toEqual(refs(pendingFeedback));
	});

	it('an unreadable answer is a failure with no upstream detail', async () => {
		const state = new PendingFeedbackState(async () => new Response('<html>', { status: 500 }));
		await state.load(KEY);
		expect(state.status).toBe('failed');
		expect(state.failure?.type).toBe('network_error');
		const thrown = new PendingFeedbackState(async () => {
			throw new TypeError('fetch failed');
		});
		await thrown.load(KEY);
		expect(thrown.status).toBe('failed');
	});

	it('ignores a stale answer', async () => {
		const { fetch, pending } = gatedFetch();
		const state = new PendingFeedbackState(fetch);
		const first = state.load(KEY);
		const second = state.refresh();
		pending[1]!.release(ok(pendingFeedbackMany));
		await second;
		pending[0]!.release(ok());
		await first;
		await settle();
		expect(state.candidates).toHaveLength(30);
		expect(state.ticked).toEqual(refs(pendingFeedbackMany));
	});

	it('clear forgets the list and drops a read in flight', async () => {
		const { fetch, pending } = gatedFetch();
		const state = new PendingFeedbackState(fetch);
		const read = state.load(KEY);
		state.clear();
		pending[0]!.release(ok());
		await read;
		expect(state.key).toBeNull();
		expect(state.status).toBe('idle');
		expect(state.candidates).toEqual([]);
		expect(state.reading).toBe(false);
		await state.refresh();
		expect(pending).toHaveLength(1);
	});

	it('another ticket starts over', async () => {
		const { fetch, urls } = fakeFetch([ok(), ok(pendingFeedbackMany)]);
		const state = new PendingFeedbackState(fetch);
		await state.load(KEY);
		state.ticked = [];
		const other = state.load('other-ticket-12345678');
		expect(state.candidates).toEqual([]);
		expect(state.status).toBe('loading');
		await other;
		expect(urls[1]).toBe('/api/factory/tickets/other-ticket-12345678/feedback');
		expect(state.ticked).toEqual(refs(pendingFeedbackMany));
	});
});
