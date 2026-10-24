<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import TimeBreakdown from './time-breakdown.svelte';
	import { failedPanel, loadingPanel, readyPanel } from './panel-state';
	import {
		completeTickets,
		emptyTickets,
		incompleteTickets,
		missingTimingsTickets,
		noHandoffTickets,
		panelFailure,
		smallSampleTickets
	} from './stats-story-cohorts';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const figure = (pane: HTMLElement, name: string) =>
		pane.querySelector(`[data-figure="${name}"]`) as HTMLElement;
	const testid = (pane: HTMLElement, id: string) =>
		pane.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
	const stage = (pane: HTMLElement, name: string) =>
		pane.querySelector(`li[data-stage="${name}"]`) as HTMLElement;
	const barWidth = (pane: HTMLElement, name: string) =>
		(stage(pane, name).querySelector('[data-slot="stage-bar"]') as HTMLElement | null)?.style
			.width ?? null;
	const headlineUnavailable = async (pane: HTMLElement) => {
		for (const name of ['mean', 'median', 'p90']) {
			const value = figure(pane, name).querySelector('[data-availability]')!;
			await expect(value).toHaveTextContent('— Unavailable');
			await expect(value).not.toHaveTextContent('0');
		}
	};

	const { Story } = defineMeta({
		title: 'Components/Factory/Stats/TimeBreakdown',
		component: TimeBreakdown,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Start → handoff (mean, median, nearest-rank P90) over the executions that reached handoff, with the sample and exclusions beside it. Waiting before handoff and factory time are separate rows; stage time bars share one duration scale; agent time and overhead carry their own sample. Unknown is "—", never 0.'
				}
			}
		}
	});
</script>

<Story
	name="Complete"
	args={{ state: readyPanel(completeTickets.time), onselect: fn() }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const mean = figure(pane, 'mean').querySelector('[data-availability]')!;
		await expect(mean).toHaveClass('font-mono', 'tabular-nums');
		await expect(mean).toHaveTextContent('4 h 18 m');
		await expect(figure(pane, 'median')).toHaveTextContent('3 h 30 m');
		await expect(figure(pane, 'p90')).toHaveTextContent('8 h');
		await expect(figure(pane, 'p90')).toHaveTextContent('nearest-rank');
		await expect(testid(pane, 'time-sample')).toHaveTextContent(
			'10 of 12 executions reached handoff · 2 excluded (1 open, 1 cancelled)'
		);
		await expect(testid(pane, 'small-sample')).toBeNull();
		await expect(figure(pane, 'waiting-before-handoff')).toHaveTextContent('15 m');
		await expect(figure(pane, 'factory-time')).toHaveTextContent('4 h 3 m');
		// One shared scale: work is longest and fills the track.
		await expect(barWidth(pane, 'work')).toBe('100%');
		await expect(barWidth(pane, 'plan')).toBe('14.49%');
		await expect(barWidth(pane, 'review')).toBe('26.45%');
		await expect(stage(pane, 'work')).toHaveTextContent('2 h 18 m');
		await expect(stage(pane, 'work')).toHaveTextContent('(8,280 seconds)');
		// Waiting before handoff is a row, not a stage bar.
		await expect(pane.querySelector('li[data-stage*="wait"]')).toBeNull();
		await expect(testid(pane, 'unattributed')).toHaveTextContent('37 m');
		await expect(testid(pane, 'time-inconsistent')).toBeNull();
		await expect(testid(pane, 'agent-overhead')).toHaveTextContent('Agent time 2 h 12 m');
		await expect(testid(pane, 'agent-overhead')).toHaveTextContent(
			'Overhead 1 h 14 m mean (n = 10)'
		);

		const canvas = within(pane);
		await userEvent.click(canvas.getByRole('button', { name: /executions reached handoff/ }));
		await expect(args.onselect).toHaveBeenLastCalledWith('timeSample');
		await userEvent.click(canvas.getByRole('button', { name: '2 excluded' }));
		await expect(args.onselect).toHaveBeenLastCalledWith('timeExcluded');
	}}
