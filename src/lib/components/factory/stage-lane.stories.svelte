<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn } from 'storybook/test';
	import StageLane from './stage-lane.svelte';
	import { toBoard, type BoardLane } from '$lib/factory/board';
	import {
		agentList,
		ticketActiveInWork,
		ticketDetailActiveInWork,
		ticketPaused,
		ticketWaitingForPolicyLimit
	} from '$lib/factory/fixtures';

	const lanes = toBoard({
		tickets: [ticketActiveInWork, ticketPaused, ticketWaitingForPolicyLimit],
		complete: true,
		agents: agentList,
		details: [ticketDetailActiveInWork]
	}).lanes;
	const laneOf = (id: BoardLane['id']) => lanes.find((lane) => lane.id === id)!;
	// No task details read and no ticket in qa: nothing shows QA activity.
	const qaOptional = toBoard({
		tickets: [ticketPaused],
		complete: true,
		agents: agentList,
		details: []
	}).lanes.find((lane) => lane.id === 'qa')!;

	const { Story } = defineMeta({
		title: 'Components/Factory/StageLane',
		component: StageLane,
		args: { onselect: fn() },
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'One Flow board lane: label, mono card count (flashes on change) and the QA "optional" marker. Empty, loading and error states keep the heading.'
				}
			}
		}
	});
</script>

<Story name="Populated" args={{ lane: laneOf('work'), selectedKey: ticketPaused.key }} />

<Story
	name="Empty"
	args={{ lane: laneOf('review') }}
	play={async ({ canvasElement }) => {
		await expect(canvasElement).toHaveTextContent('No tickets in Review');
	}}
/>

<Story
	name="QA optional"
	args={{ lane: qaOptional }}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('h2')).toHaveTextContent('optional');
	}}
/>

<Story name="Loading" args={{ lane: laneOf('work'), loading: true }} />

<Story name="Error" args={{ lane: laneOf('work'), error: 'The factory API did not answer.' }} />
