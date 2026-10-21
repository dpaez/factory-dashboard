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
		args: { onselect: fn() },
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'One backlog issue. The card is a single selection button (aria-pressed) with its display reference, title, plain outline labels and availability: Ready, Blocked (with blocker refs) or Umbrella. An umbrella issue lists its sub-issue links after the button. Read-only: no Start control.'
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
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const button = cardButton(canvasElement);
		await expect(button.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Umbrella');
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
