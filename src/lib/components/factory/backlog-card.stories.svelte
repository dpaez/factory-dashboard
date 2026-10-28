<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent } from 'storybook/test';
	import BacklogCard from './backlog-card.svelte';
	import { toBacklogCard } from '$lib/factory/backlog';
	import {
		backlogBlockedIssue,
		backlogBlockedUmbrella,
		backlogIssueManyLabels,
		backlogIssuePlain,
		backlogUmbrellaIssue,
		backlogUmbrellaNoChildren
	} from '$lib/factory/fixtures';
	import { START_FAILURES, START_REASONS, blockedReason } from '$lib/factory/start';
	import { START_PROBLEMS, startState } from './start-story-states';

	const ready = toBacklogCard(backlogIssuePlain);
	const blocked = toBacklogCard(backlogBlockedIssue);
	const umbrella = toBacklogCard(backlogUmbrellaIssue);
	const startButton = (canvasElement: HTMLElement) =>
		firstPane(canvasElement).querySelector<HTMLButtonElement>('[data-slot="start-button"]')!;
	const startOf = (canvasElement: HTMLElement) =>
		firstPane(canvasElement).querySelector<HTMLElement>('[data-slot="start-control"]')!;

	/** The disabled Start's reason is visible and named by aria-describedby. */
	const expectDescribedReason = async (canvasElement: HTMLElement, reason: string) => {
		const button = startButton(canvasElement);
		await expect(button).toBeDisabled();
		const ids = (button.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
		const pane = firstPane(canvasElement);
		const texts = ids.map((id) => pane.querySelector(`[id="${id}"]`)?.textContent?.trim());
		await expect(texts).toContain(reason);
		await expect(button).toHaveAccessibleDescription(reason);
	};

	/** Start is a sibling of the selection button, never inside it. */
	const expectSibling = async (canvasElement: HTMLElement) => {
		await expect(cardButton(canvasElement).querySelector('button, a')).toBeNull();
		await expect(cardButton(canvasElement).contains(startOf(canvasElement))).toBe(false);
	};

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const cardButton = (canvasElement: HTMLElement) =>
		firstPane(canvasElement).querySelector<HTMLElement>('[data-slot="backlog-card-button"]')!;

	/** No Start control, whatever its wording (#30). */
	const expectNoStart = async (canvasElement: HTMLElement) => {
		await expect(canvasElement).not.toHaveTextContent(/start/i);
	};

	const { Story } = defineMeta({
		title: 'Components/Factory/BacklogCard',
		component: BacklogCard,
		args: { onselect: fn(), onstart: fn(), onresend: fn() },
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'One backlog issue. The card is a single selection button (aria-pressed) with its display reference, title, plain outline labels and availability: Ready, Blocked (with blocker refs) or Umbrella. An umbrella issue lists its sub-issue links after the button. Given `start`, a Beacon Yellow Start follows as a sibling with its command state: disabled with a written reason, Starting…, Start accepted, a rejection reason, or Resend for an unconfirmed start. Without `start`, no Start control.'
				}
			}
		}
	});
</script>

