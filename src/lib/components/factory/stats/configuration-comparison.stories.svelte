<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import ConfigurationComparison from './configuration-comparison.svelte';
	import { failedPanel, loadingPanel, readyPanel } from './panel-state';
	import {
		configurations,
		emptyConfigurations,
		mixedConfigurations,
		panelFailure
	} from './stats-story-cohorts';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const rows = (pane: HTMLElement) =>
		[...pane.querySelectorAll('tbody tr[data-configuration]')] as HTMLElement[];
	const cell = (row: HTMLElement, column: string) =>
		row.querySelector(`[data-column="${column}"]`) as HTMLElement;

	const { Story } = defineMeta({
		title: 'Components/Factory/Stats/ConfigurationComparison',
		component: ConfigurationComparison,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'One row per factory configuration (stage=setup pairs) with its execution sample, merged, merge rate, median factory time, median cost, median external review rounds and interventions. Fewer than 5 executions is marked small sample. Rows are not ranked.'
				}
			}
		}
	});
</script>

<Story
	name="Complete"
	args={{ state: readyPanel(mixedConfigurations) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const [large, opus, gpt] = rows(pane);
		await expect(rows(pane)).toHaveLength(3);
		await expect(large!.querySelector('th')).toHaveTextContent('plan=claude-opus-5-5:high');
		await expect(large!.querySelector('th')).toHaveTextContent('QA=gpt-6:medium');
		await expect(cell(large!, 'tickets')).toHaveTextContent('12');
		await expect(large).not.toHaveAttribute('data-small-sample');
		await expect(cell(large!, 'merge-rate')).toHaveTextContent('90%');
		await expect(cell(large!, 'factory-time')).toHaveTextContent('2 h 30 m');
		await expect(cell(large!, 'cost')).toHaveTextContent('$3.40');
		await expect(cell(large!, 'review-rounds')).toHaveTextContent('1.5');
		await expect(cell(large!, 'interventions')).toHaveTextContent('7');
		await expect(cell(opus!, 'tickets')).toHaveTextContent('4 small sample');
		await expect(cell(gpt!, 'tickets')).toHaveTextContent('1 small sample');
		await expect(pane.querySelector('[data-testid="configuration-versions"]')).toHaveTextContent(
			'Factory versions in this cohort: 0.14.0, 0.15.1'
		);
		await expect(pane).not.toHaveTextContent(/best|winner|rank/i);
	}}
/>

<Story
	name="Small sample and null merge rate"
	args={{ state: readyPanel(configurations) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const [opus, gpt] = rows(pane);
		await expect(opus).toHaveAttribute('data-small-sample', 'true');
		await expect(cell(opus!, 'merge-rate')).toHaveTextContent('75%');
		await expect(gpt).toHaveAttribute('data-small-sample', 'true');
		await expect(cell(gpt!, 'tickets')).toHaveTextContent('1 small sample');
		for (const column of ['merge-rate', 'factory-time', 'cost', 'review-rounds']) {
			await expect(cell(gpt!, column)).toHaveTextContent('— Unavailable');
			await expect(cell(gpt!, column)).not.toHaveTextContent('0');
		}
		await expect(cell(gpt!, 'merged')).toHaveTextContent('0');
		await expect(cell(gpt!, 'interventions')).toHaveTextContent('0');
	}}
/>

<Story
	name="Empty window"
	args={{ state: readyPanel(emptyConfigurations) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="configurations-empty"]')).toHaveTextContent(
			'No executions in this cohort'
		);
		await expect(pane.querySelector('table')).toBeNull();
	}}
/>

<Story
	name="Loading"
	args={{ state: loadingPanel }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="configuration-comparison"]')!;
		await expect(panel).toHaveAttribute('aria-busy', 'true');
		await expect(panel.querySelector('[data-slot="stats-skeleton"]')).not.toBeNull();
	}}
/>

<Story
	name="Error"
	args={{ state: failedPanel({ ...panelFailure, retryable: false }) }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="configuration-comparison"]')!;
		await expect(panel.querySelector('[data-testid="panel-error-title"]')).toHaveTextContent(
			'Stats unavailable'
		);
		await expect(panel.querySelector('table')).toBeNull();
		await expect(panel.querySelector('button')).toBeNull();
	}}
/>
