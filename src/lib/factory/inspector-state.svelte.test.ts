import { describe, expect, it } from 'vitest';

import { toTicketDetail } from './adapters';
import {
	executionList,
	runPage,
	runPageFirstExecution,
	ticketDetailMultiExecution,
	ticketDetailMultiExecutionFirst
} from './fixtures';
import type { TicketResult } from './inspector';
import { TicketInspectorState } from './inspector-state.svelte';

const KEY = ticketDetailMultiExecution.key;
const current = toTicketDetail({
	detail: ticketDetailMultiExecution,
	executions: executionList,
	runs: runPage.items
});
const first = toTicketDetail({
	detail: ticketDetailMultiExecutionFirst,
	executions: executionList,
	runs: runPageFirstExecution.items
});
const ok = (detail = current): TicketResult => ({ ok: true, detail, runsComplete: true });
const failed = (type: string, title: string, retryable = true): TicketResult => ({
	ok: false,
	failure: { type, title, retryable }
});

/** A fetch whose answers the test releases by hand, recording the URLs. */
function heldFetch() {
	const urls: string[] = [];
	const pending: ((result: TicketResult) => void)[] = [];
	const fetch = (input: string) => {
		urls.push(input);
		return new Promise<Response>((resolve) => {
			pending.push((result) =>
				resolve(new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 }))
			);
		});
	};
	const settle = async () => {
		for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
	};
	return { fetch, urls, pending, settle };
}

describe('TicketInspectorState', () => {
	it('reads the selected key and execution through the endpoint', async () => {
		const { fetch, urls, pending, settle } = heldFetch();
		const state = new TicketInspectorState(fetch);
		const read = state.select(KEY, 1);
		expect(state.view).toEqual({ kind: 'loading', key: KEY });
		pending[0]!(ok(first));
		await read;
		expect(urls).toEqual([`/api/factory/tickets/${encodeURIComponent(KEY)}?execution=1`]);
		expect(state.view.kind).toBe('loaded');
		if (state.view.kind === 'loaded') expect(state.view.detail.header.execution).toBe(1);
		await settle();
	});

	it('drops a stale response when a newer selection answered first', async () => {
		const { fetch, pending } = heldFetch();
		const state = new TicketInspectorState(fetch);
		const older = state.select('older-key');
		const newer = state.select(KEY);
		pending[1]!(ok());
		await newer;
		pending[0]!(failed('internal_error', 'Older failure'));
		await older;
		expect(state.view.kind).toBe('loaded');
		if (state.view.kind === 'loaded') expect(state.view.detail.header.key).toBe(KEY);
	});

	it('does not refetch the same selection; a different execution reads again', async () => {
		const { fetch, urls, pending } = heldFetch();
		const state = new TicketInspectorState(fetch);
		const read = state.select(KEY);
		pending[0]!(ok());
		await read;
		await state.select(KEY);
		expect(urls).toHaveLength(1);
		const past = state.select(KEY, 1);
		pending[1]!(ok(first));
		await past;
		expect(urls).toHaveLength(2);
	});

	it('maps not found and failures; Retry repeats the last request', async () => {
		const { fetch, urls, pending } = heldFetch();
		const state = new TicketInspectorState(fetch);
		const missing = state.select('no-such-ticket', 9);
		pending[0]!(failed('ticket_not_found', 'No such ticket', false));
		await missing;
		expect(state.view).toEqual({ kind: 'not_found', key: 'no-such-ticket', execution: 9 });

		const broken = state.select(KEY);
		pending[1]!(failed('internal_error', 'Factory unavailable'));
		await broken;
		expect(state.view).toEqual({ kind: 'error', title: 'Factory unavailable', retryable: true });

		const retried = state.retry();
		expect(state.view.kind).toBe('loading');
		pending[2]!(ok());
		await retried;
		expect(urls.slice(1)).toEqual([
			`/api/factory/tickets/${encodeURIComponent(KEY)}`,
			`/api/factory/tickets/${encodeURIComponent(KEY)}`
		]);
		expect(state.view.kind).toBe('loaded');
	});

	it('an unreadable answer or a network failure is a retryable error', async () => {
		const state = new TicketInspectorState(async () => {
			throw new TypeError('offline');
		});
		await state.select(KEY);
		expect(state.view).toEqual({ kind: 'error', title: 'Ticket unreachable', retryable: true });
		const garbled = new TicketInspectorState(async () => new Response('<html>', { status: 502 }));
		await garbled.select(KEY);
		expect(garbled.view.kind).toBe('error');
	});

	it('keeps its loaded state when nothing but the lanes changes', async () => {
		// The state has no lanes input: only select() and clear() change it.
		const { fetch, urls, pending } = heldFetch();
		const state = new TicketInspectorState(fetch);
		const read = state.select(KEY);
		pending[0]!(ok());
		await read;
		const loaded = state.view;
		await state.select(KEY);
		expect(state.view).toBe(loaded);
		expect(urls).toHaveLength(1);
		state.clear();
		expect(state.view.kind).toBe('loading');
	});
});
