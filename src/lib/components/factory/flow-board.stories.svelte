<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import FlowBoard from './flow-board.svelte';
	import { toBoard } from '$lib/factory/board';
	import {
		agentList,
		ticketActiveInPlan,
		ticketActiveInQa,
		ticketActiveInWork,
		ticketDetailActiveInQa,
		ticketDetailActiveInWork,
		ticketDetailQueued,
		ticketLongValues,
		ticketPaused,
		ticketReadyForHandoff,
		ticketSummaries,
		ticketUnknownStage,
		ticketWaitingForAgentQuestion
	} from '$lib/factory/fixtures';
	import type { components } from '$lib/factory/generated/factory-api';

	type Schemas = components['schemas'];

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	const ticketPreparingHandoff = {
		...ticketReadyForHandoff,
		id: 'tkt_30',
		key: 'dpaez-factory-dashboard-15-6b7c8d9e',
		displayRef: 'dpaez/factory-dashboard#15',
		title: 'Ticket detail page',
		status: 'active',
		needsUser: false
	} satisfies Schemas['TicketSummary'];

	const allLanes = toBoard({
		tickets: [...ticketSummaries, ticketPreparingHandoff, ticketUnknownStage],
		complete: true,
		agents: agentList,
		details: [ticketDetailActiveInWork, ticketDetailActiveInQa, ticketDetailQueued]
	}).lanes;

	const someEmpty = toBoard({
		tickets: [ticketActiveInPlan, ticketPaused],
		complete: true,
		agents: agentList,
		details: []
	}).lanes;

	const allEmpty = toBoard({ tickets: [], complete: true, agents: agentList, details: [] }).lanes;

	const qaActive = toBoard({
		tickets: [ticketActiveInQa, ticketActiveInWork],
		complete: true,
		agents: agentList,
		details: [ticketDetailActiveInQa, ticketDetailActiveInWork]
	}).lanes;

	const longTitles = toBoard({
		tickets: [ticketLongValues, ticketActiveInWork, ticketWaitingForAgentQuestion],
		complete: true,
		agents: agentList,
		details: [ticketDetailActiveInWork]
	}).lanes;

	const unknownStage = toBoard({
		tickets: [ticketActiveInWork, ticketUnknownStage],
		complete: true,
		agents: agentList,
		details: []
	}).lanes;

	const handoff = toBoard({
		tickets: [ticketReadyForHandoff, ticketPreparingHandoff],
		complete: true,
		agents: agentList,
		details: []
	}).lanes;

	const LANES = ['plan', 'work', 'qa', 'review', 'handoff'] as const;
	const laneOf = (pane: HTMLElement, id: string) =>
		pane.querySelector<HTMLElement>(`[data-lane="${id}"]`)!;
	const isMono = (element: Element) => {
		const style = getComputedStyle(element);
		return /mono/i.test(style.fontFamily) && style.fontVariantNumeric.includes('tabular-nums');
	};
	/** The innermost elements whose own text matches. */
	const leavesMatching = (root: Element, pattern: RegExp) =>
		[...root.querySelectorAll('*')].filter(
			(element) =>
				pattern.test(element.textContent?.trim() ?? '') &&
				![...element.children].some((child) => pattern.test(child.textContent?.trim() ?? ''))
		);

	const { Story } = defineMeta({
		title: 'Components/Factory/FlowBoard',
		component: FlowBoard,
		args: { onselect: fn() },
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'One row of lanes that fits the viewport: Backlog (when given, and foldable), Plan, Work, QA, Review, Handoff and, for unknown stages, Other. Each lane scrolls its own cards. Each card is one selection button; nothing is draggable. Lanes keep their heading when empty, loading or failed.'
				}
			}
		}
	});
</script>

<script lang="ts">
	// Shared by both theme panes, so one click changes both boards.
	let changing = $state<Schemas['TicketSummary'][]>([ticketActiveInPlan, ticketPaused]);
	const changingLanes = $derived(
		toBoard({ tickets: changing, complete: true, agents: agentList, details: [] }).lanes
	);
	const moveToReview = () =>
		(changing = [ticketActiveInPlan, { ...ticketPaused, stage: 'review' }]);
</script>

