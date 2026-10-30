<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn } from 'storybook/test';
	import TicketCard from './ticket-card.svelte';
	import { toBoard, type BoardCard } from '$lib/factory/board';
	import {
		ticketActiveInPlan,
		ticketActiveInWork,
		ticketDetailActiveInWork,
		ticketLongValues,
		ticketPaused,
		ticketUnknownStage,
		ticketWaitingForAgentQuestion
	} from '$lib/factory/fixtures';
	import type { components } from '$lib/factory/generated/factory-api';

	const cardOf = (
		ticket: components['schemas']['TicketSummary'],
		details: components['schemas']['TicketDetail'][] = []
	): BoardCard => {
		const board = toBoard({ tickets: [ticket], complete: true, agents: null, details });
		const card = board.lanes.flatMap((lane) => lane.cards)[0];
		if (!card) throw new Error(`${ticket.key} is not on the board`);
		return card;
	};

	const firstCard = (canvasElement: HTMLElement) =>
		canvasElement.querySelector<HTMLElement>('[data-slot="ticket-card"]')!;

	const { Story } = defineMeta({
		title: 'Components/Factory/TicketCard',
		component: TicketCard,
		args: { onselect: fn() },
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'One current execution, in three tiers: reference and title, status (a Signal Wait edge when it needs attention), then progress, time and tokens under a hairline. The whole card is a single selection button (aria-pressed). Token usage, not USD; usage the factory did not supply reads "Unavailable".'
				}
			}
		}
	});
</script>

<Story
	name="Work with tokens"
	args={{ card: cardOf(ticketActiveInWork, [ticketDetailActiveInWork]) }}
	play={async ({ canvasElement }) => {
		const card = firstCard(canvasElement);
		await expect(card).toHaveTextContent('2/5 approved');
		await expect(card).toHaveTextContent('In 120,500 · Out 38,200');
		await expect(card).not.toHaveTextContent('$');
		await expect(card).toHaveAttribute('aria-pressed', 'false');
	}}
/>

<Story
	name="Selected"
	args={{ card: cardOf(ticketActiveInWork, [ticketDetailActiveInWork]), selected: true }}
/>

<Story
	name="Tokens unavailable"
	args={{ card: cardOf(ticketActiveInWork) }}
	play={async ({ canvasElement }) => {
		const card = firstCard(canvasElement);
		await expect(card).toHaveTextContent('Unavailable');
		await expect(card).not.toHaveTextContent('$');
		await expect(card).not.toHaveTextContent('In 0');
	}}
/>

<Story
	name="Planning tasks"
	args={{ card: cardOf(ticketActiveInPlan) }}
	play={async ({ canvasElement }) => {
		const card = firstCard(canvasElement);
		await expect(card).toHaveTextContent('Planning tasks');
		await expect(card).not.toHaveTextContent('0/0');
	}}
/>

<Story name="Paused in Work" args={{ card: cardOf(ticketPaused) }} />

<Story
	name="Needs attention"
	args={{ card: cardOf(ticketWaitingForAgentQuestion) }}
	play={async ({ canvasElement }) => {
		const card = firstCard(canvasElement);
		await expect(card).toHaveAttribute('data-needs-attention', 'true');
		await expect(card).toHaveTextContent('Needs attention');
	}}
/>

<Story
	name="Long title"
	args={{ card: cardOf(ticketLongValues) }}
	play={async ({ canvasElement }) => {
		const title = firstCard(canvasElement).querySelector('[data-slot="ticket-title"]');
		await expect(title).toHaveAttribute('title', ticketLongValues.title);
	}}
/>

<Story name="Unknown stage" args={{ card: cardOf(ticketUnknownStage), showStage: true }} />
