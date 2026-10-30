import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

import { toBoard } from '$lib/factory/board';
import {
	agentList,
	ticketActiveInWork,
	ticketPaused,
	ticketSummaries
} from '$lib/factory/fixtures';

import FlowBoard from './flow-board.svelte';

const lanesOf = (tickets: typeof ticketSummaries | (typeof ticketSummaries)[number][]) =>
	toBoard({ tickets: [...tickets], complete: true, agents: agentList, details: [] }).lanes;

const cardFor = (container: HTMLElement, key: string) =>
	container.querySelector<HTMLElement>(`[data-ticket-key="${CSS.escape(key)}"]`);

describe('FlowBoard', () => {
	it('lets Tab reach every card and Enter or Space select it; nothing is draggable', async () => {
		const onselect = vi.fn();
		const screen = await render(FlowBoard, { lanes: lanesOf(ticketSummaries), onselect });
		const cards = [...screen.container.querySelectorAll<HTMLElement>('[data-slot="ticket-card"]')];
		expect(cards.length).toBeGreaterThan(1);
		expect(screen.container.querySelector('[draggable="true"]')).toBeNull();

		// The test iframe starts without focus, so begin on the first card.
		// See more sits after a lane's cards. These tests do not load the
		// stylesheet, so `lg:hidden` does not take it out of the tab order.
		cards[0]!.focus();
		for (const card of cards.slice(1)) {
			await userEvent.tab();
			if (document.activeElement?.getAttribute('data-slot') === 'lane-more') {
				await userEvent.tab();
			}
			expect(document.activeElement).toBe(card);
		}

		cards[0]!.focus();
		await userEvent.keyboard('{Enter}');
		expect(onselect).toHaveBeenLastCalledWith(cards[0]!.dataset.ticketKey);
		cards[1]!.focus();
		await userEvent.keyboard(' ');
		expect(onselect).toHaveBeenLastCalledWith(cards[1]!.dataset.ticketKey);
	});

	it('keeps a ticket selected and focused when it moves from Work to Review', async () => {
		const key = ticketActiveInWork.key;
		const before = [ticketActiveInWork, ticketPaused];
		const screen = await render(FlowBoard, { lanes: lanesOf(before), selectedKey: key });

		const inWork = cardFor(screen.container, key)!;
		expect(inWork.closest('[data-lane]')).toHaveAttribute('data-lane', 'work');
		inWork.focus();
		expect(document.activeElement).toBe(inWork);

		await screen.rerender({
			lanes: lanesOf([{ ...ticketActiveInWork, stage: 'review' }, ticketPaused]),
			selectedKey: key
		});

		const inReview = cardFor(screen.container, key)!;
		expect(inReview).not.toBe(inWork);
		expect(inReview.closest('[data-lane]')).toHaveAttribute('data-lane', 'review');
		expect(inReview).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => document.activeElement).toBe(inReview);
	});

	it('does not take focus back when the user moved it elsewhere', async () => {
		const screen = await render(FlowBoard, { lanes: lanesOf([ticketActiveInWork, ticketPaused]) });
		cardFor(screen.container, ticketActiveInWork.key)!.focus();
		const other = cardFor(screen.container, ticketPaused.key)!;
		other.focus();

		await screen.rerender({
			lanes: lanesOf([{ ...ticketActiveInWork, stage: 'review' }, ticketPaused])
		});
		expect(document.activeElement).toBe(other);
	});
});
