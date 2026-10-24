<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import StageTable from './stage-table.svelte';
	import { failedPanel, loadingPanel, readyPanel } from './panel-state';
	import {
		completeCohort,
		emptyCohort,
		panelFailure,
		partialCohort,
		qaDisabledCohort
	} from './stats-story-cohorts';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const stagesOf = (pane: HTMLElement) =>
		[...pane.querySelectorAll('tbody[data-stage]')].map((group) =>
			group.getAttribute('data-stage')
		);

	const { Story } = defineMeta({
		title: 'Components/Factory/Stats/StageTable',
		component: StageTable,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'One group per stage in pipeline order, one row per model setup. A stage with no runs says "No runs in this cohort"; an Unavailable ratio reads "—" with accessible "Unavailable" text, never 0.'
				}
			}
		}
	});
</script>

<Story
	name="Complete"
	args={{ state: readyPanel(completeCohort.stages) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(stagesOf(pane)).toEqual(['plan', 'work', 'qa', 'review', 'wrapup']);
		const work = pane.querySelector('tbody[data-stage="work"]')!;
		const setups = [...work.querySelectorAll('tr[data-setup]')];
		await expect(setups.map((row) => row.getAttribute('data-setup'))).toEqual([
			'claude-opus-5-5:high',
			'gpt-6:medium'
		]);
		const opus = setups[0]!;
		await expect(opus.querySelector('th')).toHaveTextContent('claude-opus-5-5 · high');
		await expect(opus.querySelector('[data-column="first-pass"]')).toHaveTextContent('75%');
		await expect(opus.querySelector('[data-column="returns"]')).toHaveTextContent(
			'QA 3 · review 6'
		);
		await expect(opus.querySelector('[data-column="tokens"]')).toHaveTextContent('150,000');
		await expect(opus.querySelector('[data-column="cost"]')).toHaveTextContent('$1.30');
		await expect(opus.querySelector('[data-column="infrastructure-lost"]')).toHaveTextContent('1');
		await expect(opus).toHaveTextContent('10 h');
		await expect(pane).not.toHaveTextContent('No runs in this cohort');
	}}
/>

<Story
	name="QA disabled"
	args={{ state: readyPanel(qaDisabledCohort.stages) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(stagesOf(pane)).toEqual(['plan', 'work', 'qa', 'review', 'wrapup']);
		const qa = pane.querySelector('tbody[data-stage="qa"]')!;
		await expect(qa).toHaveTextContent('No runs in this cohort');
		await expect(qa.querySelector('tr[data-setup]')).toBeNull();
	}}
/>

<Story
	name="Partial"
	args={{ state: readyPanel(partialCohort.stages) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const row = pane.querySelector(
			'tbody[data-stage="review"] tr[data-setup="claude-opus-5-5:high"]'
		)!;
		// No accepted outputs: the ratios are Unavailable, never 0.
		for (const column of ['first-pass', 'corrections', 'review-rounds', 'tokens', 'cost']) {
			const cell = row.querySelector(`[data-column="${column}"]`)!;
			await expect(cell).toHaveTextContent('— Unavailable');
			await expect(cell).not.toHaveTextContent('0');
		}
		await expect(row.querySelector('[data-column="infrastructure-lost"]')).toHaveTextContent('2');
	}}
/>

<Story
	name="Empty window"
	args={{ state: readyPanel(emptyCohort.stages) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(stagesOf(pane)).toEqual(['plan', 'work', 'qa', 'review', 'wrapup']);
		for (const group of pane.querySelectorAll('tbody[data-stage]')) {
			await expect(group).toHaveTextContent('No runs in this cohort');
		}
	}}
/>

<Story
	name="Loading"
	args={{ state: loadingPanel }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="stage-table"]')!;
		await expect(panel).toHaveAttribute('aria-busy', 'true');
		await expect(panel.querySelector('[data-slot="stats-skeleton"]')).not.toBeNull();
	}}
/>

<Story
	name="Error"
	args={{ state: failedPanel({ ...panelFailure, retryable: false }) }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="stage-table"]')!;
		await expect(panel.querySelector('[data-testid="panel-error-title"]')).toHaveTextContent(
			'Stats unavailable'
		);
		await expect(panel.querySelector('table')).toBeNull();
		await expect(panel.querySelector('button')).toBeNull();
	}}
/>
