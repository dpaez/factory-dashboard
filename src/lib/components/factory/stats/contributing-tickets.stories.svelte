<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import type { ContributorMeasure } from '$lib/factory/stats-tickets';
	import ContributingTickets from './contributing-tickets.svelte';
	import TicketsQuality from './tickets-quality.svelte';
	import TimeBreakdown from './time-breakdown.svelte';
	import { failedPanel, loadingPanel, readyPanel } from './panel-state';
	import {
		completeTickets,
		emptyTickets,
		incompleteTickets,
		noHandoffTickets,
		panelFailure
	} from './stats-story-cohorts';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const refs = (pane: HTMLElement) =>
		[...pane.querySelectorAll('[data-slot="contributing-tickets"] tbody tr')].map((row) =>
			row.querySelector('th')?.textContent?.trim()
		);

	const { Story } = defineMeta({
		title: 'Components/Factory/Stats/ContributingTickets',
		component: ContributingTickets,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'The exact executions behind the selected figure: the measure name and population, then displayRef, outcome, started, value, and an "Open execution" link through the stats resolver. Rows are executions, not tickets.'
				}
			}
		}
	});
</script>

<script lang="ts">
	let measure = $state<ContributorMeasure | null>(null);
</script>

<Story
	name="Needed a person"
	args={{ state: readyPanel(completeTickets.contributors('neededAPerson')) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const population = pane.querySelector('[data-testid="contributors-population"]')!;
		await expect(population).toHaveTextContent('Needed a person');
		await expect(population).toHaveTextContent('Rows are executions, not tickets');
		await expect(population).toHaveTextContent('6 executions');
		await expect(refs(pane)).toEqual([
			'dpaez/factory-dashboard#9',
			'dpaez/factory-dashboard#14',
			'dpaez/factory-dashboard#17',
			'KAI-21',
			'KAI-23',
			'dpaez/factory-dashboard#20'
		]);
		const first = pane.querySelector('tbody tr')!;
		await expect(first).toHaveTextContent('merged');
		await expect(first).toHaveTextContent('2026-10-05 08:00 UTC');
		await expect(first.querySelector('[data-column="value"]')).toHaveTextContent('2');
		await expect(first).toHaveTextContent('1 question, 1 reply');
		const link = first.querySelector('[data-testid="open-execution"]')!;
		await expect(link).toHaveTextContent('Open execution');
		await expect(link).toHaveAttribute(
			'href',
			'/stats/execution?key=dpaez-factory-dashboard-9-9a0b1c2d&startedAt=2026-10-05T08%3A00%3A00Z'
		);
	}}
/>

<Story
	name="Excluded from time figures"
	args={{ state: readyPanel(noHandoffTickets.contributors('timeExcluded')) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(refs(pane)).toEqual(['dpaez/factory-dashboard#20', 'KAI-24', 'KAI-33']);
		for (const cell of pane.querySelectorAll('[data-column="value"]')) {
			await expect(cell).toHaveTextContent('— Unavailable');
		}
	}}
/>

<Story
	name="Partial population"
	args={{
		state: readyPanel(incompleteTickets.contributors('neededAPerson')),
		complete: false
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="contributors-population"]')).toHaveTextContent(
			'3 executions · partial: ticket facts incomplete'
		);
	}}
/>

<Story
	name="Empty population"
	args={{ state: readyPanel(emptyTickets.contributors('followUpCommits')) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="contributors-empty"]')).toHaveTextContent(
			'No executions in this population'
		);
		await expect(pane.querySelector('table')).toBeNull();
	}}
/>

<Story
	name="Nothing selected"
	args={{ state: readyPanel(null) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="contributors-prompt"]')).toHaveTextContent(
			'Select a figure'
		);
	}}
/>

<Story
	name="Selecting a figure"
	asChild
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const canvas = within(pane);
		await userEvent.click(canvas.getByRole('button', { name: 'Follow-up commits after handoff' }));
		await expect(refs(pane)).toEqual(['dpaez/factory-dashboard#9', 'dpaez/factory-dashboard#19']);
		await userEvent.click(canvas.getByRole('button', { name: '2 excluded' }));
		await expect(refs(pane)).toEqual(['dpaez/factory-dashboard#20', 'KAI-24']);
		await userEvent.click(canvas.getByRole('button', { name: /executions reached handoff/ }));
		await expect(refs(pane)).toHaveLength(10);
		for (const link of pane.querySelectorAll('[data-testid="open-execution"]')) {
			await expect(link.getAttribute('href')).toMatch(/^\/stats\/execution\?key=.+&startedAt=.+/);
		}
	}}
>
	<div class="flex flex-col gap-6">
		<TimeBreakdown
			state={readyPanel(completeTickets.time)}
			selected={measure}
			onselect={(next) => (measure = next)}
		/>
		<TicketsQuality
			state={readyPanel(completeTickets.quality)}
			selected={measure}
			onselect={(next) => (measure = next)}
		/>
		<ContributingTickets
			state={readyPanel(measure === null ? null : completeTickets.contributors(measure))}
		/>
	</div>
</Story>

<Story
	name="Loading"
	args={{ state: loadingPanel }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="contributing-tickets"]')!;
		await expect(panel).toHaveAttribute('aria-busy', 'true');
		await expect(panel.querySelector('[data-slot="stats-skeleton"]')).not.toBeNull();
	}}
/>

<Story
	name="Error"
	args={{ state: failedPanel(panelFailure) }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="contributing-tickets"]')!;
		await expect(panel.querySelector('[data-testid="panel-error-title"]')).toHaveTextContent(
			'Stats unavailable'
		);
		await expect(panel.querySelector('table')).toBeNull();
	}}
/>
