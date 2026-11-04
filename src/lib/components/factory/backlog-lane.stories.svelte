<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import BacklogLane from './backlog-lane.svelte';
	import { toBacklogCards, type BacklogFailure } from '$lib/factory/backlog';
	import {
		backlogIssues,
		backlogPage,
		backlogPageLast,
		problemNoTracker,
		problemTrackerCliMissing,
		problemTrackerForbidden,
		problemTrackerNotFound,
		problemTrackerUnauthorized,
		problemTrackerUnavailable,
		problemTrackerUnknown
	} from '$lib/factory/fixtures';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const cardIds = (pane: HTMLElement) =>
		[...pane.querySelectorAll<HTMLElement>('[data-slot="backlog-card-button"]')].map(
			(card) => card.dataset.issueId
		);

	const cards = toBacklogCards(backlogIssues);
	const fetchedAt = backlogPage.fetchedAt;
	const asFailure = (problem: { type: string; title: string; detail: string }): BacklogFailure => ({
		type: problem.type,
		title: problem.title,
		detail: problem.detail,
		retryable: true
	});
	const reason = asFailure(problemTrackerUnavailable);

	/**
	 * The failure's Details disclosure: closed, focusable (a native summary is
	 * keyboard-operable), then opened. Synthetic keys do not run the summary's
	 * activation, so the story opens it with a click.
	 */
	async function openDetails(pane: HTMLElement) {
		const details = pane.querySelector<HTMLDetailsElement>(
			'[data-slot="backlog-failure-details"]'
		)!;
		await expect(details).not.toHaveAttribute('open');
		await expect(pane.querySelector('[data-slot="backlog-failure-detail"]')).not.toBeVisible();
		const summary = within(details).getByText('Details');
		summary.focus();
		await expect(summary).toHaveFocus();
		await userEvent.click(summary);
		await expect(details).toHaveAttribute('open');
		return pane.querySelector<HTMLElement>('[data-slot="backlog-failure-detail"]')!;
	}

	const { Story } = defineMeta({
		title: 'Components/Factory/BacklogLane',
		component: BacklogLane,
		args: {
			cards,
			fetchedAt,
			status: 'ready',
			onselect: fn(),
			onfilter: fn(),
			onrefresh: fn(),
			onretry: fn()
		},
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'The Backlog lane, a recessed well before the pipeline: pinned name, count, Refresh, timestamp and label filter, then a list that scrolls on its own. A failed read stays in the lane; stale issues keep their timestamp and the lane offers Retry. Read-only.'
				}
			}
		}
	});
</script>

<Story
	name="Populated"
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="lane-count"]')).toHaveTextContent(
			String(cards.length)
		);
		await expect(pane.querySelector('[data-slot="backlog-fetched-at"]')).toHaveTextContent(
			'Updated 2026-10-13 11:00 UTC'
		);
		await expect(pane).not.toHaveTextContent(/start/i);

		const refresh = within(pane).getByRole('button', { name: 'Refresh' });
		await userEvent.click(refresh);
		await expect(args.onrefresh).toHaveBeenCalledTimes(1);

		// Enter and Space on a focused card select it.
		const first = pane.querySelector<HTMLElement>('[data-slot="backlog-card-button"]')!;
		first.focus();
		await userEvent.keyboard('{Enter}');
		await expect(args.onselect).toHaveBeenLastCalledWith(cards[0]!.id);
		await userEvent.keyboard(' ');
		await expect(args.onselect).toHaveBeenCalledTimes(2);
	}}
/>

<Story
	name="Label filter applied"
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const filter = within(pane).getByRole('combobox', { name: 'Filter by label' });
		const options = [...filter.querySelectorAll('option')].map((option) => option.textContent);
		await expect(options[0]).toBe('All labels');
		await expect(options).toContain('epic');

		await userEvent.selectOptions(filter, 'epic');
		await expect(args.onfilter).toHaveBeenLastCalledWith('epic');
		const epics = cards.filter((card) => card.labels.includes('epic')).map((card) => card.id);
		await expect(cardIds(pane)).toEqual(epics);
		const count = pane.querySelector('[data-slot="lane-count"]')!;
		await expect(count).toHaveAttribute('data-filtered', 'true');
		await expect(count).toHaveTextContent(`${epics.length} of ${cards.length}`);

		await userEvent.selectOptions(filter, 'All labels');
		await expect(args.onfilter).toHaveBeenLastCalledWith(null);
		await expect(cardIds(pane)).toHaveLength(cards.length);
		await expect(count).not.toHaveAttribute('data-filtered');
	}}