/>

<Story
	name="Small sample"
	args={{ state: readyPanel(smallSampleTickets.time) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(testid(pane, 'median-sample')).toHaveTextContent('n = 3');
		await expect(testid(pane, 'p90-sample')).toHaveTextContent('n = 3');
		await expect(testid(pane, 'small-sample')).toHaveTextContent('Small sample: 3 executions');
		await expect(testid(pane, 'time-sample')).toHaveTextContent(
			'3 of 3 executions reached handoff · 0 excluded'
		);
	}}
/>

<Story
	name="Missing timings"
	args={{ state: readyPanel(missingTimingsTickets.time) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		// The headline still renders.
		await expect(figure(pane, 'mean')).toHaveTextContent('2 h 40 m');
		await expect(figure(pane, 'mean')).not.toHaveTextContent('Unavailable');
		// Stage bars and overhead disclose their own, smaller sample.
		await expect(testid(pane, 'stage-partial')).toHaveTextContent(
			'Partial: 2 of 3 have no stage timings and count as 0.'
		);
		await expect(stage(pane, 'qa')).toHaveAttribute('data-availability', 'no-runs');
		await expect(testid(pane, 'agent-overhead')).toHaveTextContent(
			'(n = 1, partial: 2 without stage timings left out)'
		);
		await expect(
			testid(pane, 'agent-overhead')!.querySelectorAll('[data-availability="partial"]')
		).toHaveLength(1);
	}}
/>

<Story
	name="No handoffs"
	args={{ state: readyPanel(noHandoffTickets.time) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await headlineUnavailable(pane);
		await expect(testid(pane, 'time-sample')).toHaveTextContent(
			'0 of 3 executions reached handoff · 3 excluded (1 open, 1 cancelled, 1 unknown)'
		);
		await expect(figure(pane, 'waiting-before-handoff')).toHaveTextContent('— Unavailable');
		await expect(figure(pane, 'factory-time')).toHaveTextContent('— Unavailable');
		await expect(pane.querySelector('[data-slot="stage-bar"]')).toBeNull();
		for (const item of pane.querySelectorAll('li[data-stage]')) {
			await expect(item).toHaveTextContent('— Unavailable');
		}
		await expect(testid(pane, 'small-sample')).toBeNull();
	}}
/>

<Story
	name="Incomplete ticket facts"
	args={{ state: readyPanel(incompleteTickets.time) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(testid(pane, 'facts-incomplete')).toHaveTextContent('Ticket facts incomplete');
		await headlineUnavailable(pane);
		await expect(testid(pane, 'time-sample')).toHaveTextContent(
			'6 of 6 executions reached handoff'
		);
		await expect(testid(pane, 'time-sample')).toHaveTextContent('partial');
		await expect(pane.querySelector('[data-slot="stage-bar"]')).toBeNull();
	}}
/>

<Story
	name="Empty window"
	args={{ state: readyPanel(emptyTickets.time) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await headlineUnavailable(pane);
		await expect(testid(pane, 'time-sample')).toHaveTextContent(
			'0 of 0 executions reached handoff · 0 excluded'
		);
	}}
/>

<Story
	name="Loading"
	args={{ state: loadingPanel }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="time-breakdown"]')!;
		await expect(panel).toHaveAttribute('aria-busy', 'true');
		await expect(panel.querySelector('[data-slot="stats-skeleton"]')).not.toBeNull();
	}}
/>

<Story
	name="Error"
	args={{ state: failedPanel(panelFailure) }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="time-breakdown"]')!;
		await expect(panel.querySelector('[data-testid="panel-error-title"]')).toHaveTextContent(
			'Stats unavailable'
		);
		await expect(panel.querySelector('[data-testid="start-to-handoff"]')).toBeNull();
		await expect(panel).not.toHaveTextContent(/http|problem|token/i);
	}}
/>
