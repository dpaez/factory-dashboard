<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import UsageList from './usage-list.svelte';
	import { toRun } from '$lib/factory/adapters';
	import { runPage, runPageFirstExecution, runWrapupPrepared } from '$lib/factory/fixtures';

	const { Story } = defineMeta({
		title: 'Components/UsageList',
		component: UsageList,
		parameters: {
			docs: {
				description: {
					component:
						'The runs of one execution with per-run usage and cost. A run without usage shows "—". Loading and error states: N/A: the page loads the data.'
				}
			}
		}
	});
</script>

<Story name="Runs across stages" args={{ runs: runPage.items.map(toRun) }} />

<Story
	name="Run without usage"
	args={{ runs: [toRun(runWrapupPrepared)] }}
	play={async ({ canvasElement }) => {
		const pane =
			(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
		// A run with no usage costs "—", never $0.00.
		await expect(pane.querySelector('[data-testid="run-cost"]')).toHaveTextContent('—');
		await expect(pane).not.toHaveTextContent('$0.00');
	}}
/>

<Story name="Past execution" args={{ runs: runPageFirstExecution.items.map(toRun) }} />

<Story name="No runs" args={{ runs: [] }} />