<Story
	name="Ready"
	args={{ card: toBacklogCard(backlogIssuePlain) }}
	play={async ({ canvasElement, args }) => {
		const button = cardButton(canvasElement);
		await expect(button.tagName).toBe('BUTTON');
		await expect(button).toHaveAttribute('data-issue-id', backlogIssuePlain.id);
		await expect(button).toHaveAttribute('aria-pressed', 'false');
		await expect(button).toHaveTextContent(backlogIssuePlain.displayRef);
		await expect(button).toHaveTextContent(backlogIssuePlain.title);
		await expect(button.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Ready');
		await expect(button.querySelector('[data-slot="status-badge"]')).toHaveAttribute(
			'data-signal',
			'standby'
		);
		await expect(button.querySelector('[data-slot="issue-label"]')).toHaveTextContent(
			'enhancement'
		);
		await expect(button.querySelector('a, button')).toBeNull();
		await expectNoStart(canvasElement);

		// Tab focuses the card; Enter and Space select it.
		(document.activeElement as HTMLElement | null)?.blur();
		await userEvent.tab();
		await expect(button).toHaveFocus();
		await userEvent.keyboard('{Enter}');
		await expect(args.onselect).toHaveBeenLastCalledWith(backlogIssuePlain.id);
		await userEvent.keyboard(' ');
		await expect(args.onselect).toHaveBeenCalledTimes(2);
		await expect(args.onselect).toHaveBeenLastCalledWith(backlogIssuePlain.id);
	}}
/>

<Story
	name="Blocked"
	args={{ card: toBacklogCard(backlogBlockedIssue) }}
	play={async ({ canvasElement }) => {
		const button = cardButton(canvasElement);
		const badge = button.querySelector('[data-slot="status-badge"]');
		await expect(badge).toHaveTextContent('Blocked');
		await expect(badge).toHaveAttribute('data-signal', 'wait');
		await expect(button.querySelector('[data-slot="blocked-by"]')).toHaveTextContent(
			'dpaez/factory-dashboard#21, KAI-7'
		);
		await expectNoStart(canvasElement);
	}}
/>

<Story
	name="Umbrella with sub-issues"
	args={{ card: toBacklogCard(backlogUmbrellaIssue) }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const button = cardButton(canvasElement);
		const badge = button.querySelector('[data-slot="status-badge"]');
		await expect(badge).toHaveTextContent('Umbrella');
		await expect(badge).toHaveAttribute('data-signal', 'standby');
		// Sub-issue links sit after the button, never inside it.
		await expect(button.querySelector('a')).toBeNull();
		const links = pane.querySelectorAll<HTMLAnchorElement>('[data-slot="sub-issues"] a');
		await expect(links).toHaveLength(2);
		await expect(links[0]).toHaveAttribute('target', '_blank');
		await expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');

		// Tab order: the card, then its sub-issue links.
		(document.activeElement as HTMLElement | null)?.blur();
		await userEvent.tab();
		await expect(button).toHaveFocus();
		await userEvent.tab();
		await expect(links[0]).toHaveFocus();
		await userEvent.tab();
		await expect(links[1]).toHaveFocus();
		await expectNoStart(canvasElement);

		// Enter and Space on the card select its issue.
		button.focus();
		await userEvent.keyboard('{Enter}');
		await userEvent.keyboard(' ');
		await expect(args.onselect).toHaveBeenCalledTimes(2);
		await expect(args.onselect).toHaveBeenLastCalledWith(backlogUmbrellaIssue.id);
	}}
/>

<Story
	name="Umbrella without sub-issues"
	args={{ card: toBacklogCard(backlogUmbrellaNoChildren) }}
	play={async ({ canvasElement }) => {
		await expect(firstPane(canvasElement)).toHaveTextContent('Sub-issues unavailable');
	}}
/>