<Story
	name="Every lane populated"
	args={{ lanes: allLanes, selectedKey: ticketActiveInWork.key }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const canvas = within(pane);
		const cards = pane.querySelectorAll<HTMLElement>('[data-slot="ticket-card"]');
		await expect(cards.length).toBeGreaterThan(0);
		await expect(canvasElement.querySelector('[draggable="true"]')).toBeNull();
		for (const card of cards) {
			await expect(card.tagName).toBe('BUTTON');
			await expect(card.querySelector('a, button, [draggable]')).toBeNull();
		}

		// Tab reaches each card of the first pane, in order.
		(document.activeElement as HTMLElement | null)?.blur();
		for (const card of cards) {
			await userEvent.tab();
			await expect(card).toHaveFocus();
		}

		const work = canvas.getByRole('button', { name: /Switch routes to the factory API/ });
		await expect(work).toHaveAttribute('aria-pressed', 'true');

		const plan = canvas.getByRole('button', { name: /Storybook and component fixtures/ });
		plan.focus();
		await userEvent.keyboard('{Enter}');
		await expect(args.onselect).toHaveBeenLastCalledWith(ticketActiveInPlan.key);
		const paused = canvas.getByRole('button', { name: new RegExp(ticketPaused.title) });
		paused.focus();
		await userEvent.keyboard(' ');
		await expect(args.onselect).toHaveBeenLastCalledWith(ticketPaused.key);

		const handoffLane = pane.querySelector<HTMLElement>('[data-lane="handoff"]')!;
		await expect(handoffLane).toHaveTextContent('Preparing handoff');
		await expect(handoffLane).toHaveTextContent('Ready for handoff');
		await expect(pane.querySelector('[data-lane="other"]')).toHaveTextContent('stage triage');

		// Tokens or Unavailable, never USD, a dash or 0/0; a plan card without tasks says so.
		for (const card of cards) {
			const text = card.textContent ?? '';
			await expect(text).toMatch(/In [\d,]+ · Out [\d,]+|Unavailable/);
			await expect(text).not.toMatch(/\$|—|\b0\/0\b/);
		}
		await expect(laneOf(pane, 'plan')).toHaveTextContent('Planning tasks');

		// DESIGN.md, in both panes: square, shadowless cards; Beacon Yellow only on the progress
		// fill; refs, times, tokens, progress and lane counts in tabular mono.
		for (const each of canvasElement.querySelectorAll<HTMLElement>('[data-theme-pane]')) {
			const fill = each.querySelector('[data-slot="progress-indicator"]')!;
			const beacon = getComputedStyle(fill).backgroundColor;
			for (const card of each.querySelectorAll<HTMLElement>('[data-slot="ticket-card"]')) {
				const style = getComputedStyle(card);
				await expect(style.borderRadius).toBe('0px');
				// Rings are 0-offset, 0-blur box-shadows; anything else would be elevation.
				for (const layer of style.boxShadow === 'none' ? [] : style.boxShadow.split(/,(?![^(]*\))/))
					await expect(layer).toMatch(/0px 0px 0px/);
				for (const element of [card, ...card.querySelectorAll<HTMLElement>('*')]) {
					if (element.dataset.slot === 'progress-indicator') continue;
					const own = getComputedStyle(element);
					await expect(own.backgroundColor).not.toBe(beacon);
					await expect(own.color).not.toBe(beacon);
				}
				for (const pattern of [
					/\/[\w-]+#\d+$/,
					/^Updated /,
					/^In [\d,]+ · Out|^Unavailable$/,
					/^\d+\/\d+ approved$/
				])
					for (const leaf of leavesMatching(card, pattern)) await expect(isMono(leaf)).toBe(true);
			}
			for (const count of each.querySelectorAll('[data-slot="lane-count"]')) {
				await expect(isMono(count)).toBe(true);
				await expect(getComputedStyle(count).backgroundColor).not.toBe(beacon);
			}
		}
	}}
/>

<Story
	name="Some lanes empty"
	args={{ lanes: someEmpty }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-lane="work"]')).toHaveTextContent('Paused');
		await expect(pane.querySelector('[data-lane="review"]')).toHaveTextContent(
			'No tickets in Review'
		);
		await expect(pane.querySelector('[data-lane="plan"]')).toHaveTextContent('Planning tasks');
		await expect(pane.querySelector('[data-lane="plan"]')).toHaveTextContent('Unavailable');
		await expect(pane.querySelector('[data-lane="qa"]')).toHaveTextContent('optional');
	}}
/>

<Story
	name="All lanes empty"
	args={{ lanes: allEmpty }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		for (const id of LANES) {
			await expect(laneOf(pane, id)).toHaveTextContent(/No tickets in \S+/);
		}
		await expect(pane.querySelector('[data-slot="ticket-card"]')).toBeNull();
	}}
