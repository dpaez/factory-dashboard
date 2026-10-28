<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import AttentionStrip from './attention-strip.svelte';
	import { toAttention } from '$lib/factory/attention';
	import {
		ticketDetailAgentQuestion,
		ticketDetailFailedWithQuestion,
		ticketDetailManualApproval,
		ticketDetailPolicyLimit,
		ticketFailed,
		ticketLongValues,
		ticketPaused,
		ticketReadyForHandoff,
		ticketResumeFailed,
		ticketWaitingForAgentQuestion,
		ticketWaitingForManualApproval,
		ticketWaitingForPolicyLimit
	} from '$lib/factory/fixtures';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const groupsOf = (pane: HTMLElement) =>
		[...pane.querySelectorAll<HTMLElement>('[data-slot="attention-group"]')].map((group) =>
			group.textContent?.replace(/\s+/g, ' ').trim()
		);

	/** A one-reason story: one ticket, one group, and Open next. */
	const oneReason =
		(label: string) =>
		async ({ canvasElement }: { canvasElement: HTMLElement }) => {
			const pane = firstPane(canvasElement);
			await expect(pane.querySelector('[data-slot="attention-headline"]')).toHaveTextContent(
				'1 ticket needs attention'
			);
			await expect(groupsOf(pane)).toEqual([`${label} 1 ticket`]);
			await expect(pane.querySelector('[data-slot="attention-open-next"]')).toBeVisible();
		};

	const details = [ticketDetailAgentQuestion, ticketDetailPolicyLimit, ticketDetailManualApproval];
	const only = (ticket: Parameters<typeof toAttention>[0]['tickets'][number]) =>
		toAttention({ tickets: [ticket], complete: true, details });

	const mixed = toAttention({
		tickets: [
			ticketReadyForHandoff,
			ticketWaitingForAgentQuestion,
			ticketWaitingForPolicyLimit,
			ticketWaitingForManualApproval,
			ticketPaused,
			ticketFailed,
			ticketResumeFailed
		],
		complete: true,
		details
	});
	const twoReasons = toAttention({
		tickets: [ticketFailed, ticketPaused],
		complete: true,
		details: [ticketDetailFailedWithQuestion]
	});
	const partial = toAttention({
		tickets: [ticketWaitingForAgentQuestion, ticketPaused, ticketReadyForHandoff],
		complete: false,
		details
	});
	const long = toAttention({
		tickets: [ticketLongValues, ticketReadyForHandoff],
		complete: true,
		details
	});

	const { Story } = defineMeta({
		title: 'Components/Factory/AttentionStrip',
		component: AttentionStrip,
		args: { onselect: fn(), selectedKey: null },
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'How many tickets need attention (distinct tickets), grouped by reason, and Open next. Each press selects the next ticket in priority order (decisions, waiting, paused and failed first, then handoffs; oldest first) and wraps. The button names its target before the press. New data never moves the selection.'
				}
			}
		}
	});
</script>

<Story
	name="Question"
	args={{ attention: only(ticketWaitingForAgentQuestion) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="attention-headline"]')).toHaveTextContent(
			'1 ticket needs attention'
		);
		await expect(groupsOf(pane)).toEqual(['Question 1 ticket']);
		await expect(
			within(pane).getByRole('button', { name: /Open next dpaez\/factory-dashboard#23/ })
		).toBeVisible();
	}}
/>

<Story
	name="Limit"
	args={{ attention: only(ticketWaitingForPolicyLimit) }}
	play={oneReason('Limit')}
/>

<Story
	name="Approval"
	args={{ attention: only(ticketWaitingForManualApproval) }}
	play={oneReason('Approval')}
/>

<Story
	name="Waiting for a reply"
	args={{ attention: toAttention({ tickets: [ticketWaitingForAgentQuestion], complete: true }) }}
	play={oneReason('Waiting for a reply')}
/>

<Story name="Paused" args={{ attention: only(ticketPaused) }} play={oneReason('Paused')} />

<Story name="Failed" args={{ attention: only(ticketFailed) }} play={oneReason('Failed')} />

<Story
	name="Ready for handoff"
	args={{ attention: only(ticketReadyForHandoff) }}
	play={oneReason('Ready for handoff')}
/>

