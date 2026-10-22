<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent } from 'storybook/test';
	import RunTimeline from './run-timeline.svelte';
	import { toRun } from '$lib/factory/adapters';
	import {
		runHistoryInfrastructureRetry,
		runHistoryReviewChanges,
		runHistoryUnknownPurpose,
		runHistoryWorkCrashed,
		runsHistory,
		runWorkValidationFailed
	} from '$lib/factory/fixtures';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	const history = runsHistory.map(toRun);
	const row = (pane: HTMLElement, id: string) =>
		pane.querySelector<HTMLButtonElement>(`[data-run="${id}"]`)!;

	const { Story } = defineMeta({
		title: 'Components/Factory/RunTimeline',
		component: RunTimeline,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'One execution\'s runs, grouped by task ("Ticket" for plan and wrapup) and then by stage, oldest first. Each run is a button with its sequence, purpose label (an unknown purpose shows its raw value), round, status, how it ended when it was lost, outcome, validation and review, model · thinking, times, and usage or "Usage unavailable". Choosing a run calls `onselect`; it never navigates.'
				}
			}
		}
	});
</script>

<Story
	name="Multi-task history"
	args={{ runs: history, onselect: fn() }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const groups = [...pane.querySelectorAll('[data-run-group]')];
		await expect(groups.map((group) => group.getAttribute('data-run-group'))).toEqual([
			'ticket',
			'01',
			'02'
		]);
		const task01 = pane.querySelector('[data-run-group="01"]')!;
		await expect(
			[...task01.querySelectorAll('[data-run-stage]')].map((s) => s.getAttribute('data-run-stage'))
		).toEqual(['work', 'review']);

		const purposes = [...pane.querySelectorAll('[data-testid="run-purpose"]')].map((p) =>
			p.textContent?.trim()
		);
		for (const label of ['Return to work', 'Correction', 'Re-entry', 'Infrastructure retry']) {
			await expect(purposes).toContain(label);
		}

		const lost = row(pane, runHistoryWorkCrashed.id);
		await expect(lost.querySelector('[data-testid="run-terminal-kind"]')).toHaveTextContent(
			'Lost: crashed'
		);
		await expect(lost.querySelector('[data-testid="run-outcome"]')).toHaveTextContent('retrying');

		const review = row(pane, runHistoryReviewChanges.id);
		await expect(review.querySelector('[data-testid="run-review"]')).toHaveTextContent(
			'Changes requested'
		);
		await expect(review.querySelector('[data-testid="run-review"]')).toHaveTextContent(
			'findings 3 · blocking 2'
		);

		const retry = row(pane, runHistoryInfrastructureRetry.id);
		await expect(retry.querySelector('[data-testid="run-round"]')).toHaveTextContent('round 1');
		await expect(retry.querySelector('[data-testid="run-model"]')).toHaveTextContent(
			'claude-opus-5-5 · high'
		);
		await expect(retry.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Running');
		await expect(pane.querySelector('[aria-pressed="true"]')).toBeNull();
	}}
/>

<Story
	name="Unknown purpose"
	args={{ runs: [toRun(runHistoryUnknownPurpose)], onselect: fn() }}
	play={async ({ canvasElement }) => {
		const purpose = firstPane(canvasElement).querySelector('[data-testid="run-purpose"]')!;
		await expect(purpose).toHaveTextContent('operator_nudge');
		await expect(purpose).toHaveAttribute('data-known', 'false');
	}}
/>

<Story
	name="No usage"
	args={{ runs: [toRun(runWorkValidationFailed)], onselect: fn() }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="run-usage"]')).toHaveTextContent(
			'Usage unavailable'
		);
		await expect(pane).not.toHaveTextContent('$0.00');
		await expect(pane.querySelector('[data-testid="run-validation"]')).toHaveTextContent('Failed');
	}}
/>

<Story
	name="Selected run"
	args={{ runs: history, selected: runHistoryReviewChanges.id, onselect: fn() }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const selected = pane.querySelectorAll('[aria-pressed="true"]');
		await expect(selected).toHaveLength(1);
		await expect(selected[0]).toHaveAttribute('data-run', runHistoryReviewChanges.id);

		await userEvent.click(row(pane, runHistoryWorkCrashed.id));
		await expect(args.onselect).toHaveBeenCalledWith(runHistoryWorkCrashed.id);
	}}
/>

<Story
	name="Partial list"
	args={{ runs: history.slice(0, 4), runsComplete: false, onselect: fn() }}
	play={async ({ canvasElement }) => {
		await expect(
			firstPane(canvasElement).querySelector('[data-testid="runs-partial"]')
		).toHaveTextContent('Showing 4 runs. Earlier or later runs are not shown.');
	}}
/>

<Story
	name="No runs"
	args={{ runs: [], onselect: fn() }}
	play={async ({ canvasElement }) => {
		await expect(firstPane(canvasElement)).toHaveTextContent('No runs yet for this execution.');
	}}
/>
