<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
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

	const { Story } = defineMeta({
		title: 'Components/Factory/FlowBoard',
		component: FlowBoard,
		args: { onselect: fn() },
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Lanes Plan, Work, QA, Review, Handoff and, for unknown stages, Other. Each card is one selection button; nothing is draggable. Lanes keep their heading when empty, loading or failed.'
				}
			}
		}
	});
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

<Story name="All lanes empty" args={{ lanes: allEmpty }} />

<Story name="Loading" args={{ lanes: [], loading: true }} />

<Story
	name="Error"
	args={{ lanes: [], error: 'The factory API did not answer.' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getAllByRole('alert')).toHaveLength(5);
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

<Story name="Paused ticket in Work" args={{ lanes: someEmpty, selectedKey: ticketPaused.key }} />

<Story name="Long titles" args={{ lanes: longTitles }} />

<Story name="Unknown stage in Other" args={{ lanes: unknownStage }} />

<Story name="Preparing and ready for handoff" args={{ lanes: handoff }} />