/>

<Story
	name="Filtered"
	args={{ label: 'ui', selectedId: 'issue_31' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(cardIds(pane)).toEqual(['issue_31', 'issue_33', 'issue_41']);
		await expect(pane.querySelector('[data-slot="lane-count"]')).toHaveTextContent('filtered');
	}}
/>

<Story
	name="Filter with no match"
	args={{
		cards: toBacklogCards(backlogPage.items),
		labels: ['enhancement', 'epic', 'wontfix'],
		label: 'wontfix'
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane).toHaveTextContent('No issues with this label.');
		await expect(pane).not.toHaveTextContent('Backlog clear.');
	}}
/>

<Story
	name="Selected card"
	args={{ selectedId: backlogPageLast.items[0]!.id }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const selected = pane.querySelector('[aria-pressed="true"]');
		await expect(selected).toHaveAttribute('data-issue-id', backlogPageLast.items[0]!.id);
	}}
/>

<Story
	name="Empty"
	args={{ cards: [] }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane).toHaveTextContent('Backlog clear.');
		await expect(pane.querySelector('[data-slot="lane-count"]')).toHaveTextContent('0');
	}}
/>

<Story
	name="Loading"
	args={{ cards: [], fetchedAt: null, status: 'loading' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="backlog-lane"]')).toHaveAttribute(
			'aria-busy',
			'true'
		);
		const placeholders = pane.querySelectorAll('[data-slot="card-placeholder"]');
		await expect(placeholders).toHaveLength(3);
		// Card-shaped: wider than tall, and tall enough to read as a card.
		for (const placeholder of placeholders) {
			const box = placeholder.getBoundingClientRect();
			await expect(box.height).toBeGreaterThan(40);
			await expect(box.width).toBeGreaterThan(box.height);
		}
		await expect(pane.querySelector('[data-slot="card-placeholder"]')).toHaveClass(
			'motion-reduce:animate-none'
		);
		await expect(pane).not.toHaveTextContent('Backlog clear.');
	}}
/>

<Story
	name="Refreshing"
	args={{ refreshing: true }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const refresh = within(pane).getByRole('button', { name: 'Refreshing…' });
		await expect(refresh).toBeDisabled();
	}}
/>

<Story
	name="Tracker unavailable with stale issues"
	args={{ status: 'failed', failure: reason }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const alert = within(pane).getByRole('alert');
		await expect(alert).toHaveTextContent('Backlog unavailable.');
		await expect(alert).toHaveTextContent('GitHub did not answer.');
		await expect(alert).toHaveTextContent('Showing issues from 2026-10-13 11:00 UTC');
		await expect(cardIds(pane)).toHaveLength(cards.length);

		await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
		await expect(args.onretry).toHaveBeenCalledTimes(1);
		await userEvent.click(within(pane).getByRole('button', { name: 'Refresh' }));
		await expect(args.onrefresh).toHaveBeenCalledTimes(1);
	}}
/>

<Story
	name="Failed with nothing loaded"
	args={{ cards: [], fetchedAt: null, status: 'failed', failure: reason }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const alert = within(pane).getByRole('alert');
		await expect(alert).toHaveTextContent('GitHub did not answer.');
		await expect(alert).not.toHaveTextContent('Showing issues from');
		await expect(pane).not.toHaveTextContent('Backlog clear.');
		await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
		await expect(args.onretry).toHaveBeenCalledTimes(1);
	}}
/>

<Story
	name="Partial"
	args={{ cards: toBacklogCards(backlogPage.items), complete: false }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="lane-count"]')).toHaveTextContent('at least 3');
		await expect(pane.querySelector('[data-slot="backlog-partial"]')).toHaveTextContent(
			'Partial list'
		);
	}}
/>

<Story
	name="Tracker rejected the credentials"
	args={{
		cards: [],
		fetchedAt: null,
		status: 'failed',
		failure: asFailure(problemTrackerUnauthorized)
	}}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const alert = within(pane).getByRole('alert');
		const message = pane.querySelector('[data-slot="backlog-failure-message"]')!;
		await expect(message).toHaveTextContent(
			'GitHub rejected the credentials the factory server uses.'
		);
		await expect(message).not.toHaveTextContent('non-200');
		const action = pane.querySelector('[data-slot="backlog-failure-action"]')!;
		const codes = [...action.querySelectorAll('code')].map((code) => code.textContent);
		await expect(codes).toContain("gh api graphql -f query='{ viewer { login } }'");
		await expect(codes).toContain('sbx secret set github --sandbox <name> -t "$(gh auth token)"');
		await expect(codes).toContain('rm -rf ~/.cache/gh');
		await expect(action).toHaveTextContent('"not logged in"');

		const detail = await openDetails(pane);
		await expect(detail).toBeVisible();
		await expect(detail.textContent).toContain('"message": "Bad credentials",');
		await expect(detail.textContent).not.toContain('\\r\\n');
		await expect(detail.textContent).not.toContain('\\"');
		await expect(detail.textContent).toContain('{\n  "message"');

		await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
		await expect(args.onretry).toHaveBeenCalledTimes(1);
	}}