/>

<Story
	name="Loading"
	args={{ lanes: [], loading: true }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		for (const id of LANES) {
			await expect(laneOf(pane, id)).toHaveTextContent(/Loading \S+ lane/);
		}
	}}
/>

<Story
	name="Error"
	args={{ lanes: [], error: 'The factory API did not answer.' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const alerts = within(pane).getAllByRole('alert');
		await expect(alerts).toHaveLength(5);
		for (const alert of alerts) await expect(alert).toHaveTextContent('did not answer');
	}}
/>

<Story
	name="Ticket in QA"
	args={{ lanes: qaActive }}
	play={async ({ canvasElement }) => {
		const qa = firstPane(canvasElement).querySelector('[data-lane="qa"]')!;
		await expect(qa).toHaveTextContent(ticketActiveInQa.title);
		await expect(qa.querySelector('h2')).not.toHaveTextContent('optional');
	}}
/>

<Story
	name="Paused ticket in Work"
	args={{ lanes: someEmpty, selectedKey: ticketPaused.key }}
	play={async ({ canvasElement }) => {
		const work = laneOf(firstPane(canvasElement), 'work');
		await expect(work).toHaveTextContent('Paused');
		const pressed = work.querySelectorAll('[aria-pressed="true"]');
		await expect(pressed).toHaveLength(1);
		await expect(pressed[0]).toHaveAttribute('data-ticket-key', ticketPaused.key);
	}}
/>

<Story
	name="Long titles"
	args={{ lanes: longTitles }}
	play={async ({ canvasElement }) => {
		// The long title wraps onto several lines and stays inside its card and lane.
		const pane = firstPane(canvasElement);
		const card = pane.querySelector<HTMLElement>(
			`[data-ticket-key="${CSS.escape(ticketLongValues.key)}"]`
		)!;
		const title = within(card).getByText(ticketLongValues.title);
		const lineHeight = parseFloat(getComputedStyle(title).lineHeight);
		await expect(Math.round(title.getBoundingClientRect().height / lineHeight)).toBeGreaterThan(1);
		await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
		const lane = card.closest('[data-lane]')!.getBoundingClientRect();
		await expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(lane.right + 1);
	}}
/>

<Story
	name="Unknown stage in Other"
	args={{ lanes: unknownStage }}
	play={async ({ canvasElement }) => {
		const other = laneOf(firstPane(canvasElement), 'other');
		await expect(other.querySelectorAll('[data-slot="ticket-card"]')).toHaveLength(1);
		await expect(other).toHaveTextContent('stage triage');
	}}
/>

<Story
	name="Preparing and ready for handoff"
	args={{ lanes: handoff }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const cards = [...laneOf(pane, 'handoff').querySelectorAll('[data-slot="ticket-card"]')];
		await expect(cards).toHaveLength(2);
		await expect(cards.filter((c) => /Preparing handoff/.test(c.textContent ?? ''))).toHaveLength(
			1
		);
		await expect(cards.filter((c) => /Ready for handoff/.test(c.textContent ?? ''))).toHaveLength(
			1
		);
		// No QA activity on this board: the QA heading says optional.
		await expect(laneOf(pane, 'qa').querySelector('h2')).toHaveTextContent('optional');
	}}
/>

<!-- DESIGN.md: a lane count flashes when its lane gains a card, never on first render, and
     the other lanes do not flash. (Reduced motion: count-flash.svelte.test.ts.) -->
<Story
	name="Lane count change"
	asChild
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const count = (id: string) => laneOf(pane, id).querySelector('[data-slot="lane-count"]')!;
		for (const id of LANES) await expect(count(id)).not.toHaveAttribute('data-flash');
		await userEvent.click(within(pane).getByRole('button', { name: 'Move a ticket to Review' }));
		await waitFor(() => expect(count('review')).toHaveAttribute('data-flash', 'on'));
		await expect(count('review')).toHaveTextContent('1');
		for (const id of ['plan', 'qa', 'handoff']) {
			await expect(count(id)).not.toHaveAttribute('data-flash');
		}
		await waitFor(() => expect(count('review')).not.toHaveAttribute('data-flash'));
	}}
>
	<div class="flex flex-col items-start gap-3">
		<FlowBoard lanes={changingLanes} />
		<button
			type="button"
			class="bg-muted px-2 py-1 text-xs text-foreground ring-1 ring-foreground/10"
			onclick={moveToReview}>Move a ticket to Review</button
		>
	</div>
</Story>
