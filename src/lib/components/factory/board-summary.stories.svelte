<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import BoardSummary from './board-summary.svelte';

	const { Story } = defineMeta({
		title: 'Components/Factory/BoardSummary',
		component: BoardSummary,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Compact Flow board counts. A count that was not read reads "Unavailable"; a partial ticket or backlog list marks its count as a lower bound. Ready to start counts backlog issues that are neither blocked nor umbrella.'
				}
			}
		}
	});
</script>

<Story
	name="Counts"
	args={{
		summary: {
			inProgress: 12,
			inProgressComplete: true,
			agentsRunning: 2,
			readyToStart: 5,
			readyToStartComplete: true
		}
	}}
	play={async ({ canvasElement }) => {
		await expect(canvasElement).toHaveTextContent('in progress');
		await expect(canvasElement).toHaveTextContent('agents running');
		const ready = canvasElement.querySelector('[data-summary="ready-to-start"]');
		await expect(ready).toHaveTextContent('5 ready to start');
		await expect(ready).not.toHaveTextContent('at least');
	}}
/>

<Story
	name="Ready to start unavailable"
	args={{
		summary: {
			inProgress: 12,
			inProgressComplete: true,
			agentsRunning: 2,
			readyToStart: null,
			readyToStartComplete: true
		}
	}}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('[data-summary="ready-to-start"]')).toHaveTextContent(
			'Unavailable'
		);
	}}
/>

<Story
	name="Partial ready to start"
	args={{
		summary: {
			inProgress: 12,
			inProgressComplete: true,
			agentsRunning: 2,
			readyToStart: 100,
			readyToStartComplete: false
		}
	}}
	play={async ({ canvasElement }) => {
		const ready = canvasElement.querySelector('[data-summary="ready-to-start"]');
		await expect(ready).toHaveTextContent(/at least 100/);
		await expect(ready).toHaveTextContent('(partial)');
	}}
/>

<Story
	name="Agents unavailable"
	args={{
		summary: {
			inProgress: 3,
			inProgressComplete: true,
			agentsRunning: null,
			readyToStart: null,
			readyToStartComplete: true
		}
	}}
/>

<Story
	name="Partial in progress"
	args={{
		summary: {
			inProgress: 50,
			inProgressComplete: false,
			agentsRunning: 4,
			readyToStart: null,
			readyToStartComplete: true
		}
	}}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('[data-summary="in-progress"]')).toHaveTextContent(
			/at least 50/
		);
	}}
/>