/>

<Story
	name="Tracker refused the request"
	args={{
		cards: [],
		fetchedAt: null,
		status: 'failed',
		failure: asFailure(problemTrackerForbidden)
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="backlog-failure-message"]')).toHaveTextContent(
			'GitHub refused the request (rate limit or missing scope).'
		);
		await expect(pane.querySelector('[data-slot="backlog-failure-action"]')).toHaveTextContent(
			'The token needs repo read access. Try again later if rate limited.'
		);
		const detail = await openDetails(pane);
		await expect(detail).toHaveTextContent(problemTrackerForbidden.detail);
		await expect(within(pane).getByRole('button', { name: 'Retry' })).toBeEnabled();
	}}
/>

<Story
	name="Tracker repository not found"
	args={{
		cards: [],
		fetchedAt: null,
		status: 'failed',
		failure: asFailure(problemTrackerNotFound)
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="backlog-failure-message"]')).toHaveTextContent(
			"The tracker repository wasn't found."
		);
		await expect(pane.querySelector('[data-slot="backlog-failure-action"]')).toHaveTextContent(
			'Check tracker.owner / tracker.repo in .factory/FACTORY.json.'
		);
		const detail = await openDetails(pane);
		await expect(detail).toHaveTextContent(problemTrackerNotFound.detail);
	}}
/>

<Story
	name="gh missing on the factory server"
	args={{
		cards: [],
		fetchedAt: null,
		status: 'failed',
		failure: asFailure(problemTrackerCliMissing)
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="backlog-failure-message"]')).toHaveTextContent(
			"The factory server can't find gh."
		);
		await expect(pane.querySelector('[data-slot="backlog-failure-action"]')).toHaveTextContent(
			'Install the GitHub CLI where the server runs.'
		);
		const detail = await openDetails(pane);
		await expect(detail).toHaveTextContent('spawn gh ENOENT');
	}}
/>

<Story
	name="Unknown tracker failure"
	args={{ cards: [], fetchedAt: null, status: 'failed', failure: asFailure(problemTrackerUnknown) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const message = pane.querySelector('[data-slot="backlog-failure-message"]')!;
		await expect(message).toHaveTextContent('Backlog unavailable.');
		await expect(message).toHaveTextContent(problemTrackerUnknown.detail);
		await expect(pane.querySelector('[data-slot="backlog-failure-action"]')).toBeNull();
		const detail = await openDetails(pane);
		await expect(detail).toHaveTextContent(problemTrackerUnknown.detail);
	}}
/>

<Story
	name="No tracker configured"
	args={{ cards: [], fetchedAt: null, status: 'failed', failure: asFailure(problemNoTracker) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).queryByRole('alert')).toBeNull();
		await expect(pane.querySelector('[data-slot="backlog-failure"]')).toBeNull();
		await expect(pane.querySelector('[data-slot="backlog-no-tracker"]')).toHaveTextContent(
			'No tracker configured. Add tracker to .factory/FACTORY.json.'
		);
		await expect(pane).not.toHaveTextContent('Backlog unavailable.');
		await expect(pane).not.toHaveTextContent('FACTORY.json has no tracker');
		await expect(pane).not.toHaveTextContent('Backlog clear.');
	}}
/>

<Story
	name="Rejected credentials with stale issues"
	args={{ status: 'failed', failure: asFailure(problemTrackerUnauthorized) }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const alert = within(pane).getByRole('alert');
		await expect(alert).toHaveTextContent(
			'GitHub rejected the credentials the factory server uses.'
		);
		await expect(alert).toHaveTextContent('Showing issues from 2026-10-13 11:00 UTC');
		await expect(cardIds(pane)).toHaveLength(cards.length);
		await expect(pane.querySelector('[data-slot="backlog-failure-details"]')).not.toHaveAttribute(
			'open'
		);
		await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
		await expect(args.onretry).toHaveBeenCalledTimes(1);
	}}
/>
