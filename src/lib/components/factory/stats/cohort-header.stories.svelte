<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import CohortHeader from './cohort-header.svelte';
	import { completeCohort, mismatchCohort, noReadsCohort } from './stats-story-cohorts';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	const { Story } = defineMeta({
		title: 'Components/Factory/Stats/CohortHeader',
		component: CohortHeader,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'The cohort every stats figure describes: tickets started in the window (`from` inclusive, `to` exclusive and shown as "before"), the observation time, factory, versions and definitions. The window shows even when every read failed.'
				}
			}
		}
	});
</script>

<Story
	name="Complete"
	args={{ cohort: completeCohort.cohort }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="cohort-window"]')).toHaveTextContent(
			'Cohort: tickets started 2026-09-24 00:00 UTC – before 2026-10-24 00:00 UTC'
		);
		await expect(pane.querySelector('[data-testid="cohort-observed"]')).toHaveTextContent(
			'2026-10-24 09:00 UTC'
		);
		await expect(pane.querySelector('[data-testid="cohort-factory"]')).toHaveTextContent(
			'factory-geut-01'
		);
		await expect(pane.querySelector('[data-testid="cohort-versions"]')).toHaveTextContent(
			'0.14.0, 0.15.1'
		);
		await expect(pane.querySelector('[data-testid="cohort-definitions"]')).toHaveTextContent(
			'stats.v1'
		);
		await expect(pane.querySelector('[data-testid="cohort-mismatch"]')).toBeNull();
	}}
/>

<Story
	name="Reads disagree"
	args={{ cohort: mismatchCohort }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="cohort-mismatch"]')).toHaveTextContent(
			'Reads disagree'
		);
		// The first successful envelope describes the factory; nothing is mixed.
		await expect(pane.querySelector('[data-testid="cohort-factory"]')).toHaveTextContent(
			'factory-geut-01'
		);
	}}
/>

<Story
	name="Every read failed"
	args={{ cohort: noReadsCohort }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="cohort-window"]')).toHaveTextContent(
			'2026-09-24 00:00 UTC – before 2026-10-24 00:00 UTC'
		);
		await expect(pane.querySelector('[data-testid="cohort-factory"]')).toHaveTextContent(
			'— Unavailable'
		);
		await expect(pane.querySelector('[data-testid="cohort-definitions"]')).toHaveTextContent(
			'— Unavailable'
		);
	}}
/>
