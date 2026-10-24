<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import TicketsQuality from './tickets-quality.svelte';
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
	const row = (pane: HTMLElement, name: string) =>
		pane.querySelector(`[data-row="${name}"]`) as HTMLElement;
	const changesRequestedUnavailable = async (pane: HTMLElement) => {
		const changes = row(pane, 'external-changes-requested');
		await expect(changes).toHaveAttribute('data-availability', 'unavailable');
		await expect(changes).toHaveTextContent('— Unavailable');
		await expect(changes).toHaveTextContent('geut/factory-skills#63');
	};

	const { Story } = defineMeta({
		title: 'Components/Factory/Stats/TicketsQuality',
		component: TicketsQuality,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Needed a person with its six intervention kinds, external review rounds with their stats.v1 definition, external changes requested (Unavailable until geut/factory-skills#63), and follow-up commits after handoff. Each figure keeps its own sample; there is no combined score. Selecting a row emits onselect(measure).'
				}
			}
		}
	});
</script>

<Story
	name="Complete"
	args={{ state: readyPanel(completeTickets.quality), onselect: fn() }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const needed = row(pane, 'needed-a-person');
		await expect(needed).toHaveTextContent('50%');
		await expect(needed).toHaveTextContent('6 of 12 executions started in the window');
		const kinds = [...needed.querySelectorAll('[data-intervention]')].map((item) =>
			item.textContent?.replace(/\s+/g, ' ').trim()
		);
		await expect(kinds).toEqual([
			'Questions 4',
			'Limit pauses 1',
			'Replies 3',
			'Manual retries 1',
			'Manual completes 1',
			'Stops 1'
		]);
		const rounds = row(pane, 'external-review-rounds');
		await expect(rounds).toHaveTextContent('8 · 4 human · 4 bot · median 1 over 9 executions');
		await expect(
			rounds.querySelector('[data-testid="external-review-rounds-definition"]')
		).toHaveTextContent('or a comment with a body');
		await changesRequestedUnavailable(pane);
		await expect(row(pane, 'follow-up-commits')).toHaveTextContent(
			'3 over 10 executions that reached handoff'
		);
		await expect(pane).not.toHaveTextContent(/score/i);

		const canvas = within(pane);
		for (const [name, measure] of [
			['Needed a person', 'neededAPerson'],
			['External review rounds', 'externalReviewRounds'],
			['Follow-up commits after handoff', 'followUpCommits']
		] as const) {
			await userEvent.click(canvas.getByRole('button', { name }));
			await expect(args.onselect).toHaveBeenLastCalledWith(measure);
		}
		await expect(canvas.queryByRole('button', { name: 'External changes requested' })).toBeNull();
	}}
/>

<Story
	name="Selected"
	args={{ state: readyPanel(completeTickets.quality), selected: 'externalReviewRounds' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(
			within(pane).getByRole('button', { name: 'External review rounds' })
		).toHaveAttribute('aria-pressed', 'true');
		await expect(within(pane).getByRole('button', { name: 'Needed a person' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
	}}
/>

<Story
	name="No handoffs"
	args={{ state: readyPanel(noHandoffTickets.quality) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(row(pane, 'external-review-rounds')).toHaveTextContent(
			'median — Unavailable over 0 executions'
		);
		await expect(row(pane, 'follow-up-commits')).toHaveTextContent(
			'0 over 0 executions that reached handoff'
		);
		await changesRequestedUnavailable(pane);
	}}
/>

<Story
	name="Incomplete ticket facts"
	args={{ state: readyPanel(incompleteTickets.quality) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="facts-incomplete"]')).toHaveTextContent(
			'Ticket facts incomplete'
		);
		const needed = pane.querySelector('[data-testid="needed-a-person-value"]')!;
		await expect(needed).toHaveTextContent('— Unavailable');
		await expect(needed).toHaveTextContent('3 of 6 executions');
		await expect(
			row(pane, 'needed-a-person').querySelectorAll('[data-availability="partial"]')
		).toHaveLength(6);
		await expect(row(pane, 'follow-up-commits')).toHaveTextContent('partial');
		await changesRequestedUnavailable(pane);
	}}
/>

<Story
	name="Empty window"
	args={{ state: readyPanel(emptyTickets.quality) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const needed = pane.querySelector('[data-testid="needed-a-person-value"]')!;
		await expect(needed).toHaveTextContent('— Unavailable');
		await expect(needed).toHaveTextContent('0 of 0 executions');
		await changesRequestedUnavailable(pane);
	}}
/>

<Story
	name="Loading"
	args={{ state: loadingPanel }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="tickets-quality"]')!;
		await expect(panel).toHaveAttribute('aria-busy', 'true');
		await expect(panel.querySelector('[data-slot="stats-skeleton"]')).not.toBeNull();
	}}
/>

<Story
	name="Error"
	args={{ state: failedPanel(panelFailure) }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="tickets-quality"]')!;
		await expect(panel.querySelector('[data-testid="panel-error-title"]')).toHaveTextContent(
			'Stats unavailable'
		);
		await expect(panel.querySelector('[data-row]')).toBeNull();
	}}
/>