<Story
	name="Mixed"
	args={{ attention: mixed }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="attention-headline"]')).toHaveTextContent(
			'7 tickets need attention'
		);
		await expect(groupsOf(pane)).toEqual([
			'Question 1 ticket',
			'Limit 1 ticket',
			'Approval 1 ticket',
			'Paused 1 ticket',
			'Failed 2 tickets',
			'Ready for handoff 1 ticket'
		]);
		// Beacon Yellow only on Open next.
		await expect(pane.querySelectorAll('.bg-primary')).toHaveLength(1);
		await expect(pane).not.toHaveTextContent(/needs user|blocked/i);

		// Repeated presses walk the queue in priority order, then wrap.
		const button = pane.querySelector<HTMLElement>('[data-slot="attention-open-next"]')!;
		const keys = mixed.queue.map((item) => item.key);
		await expect(keys.at(-1)).toBe(ticketReadyForHandoff.key);
		for (const [index, key] of keys.entries()) {
			await expect(button).toHaveAttribute('data-target-key', key);
			// The button names its destination before the press.
			await expect(button).toHaveAccessibleName(`Open next ${mixed.queue[index]!.displayRef}`);
			await userEvent.click(button);
			await expect(args.onselect).toHaveBeenNthCalledWith(index + 1, key);
		}
		await expect(button).toHaveAttribute('data-target-key', keys[0]);
		await userEvent.click(button);
		await expect(args.onselect).toHaveBeenLastCalledWith(keys[0]);

		// DESIGN.md, in both panes: Open next is the only Beacon Yellow surface; it is square,
		// casts no shadow at rest, and shows a focus ring from the keyboard.
		for (const each of canvasElement.querySelectorAll<HTMLElement>('[data-theme-pane]')) {
			const strip = each.querySelector<HTMLElement>('[data-slot="attention-strip"]')!;
			const open = strip.querySelector<HTMLElement>('[data-slot="attention-open-next"]')!;
			open.blur();
			await waitFor(() =>
				expect(
					getComputedStyle(open)
						.boxShadow.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?/g, '')
						.trim()
				).toMatch(/^(none)?$/)
			);
			const beacon = getComputedStyle(open).backgroundColor;
			const beaconUsers = [strip, ...strip.querySelectorAll<HTMLElement>('*')].filter(
				(element) => getComputedStyle(element).backgroundColor === beacon
			);
			await expect(beaconUsers).toEqual([open]);
			await expect(getComputedStyle(open).borderTopLeftRadius).toBe('0px');
			await expect(strip.closest('.not-prose')).not.toBeNull();
		}
		(document.activeElement as HTMLElement | null)?.blur();
		await userEvent.tab();
		await expect(button).toHaveFocus();
		const focused = getComputedStyle(button);
		await expect(
			(focused.outlineStyle !== 'none' && focused.outlineWidth !== '0px') ||
				focused.boxShadow !== 'none'
		).toBe(true);
	}}
/>

<Story
	name="Two reasons on one ticket"
	args={{ attention: twoReasons }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="attention-headline"]')).toHaveTextContent(
			'2 tickets need attention'
		);
		await expect(groupsOf(pane)).toEqual([
			'Question 1 ticket',
			'Paused 1 ticket',
			'Failed 1 ticket'
		]);
		await expect(canvasElement).not.toHaveTextContent(/needs user|blocked/i);
	}}
/>

<Story
	name="Partial headline"
	args={{ attention: partial }}
	play={async ({ canvasElement }) => {
		const headline = firstPane(canvasElement).querySelector('[data-slot="attention-headline"]');
		await expect(headline).toHaveTextContent(/at least 3/);
		await expect(headline).toHaveTextContent('(partial)');
		await expect(canvasElement).not.toHaveTextContent(/needs user|blocked/i);
	}}
/>

<Story
	name="Long titles and references"
	args={{ attention: long }}
	play={async ({ canvasElement }) => {
		// The long reference stays inside the strip.
		const pane = firstPane(canvasElement);
		const strip = pane.querySelector<HTMLElement>('[data-slot="attention-strip"]')!;
		await expect(pane.querySelector('[data-slot="attention-open-next"]')).toBeVisible();
		await expect(strip.scrollWidth).toBeLessThanOrEqual(strip.clientWidth + 1);
	}}
/>

<Story
	name="Empty"
	args={{ attention: toAttention({ tickets: [], complete: true }) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane).toHaveTextContent('No attention needed.');
		await expect(within(pane).queryByRole('button')).toBeNull();
	}}
/>

<Story
	name="Loading"
	args={{ attention: null, loading: true }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[aria-busy="true"]')).not.toBeNull();
		await expect(within(pane).queryByRole('button')).toBeNull();
	}}
/>

<Story
	name="Error"
	args={{ attention: null, error: 'The factory API did not answer.' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const alert = within(pane).getByRole('alert');
		await expect(alert).toHaveTextContent('Attention unavailable. The factory API did not answer.');
		await expect(within(pane).queryByRole('button')).toBeNull();
	}}
/>
