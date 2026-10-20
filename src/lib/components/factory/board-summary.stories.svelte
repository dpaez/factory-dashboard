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
						'Compact Flow board counts. A count that was not read reads "Unavailable"; a partial ticket list marks in progress as a lower bound.'
				}
			}
		}
	});
</script>

<Story
	name="Counts"
	args={{
		summary: { inProgress: 12, inProgressComplete: true, agentsRunning: 2, readyToStart: null }
	}}
	play={async ({ canvasElement }) => {
		await expect(canvasElement).toHaveTextContent('in progress');
		await expect(canvasElement).toHaveTextContent('agents running');
		await expect(canvasElement.querySelector('[data-summary="ready-to-start"]')).toHaveTextContent(
			'Unavailable'
		);
	}}
/>

<Story
	name="Agents unavailable"
	args={{
		summary: { inProgress: 3, inProgressComplete: true, agentsRunning: null, readyToStart: null }
	}}
/>

<Story
	name="Partial in progress"
	args={{
		summary: { inProgress: 50, inProgressComplete: false, agentsRunning: 4, readyToStart: null }
	}}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('[data-summary="in-progress"]')).toHaveTextContent(
			/at least 50/
		);
	}}
/>
