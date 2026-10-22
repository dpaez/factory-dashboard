<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import UsagePanel from './usage-panel.svelte';
	import { toRun } from '$lib/factory/adapters';
	import { runPage, runWrapupPrepared, ticketDetailActiveInWork } from '$lib/factory/fixtures';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	const runs = runPage.items.map(toRun);

	const { Story } = defineMeta({
		title: 'Components/Factory/UsagePanel',
		component: UsagePanel,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'One execution\'s usage: total cost, input, output, cache read, cache write and total tokens, then the per-run table. A missing figure reads "—" (Unavailable), never 0 or $0.00. The runs list says when it is partial.'
				}
			}
		}
	});
</script>

<Story
	name="Populated"
	args={{ execution: 1, usage: ticketDetailActiveInWork.usage, runs }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="usage-total"]')).toHaveTextContent(
			'Execution 1 total $3.42'
		);
		const tokens = pane.querySelector('[data-testid="usage-tokens"]')!;
		await expect(tokens).toHaveTextContent('120,500');
		await expect(tokens).toHaveTextContent('1,034,700');
		await expect(pane.querySelectorAll('[data-run]')).toHaveLength(runs.length);
		await expect(pane.querySelector('[data-testid="runs-partial"]')).toBeNull();
	}}
/>

<Story
	name="Null usage"
	args={{ execution: 2, usage: null, runs: [toRun(runWrapupPrepared)] }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane).not.toHaveTextContent('$0.00');
		await expect(pane.querySelector('[data-testid="usage-total"]')).toHaveTextContent(
			'Execution 2 total — (Unavailable)'
		);
		const values = [...pane.querySelectorAll('[data-testid="usage-tokens"] dd')];
		await expect(values).toHaveLength(5);
		for (const value of values) {
			await expect(value).toHaveTextContent('— Unavailable');
		}
		// A run with no usage shows "—" cost, never $0.00.
		await expect(pane.querySelector('[data-testid="run-cost"]')).toHaveTextContent('—');
	}}
/>

<Story
	name="Partial runs"
	args={{ execution: 1, usage: ticketDetailActiveInWork.usage, runs, runsComplete: false }}
	play={async ({ canvasElement }) => {
		await expect(
			firstPane(canvasElement).querySelector('[data-testid="runs-partial"]')
		).toHaveTextContent(`Showing the first ${runs.length} runs. The list is partial.`);
	}}
/>

<Story
	name="No runs"
	args={{ execution: 1, usage: ticketDetailActiveInWork.usage, runs: [] }}
	play={async ({ canvasElement }) => {
		await expect(firstPane(canvasElement)).toHaveTextContent('No runs yet.');
	}}
/>
