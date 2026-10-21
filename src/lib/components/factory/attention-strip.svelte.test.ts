import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

import { toAttention } from '$lib/factory/attention';
import {
	ticketDetailAgentQuestion,
	ticketDetailPolicyLimit,
	ticketFailed,
	ticketPaused,
	ticketReadyForHandoff,
	ticketWaitingForAgentQuestion,
	ticketWaitingForPolicyLimit
} from '$lib/factory/fixtures';

import AttentionStrip from './attention-strip.svelte';

type Ticket = Parameters<typeof toAttention>[0]['tickets'][number];
const modelOf = (tickets: Ticket[]) =>
	toAttention({
		tickets,
		complete: true,
		details: [ticketDetailAgentQuestion, ticketDetailPolicyLimit]
	});

const button = (container: HTMLElement) =>
	container.querySelector<HTMLButtonElement>('[data-slot="attention-open-next"]');

const tickets = [ticketReadyForHandoff, ticketWaitingForAgentQuestion, ticketPaused, ticketFailed];

describe('AttentionStrip', () => {
	it('advances through the queue in priority order on repeated presses, then wraps', async () => {
		const attention = modelOf(tickets);
		const keys = attention.queue.map((item) => item.key);
		expect(keys.at(-1)).toBe(ticketReadyForHandoff.key);
		const onselect = vi.fn();
		const screen = await render(AttentionStrip, { attention, onselect });

		for (const key of [...keys, keys[0]!]) {
			const target = attention.queue.find((item) => item.key === key)!;
			// The button names its destination before the press.
			expect(button(screen.container)).toHaveAccessibleName(`Open next ${target.displayRef}`);
			await userEvent.click(button(screen.container)!);
			expect(onselect).toHaveBeenLastCalledWith(key);
		}
		expect(onselect.mock.calls.map(([key]) => key)).toEqual([...keys, keys[0]]);
	});

	it('skips the current selection the parent passes in', async () => {
		const attention = modelOf(tickets);
		const [first, second] = attention.queue;
		const onselect = vi.fn();
		const screen = await render(AttentionStrip, { attention, selectedKey: first!.key, onselect });
		await userEvent.click(button(screen.container)!);
		expect(onselect).toHaveBeenCalledWith(second!.key);
	});

	it('never selects on new, reordered or removed items, and never targets a resolved one', async () => {
		const attention = modelOf(tickets);
		const [first, second] = attention.queue;
		const onselect = vi.fn();
		const screen = await render(AttentionStrip, { attention, onselect });

		await userEvent.click(button(screen.container)!);
		expect(onselect).toHaveBeenCalledTimes(1);
		expect(onselect).toHaveBeenLastCalledWith(first!.key);

		// New data: a new ticket arrives and the rest reorders (newer updatedAt).
		const reordered = modelOf([
			ticketWaitingForPolicyLimit,
			...tickets.map((ticket) =>
				ticket.key === first!.key ? { ...ticket, updatedAt: '2030-01-01T00:00:00Z' } : ticket
			)
		]);
		await screen.rerender({ attention: reordered, selectedKey: first!.key, onselect });
		expect(onselect).toHaveBeenCalledTimes(1);

		// The second item resolves and leaves the queue.
		const resolved = modelOf(
			[ticketWaitingForPolicyLimit, ...tickets].filter((ticket) => ticket.key !== second!.key)
		);
		await screen.rerender({ attention: resolved, selectedKey: first!.key, onselect });
		expect(onselect).toHaveBeenCalledTimes(1);
		expect(button(screen.container)).not.toHaveAttribute('data-target-key', second!.key);

		const pressed: string[] = [];
		for (let i = 0; i < resolved.queue.length * 2; i++) {
			await userEvent.click(button(screen.container)!);
			pressed.push(onselect.mock.lastCall![0] as string);
		}
		expect(pressed).not.toContain(second!.key);
		// The parent kept `first` selected, so presses cycle through everything else.
		expect(new Set(pressed)).toEqual(
			new Set(resolved.queue.map((item) => item.key).filter((key) => key !== first!.key))
		);
	});

	it('shows no button when nothing needs attention, while loading, or on error', async () => {
		const empty = await render(AttentionStrip, { attention: modelOf([]) });
		expect(empty.container).toHaveTextContent('No attention needed.');
		expect(empty.container.querySelector('button')).toBeNull();
		empty.unmount();

		const loading = await render(AttentionStrip, { attention: null, loading: true });
		expect(loading.container.querySelector('[aria-busy="true"]')).not.toBeNull();
		expect(loading.container.querySelector('button')).toBeNull();
		loading.unmount();

		const failed = await render(AttentionStrip, { attention: null, error: 'Timed out.' });
		expect(failed.container.querySelector('[role="alert"]')).toHaveTextContent(
			'Attention unavailable. Timed out.'
		);
		expect(failed.container.querySelector('button')).toBeNull();
	});
});
