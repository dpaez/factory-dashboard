import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

import { toTicketDetail } from '$lib/factory/adapters';
import { toBoard } from '$lib/factory/board';
import {
	agentList,
	ticketActiveInWork,
	ticketDetailActiveInWork,
	ticketPaused
} from '$lib/factory/fixtures';
import type { TicketResult } from '$lib/factory/inspector';

// The board page's URL is `/?ticket=<active ticket>`; the composition test only
// changes the lanes, never the URL.
const KEY = ticketActiveInWork.key;
const url = vi.hoisted(() => ({ current: new URL('http://localhost/') }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return url.current;
		}
	}
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));

import type { PageProps } from './$types';
import Page from './+page.svelte';

type Ticket = Parameters<typeof toBoard>[0]['tickets'][number];
const boardOf = (tickets: Ticket[]) =>
	toBoard({ tickets, complete: true, agents: agentList, details: [] });
const dataOf = (tickets: Ticket[]) => ({
	board: boardOf(tickets),
	attention: { ok: true as const, model: { headline: { count: 0 }, groups: [], queue: [] } },
	backlog: new Promise<never>(() => {})
});

const result: TicketResult = {
	ok: true,
	detail: toTicketDetail({
		detail: ticketDetailActiveInWork,
		executions: {
			items: [
				{
					createdAt: ticketDetailActiveInWork.createdAt,
					current: true,
					finishedAt: null,
					generation: ticketDetailActiveInWork.execution,
					stage: ticketDetailActiveInWork.stage,
					status: ticketDetailActiveInWork.status,
					statusReason: ticketDetailActiveInWork.statusReason
				}
			]
		},
		runs: []
	}),
	runsComplete: true
};

let urls: string[];
beforeEach(() => {
	url.current = new URL(`http://localhost/?ticket=${encodeURIComponent(KEY)}`);
	urls = [];
	vi.stubGlobal('fetch', async (input: string) => {
		urls.push(String(input));
		return new Response(JSON.stringify(result), { status: 200 });
	});
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the Flow board page', () => {
	it('keeps the open Inspector, with no refetch, when its card leaves the lanes', async () => {
		const screen = await render(Page, {
			data: dataOf([ticketActiveInWork, ticketPaused]),
			form: undefined,
			params: {}
		} as unknown as PageProps);
		const inspector = () =>
			screen.container.querySelector<HTMLElement>('[data-testid="ticket-inspector"]');
		const card = () =>
			screen.container.querySelector(`[data-slot="ticket-card"][data-ticket-key="${KEY}"]`);

		await expect.poll(() => inspector()?.dataset.state).toBe('loaded');
		expect(card()).not.toBeNull();
		expect(inspector()).toHaveTextContent(ticketDetailActiveInWork.title);
		expect(urls).toEqual([`/api/factory/tickets/${encodeURIComponent(KEY)}`]);

		// The ticket finishes: the next board no longer has its card.
		await screen.rerender({ data: dataOf([ticketPaused]) } as unknown as Partial<PageProps>);
		expect(card()).toBeNull();
		expect(inspector()?.dataset.state).toBe('loaded');
		expect(inspector()).toHaveAttribute('data-ticket-key', KEY);
		expect(inspector()).toHaveTextContent(ticketDetailActiveInWork.title);
		expect(urls).toHaveLength(1);
	});
});