<Story
	name="Blocked umbrella"
	args={{ card: toBacklogCard(backlogBlockedUmbrella) }}
	play={async ({ canvasElement }) => {
		const button = cardButton(canvasElement);
		await expect(button.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Umbrella');
		await expect(button).toHaveTextContent('Blocked by dpaez/factory-dashboard#22');
	}}
/>

<Story
	name="Many labels"
	args={{ card: toBacklogCard(backlogIssueManyLabels) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const card = pane.querySelector<HTMLElement>('[data-slot="backlog-card"]')!;
		const labels = card.querySelectorAll<HTMLElement>('[data-slot="issue-label"]');
		await expect(labels).toHaveLength(backlogIssueManyLabels.labels.length);
		// Plain outline badges: never a signal tone.
		for (const label of labels) await expect(label).not.toHaveAttribute('data-signal');
		await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
		// Uncoloured: one neutral fill and ink for every label, with an outline; they wrap
		// onto several rows and stay inside the narrow card.
		const styles = new Set(
			[...labels].map((l) => `${getComputedStyle(l).backgroundColor}|${getComputedStyle(l).color}`)
		);
		await expect(styles.size).toBe(1);
		const right = card.getBoundingClientRect().right;
		for (const label of labels) {
			await expect(parseFloat(getComputedStyle(label).borderTopWidth)).toBeGreaterThan(0);
			await expect(label.getBoundingClientRect().right).toBeLessThanOrEqual(right + 1);
		}
		const rows = new Set([...labels].map((l) => Math.round(l.getBoundingClientRect().top)));
		await expect(rows.size).toBeGreaterThan(1);
	}}
>
	{#snippet template(args)}
		<div class="w-56">
			<BacklogCard {...args} />
		</div>
	{/snippet}
</Story>

<Story
	name="Selected"
	args={{ card: toBacklogCard(backlogIssuePlain), selected: true }}
	play={async ({ canvasElement }) => {
		await expect(cardButton(canvasElement)).toHaveAttribute('aria-pressed', 'true');
	}}
/>

<Story
	name="Start: Eligible"
	args={{ card: ready, ...startState(ready) }}
	play={async ({ canvasElement, args }) => {
		const start = startButton(canvasElement);
		await expect(start).toHaveTextContent('Start');
		await expect(start).toBeEnabled();
		// Beacon Yellow: the primary fill.
		await expect(start).toHaveClass('bg-primary');
		await expect(
			cardButton(canvasElement).querySelector('[data-slot="status-badge"]')
		).toHaveTextContent('Ready');
		await expectSibling(canvasElement);
		await userEvent.click(start);
		await expect(args.onstart).toHaveBeenCalledTimes(1);
		await expect(args.onstart).toHaveBeenLastCalledWith(ready);
		// The selection button still selects, and does not start.
		await userEvent.click(cardButton(canvasElement));
		await expect(args.onselect).toHaveBeenLastCalledWith(ready.id);
		await expect(args.onstart).toHaveBeenCalledTimes(1);
	}}
/>

<Story
	name="Start: Blocked"
	args={{ card: blocked, ...startState(blocked) }}
	play={async ({ canvasElement, args }) => {
		await expect(cardButton(canvasElement)).toHaveTextContent('dpaez/factory-dashboard#21, KAI-7');
		await expectDescribedReason(canvasElement, blockedReason(blocked.blockers));
		await userEvent.click(startButton(canvasElement), { pointerEventsCheck: 0 });
		await expect(args.onstart).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Start: Umbrella"
	args={{ card: umbrella, ...startState(umbrella) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(
			cardButton(canvasElement).querySelector('[data-slot="status-badge"]')
		).toHaveTextContent('Umbrella');
		await expect(pane.querySelectorAll('[data-slot="sub-issues"] a')).toHaveLength(2);
		await expectDescribedReason(canvasElement, START_REASONS.umbrella);
	}}
/>

<Story
	name="Start: Submitting"
	args={{ card: ready, ...startState(ready, { phase: 'submitting' }) }}
	play={async ({ canvasElement, args }) => {
		const start = startButton(canvasElement);
		await expect(start).toHaveTextContent('Starting…');
		await expect(start).toHaveAttribute('aria-busy', 'true');
		await expect(start).toHaveAttribute('aria-disabled', 'true');
		// A double-click and repeated Enter never call onstart again.
		await userEvent.dblClick(start);
		start.focus();
		await userEvent.keyboard('{Enter}{Enter}');
		await expect(args.onstart).toHaveBeenCalledTimes(0);
	}}
/>

<Story
	name="Start: Accepted"
	args={{ card: ready, ...startState(ready, { phase: 'accepted' }) }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		await expect(startButton(canvasElement)).toHaveTextContent('Start accepted');
		await expect(pane.querySelector('[data-slot="start-accepted"]')).not.toBeNull();
		// Accepted is not running: the card keeps its backlog badge, no stage is invented.
		const badges = pane.querySelectorAll('[data-slot="status-badge"]');
		await expect(badges).toHaveLength(1);
		await expect(badges[0]).toHaveTextContent('Ready');
		await expect(pane).not.toHaveTextContent(/running|plan/i);
		await userEvent.click(startButton(canvasElement));
		await expect(args.onstart).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Start: Rejected (umbrella_issue)"
	args={{
		card: ready,
		...startState(ready, { phase: 'rejected', problem: START_PROBLEMS.umbrella })
	}}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="start-failure"]')).toHaveTextContent(
			START_FAILURES.umbrella
		);
		await expect(startButton(canvasElement)).toHaveAccessibleDescription(START_FAILURES.umbrella);
		// Still eligible: Start is enabled again.
		await userEvent.click(startButton(canvasElement));
		await expect(args.onstart).toHaveBeenCalledTimes(1);
	}}
/>

<Story
	name="Start: Rejected (tracker_unavailable)"
	args={{
		card: ready,
		...startState(ready, { phase: 'rejected', problem: START_PROBLEMS.tracker, retryable: true })
	}}
	play={async ({ canvasElement }) => {
		await expect(
			firstPane(canvasElement).querySelector('[data-slot="start-failure"]')
		).toHaveTextContent(START_FAILURES.tracker);
		await expect(startButton(canvasElement)).toBeEnabled();
	}}
/>

<Story
	name="Start: Rejected (conflict)"
	args={{
		card: ready,
		...startState(ready, { phase: 'rejected', problem: START_PROBLEMS.conflict })
	}}
	play={async ({ canvasElement }) => {
		const failure = firstPane(canvasElement).querySelector('[data-slot="start-failure"]')!;
		await expect(failure).toHaveTextContent(START_FAILURES.conflictRef);
		await expect(failure).not.toHaveTextContent(/ticket changed/i);
	}}
/>

<Story
	name="Start: Unconfirmed"
	args={{ card: ready, ...startState(ready, { phase: 'unconfirmed' }) }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="start-button"]')).toBeNull();
		await expect(pane.querySelector('[data-slot="start-failure"]')).toHaveTextContent(
			START_FAILURES.unconfirmed
		);
		const resend = pane.querySelector<HTMLButtonElement>('[data-slot="start-resend"]')!;
		await expect(resend).toHaveAccessibleDescription(START_FAILURES.unconfirmed);
		await userEvent.click(resend);
		await expect(args.onresend).toHaveBeenCalledTimes(1);
		await expect(args.onresend).toHaveBeenLastCalledWith(ready);
		await expect(args.onstart).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Start: Read only"
	args={{ card: ready, ...startState(ready, { readOnly: true }) }}
	play={async ({ canvasElement }) => {
		await expectDescribedReason(canvasElement, START_REASONS.readOnly);
	}}
/>

<Story
	name="Start: Read only while submitting"
	args={{ card: ready, ...startState(ready, { phase: 'submitting', readOnly: true }) }}
	play={async ({ canvasElement, args }) => {
		// Read-only access outranks the pending phase: the access reason, not "Starting…".
		const start = startButton(canvasElement)!;
		await expect(start).toHaveTextContent('Start');
		await expect(start).not.toHaveTextContent('Starting');
		await expect(start).not.toHaveAttribute('aria-busy');
		await expectDescribedReason(canvasElement, START_REASONS.readOnly);
		await userEvent.click(start, { pointerEventsCheck: 0 });
		await expect(args.onstart).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Start: Read only while accepted"
	args={{ card: ready, ...startState(ready, { phase: 'accepted', readOnly: true }) }}
	play={async ({ canvasElement }) => {
		const start = startButton(canvasElement)!;
		await expect(start).not.toHaveTextContent('Start accepted');
		await expect(firstPane(canvasElement).querySelector('[data-slot="start-accepted"]')).toBeNull();
		await expectDescribedReason(canvasElement, START_REASONS.readOnly);
	}}
/>

<Story
	name="Start: Read only while unconfirmed"
	args={{ card: ready, ...startState(ready, { phase: 'unconfirmed', readOnly: true }) }}
	play={async ({ canvasElement }) => {
		await expect(firstPane(canvasElement).querySelector('[data-slot="start-resend"]')).toBeNull();
		await expectDescribedReason(canvasElement, START_REASONS.readOnly);
	}}
/>
