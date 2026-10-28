<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import MetricSummaryRow from './metric-summary-row.svelte';
	import { failedPanel, loadingPanel, readyPanel } from './panel-state';
	import {
		completeCohort,
		emptyCohort,
		panelFailure,
		zeroMergesCohort
	} from './stats-story-cohorts';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const metric = (pane: HTMLElement, name: string) =>
		pane.querySelector(`[data-metric="${name}"]`) as HTMLElement;

	const { Story } = defineMeta({
		title: 'Components/Factory/Stats/MetricSummaryRow',
		component: MetricSummaryRow,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Total tokens, total cost and the merge rate with its denominator (merged over merged, abandoned and cancelled). A zero denominator reads "—" Unavailable, never 0%. "Inspect cohort" expands the outcome counts.'
				}
			}
		}
	});
</script>

<Story
	name="Complete"
	args={{ state: readyPanel(completeCohort.summary) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const tokens = metric(pane, 'tokens');
		await expect(tokens.querySelector('[data-testid="info-card-value"]')).toHaveTextContent(
			'6.40M'
		);
		await expect(tokens).toHaveTextContent('6,400,000 tokens · all outcomes · 26 started');
		await expect(metric(pane, 'cost')).toHaveTextContent('$48.20');
		await expect(metric(pane, 'merge-rate')).toHaveTextContent('80%');
		await expect(pane.querySelector('[data-testid="merge-rate-denominator"]')).toHaveTextContent(
			'16 of 20 finished · 6 open or unknown excluded'
		);
		// Every figure is readable: none is clipped by its card.
		const values = pane.querySelectorAll('[data-testid="info-card-value"]');
		await expect(values).toHaveLength(3);
		for (const value of values) {
			const range = document.createRange();
			range.selectNodeContents(value);
			const text = range.getBoundingClientRect();
			const card = value.closest('[data-slot="info-card"]')!.getBoundingClientRect();
			await expect(text.left).toBeGreaterThanOrEqual(card.left);
			await expect(text.right).toBeLessThanOrEqual(card.right);
		}

		const details = pane.querySelector('[data-testid="inspect-cohort"]') as HTMLDetailsElement;
		await expect(details.open).toBe(false);
		await userEvent.click(within(pane).getByText('Inspect cohort'));
		await expect(details.open).toBe(true);
		const counts = {
			merged: '16',
			abandoned: '2',
			cancelled: '2',
			open: '4',
			unknown: '2',
			started: '26'
		};
		for (const [outcome, count] of Object.entries(counts)) {
			await expect(details.querySelector(`[data-outcome="${outcome}"]`)).toHaveTextContent(
				`${outcome} ${count}`
			);
		}
	}}
/>

<Story
	name="Zero merges"
	args={{ state: readyPanel(zeroMergesCohort.summary) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const rate = metric(pane, 'merge-rate');
		await expect(rate).toHaveTextContent('0%');
		await expect(rate).not.toHaveTextContent('—');
		await expect(rate).not.toHaveTextContent('Unavailable');
		await expect(pane.querySelector('[data-testid="merge-rate-denominator"]')).toHaveTextContent(
			'0 of 3 finished · 3 open or unknown excluded'
		);
	}}
/>

<Story
	name="Empty window"
	args={{ state: readyPanel(emptyCohort.summary) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const rate = metric(pane, 'merge-rate');
		await expect(rate.querySelector('[data-testid="info-card-value"]')).toHaveTextContent('—');
		await expect(rate).toHaveTextContent('Unavailable');
		await expect(rate).not.toHaveTextContent('0%');
		await expect(pane.querySelector('[data-testid="merge-rate-denominator"]')).toHaveTextContent(
			'No finished tickets'
		);
	}}
/>

<Story
	name="Loading"
	args={{ state: loadingPanel }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="metric-summary-row"]')!;
		await expect(panel).toHaveAttribute('aria-busy', 'true');
		await expect(panel.querySelector('[data-slot="stats-skeleton"]')).not.toBeNull();
	}}
/>

<Story
	name="Error"
	args={{ state: failedPanel(panelFailure), onretry: fn() }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const panel = pane.querySelector('[data-slot="metric-summary-row"]')!;
		await expect(panel.querySelector('[data-testid="panel-error-title"]')).toHaveTextContent(
			'Stats unavailable'
		);
		await expect(panel.querySelector('[data-metric]')).toBeNull();
		await userEvent.click(within(pane).getByRole('button', { name: 'Retry' }));
		await expect(args.onretry).toHaveBeenCalledOnce();
	}}
/>
