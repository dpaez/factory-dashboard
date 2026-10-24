<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import TokensByStage from './tokens-by-stage.svelte';
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
	const stage = (pane: HTMLElement, name: string) =>
		pane.querySelector(`li[data-stage="${name}"]`) as HTMLElement;
	const barWidth = (pane: HTMLElement, name: string) =>
		(stage(pane, name).querySelector('[data-slot="token-bar"]') as HTMLElement | null)?.style
			.width ?? null;
	const categoriesUnavailable = async (pane: HTMLElement) =>
		expect(pane.querySelector('[data-testid="token-categories"]')).toHaveTextContent(
			'Token categories: Unavailable'
		);

	const { Story } = defineMeta({
		title: 'Components/Factory/Stats/TokensByStage',
		component: TokensByStage,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Total tokens per stage on one shared scale (the largest stage fills the track; rows are not normalized to 100%), with coverage of cohort tokens. Partial stages disclose their excluded runs. Token categories are Unavailable until stats facts carry them.'
				}
			}
		}
	});
</script>

<Story
	name="Complete"
	args={{ state: readyPanel(completeCohort.tokens) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		// Work is the largest stage: it fills the track and the others scale to it.
		await expect(barWidth(pane, 'work')).toBe('100%');
		await expect(barWidth(pane, 'plan')).toBe('28.89%');
		await expect(barWidth(pane, 'wrapup')).toBe('15.56%');
		await expect(stage(pane, 'work')).toHaveTextContent('3,600,000 tokens');
		await expect(pane.querySelector('[data-testid="tokens-coverage"]')).toHaveTextContent(
			'coverage of cohort tokens 100% (6,400,000 of 6,400,000)'
		);
		await expect(pane.querySelector('[data-testid="stage-partial"]')).toBeNull();
		await categoriesUnavailable(pane);
		await expect(pane).not.toHaveTextContent(/saved/i);
	}}
/>

<Story
	name="QA disabled"
	args={{ state: readyPanel(qaDisabledCohort.tokens) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const qa = stage(pane, 'qa');
		await expect(qa).toHaveAttribute('data-availability', 'no-runs');
		await expect(qa).toHaveTextContent('No runs in this cohort');
		await expect(barWidth(pane, 'qa')).toBeNull();
		await categoriesUnavailable(pane);
	}}
/>

<Story
	name="Partial"
	args={{ state: readyPanel(partialCohort.tokens) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const review = stage(pane, 'review');
		await expect(review).toHaveAttribute('data-availability', 'partial');
		await expect(review.querySelector('[data-testid="stage-partial"]')).toHaveTextContent(
			'partial · 3 runs excluded'
		);
		await expect(review).toHaveTextContent('600,000 tokens');
		await categoriesUnavailable(pane);
	}}
/>

<Story
	name="Empty window"
	args={{ state: readyPanel(emptyCohort.tokens) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		for (const item of pane.querySelectorAll('li[data-stage]')) {
			await expect(item).toHaveTextContent('No runs in this cohort');
		}
		await expect(pane.querySelector('[data-slot="token-bar"]')).toBeNull();
		await expect(pane.querySelector('[data-testid="tokens-coverage"]')).toHaveTextContent(
			'coverage of cohort tokens — Unavailable'
		);
		await categoriesUnavailable(pane);
	}}
/>

<Story
	name="Loading"
	args={{ state: loadingPanel }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="tokens-by-stage"]')!;
		await expect(panel).toHaveAttribute('aria-busy', 'true');
		await expect(panel.querySelector('[data-slot="stats-skeleton"]')).not.toBeNull();
	}}
/>

<Story
	name="Error"
	args={{ state: failedPanel(panelFailure) }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="tokens-by-stage"]')!;
		await expect(panel.querySelector('[data-testid="panel-error-title"]')).toHaveTextContent(
			'Stats unavailable'
		);
		await expect(panel.querySelector('li[data-stage]')).toBeNull();
	}}
/>
