<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent } from 'storybook/test';
	import IssuePreview from './issue-preview.svelte';
	import { toBacklogCard } from '$lib/factory/backlog';
	import {
		backlogBlockedIssue,
		backlogIssuePlain,
		backlogIssueWithDetails,
		backlogUmbrellaIssue,
		backlogUmbrellaNoChildren
	} from '$lib/factory/fixtures';
	import { START_FAILURES, START_REASONS, blockedReason } from '$lib/factory/start';
	import { START_PROBLEMS, startState } from './start-story-states';

	const ready = toBacklogCard(backlogIssueWithDetails);
	const blocked = toBacklogCard(backlogBlockedIssue);
	const umbrella = toBacklogCard(backlogUmbrellaIssue);
	const startButton = (canvasElement: HTMLElement) =>
		firstPane(canvasElement).querySelector<HTMLButtonElement>('[data-slot="start-button"]');
	const failureText = (canvasElement: HTMLElement) =>
		firstPane(canvasElement).querySelector('[data-slot="start-failure"]');
	/** Start sits in the header, and the preview keeps its issue. */
	const expectInHeader = async (canvasElement: HTMLElement, title: string) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('header [data-slot="start-control"]')).not.toBeNull();
		await expect(pane.querySelector('h2')).toHaveTextContent(title);
	};
	const expectDescribedReason = async (canvasElement: HTMLElement, reason: string) => {
		const button = startButton(canvasElement)!;
		await expect(button).toBeDisabled();
		await expect(
			firstPane(canvasElement).querySelector('[data-slot="start-reason"]')
		).toHaveTextContent(reason);
		await expect(button).toHaveAccessibleDescription(reason);
	};

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const field = (pane: HTMLElement, name: string) =>
		pane.querySelector<HTMLElement>(`[data-field="${name}"]`)!;

	const { Story } = defineMeta({
		title: 'Components/Factory/IssuePreview',
		component: IssuePreview,
		args: { onstart: fn(), onresend: fn() },
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'A read-only summary of one backlog issue: title, display reference, labels, availability, "Open in tracker", blockers and sub-issues as links, author, created and updated time, and the description as sanitized markdown. Facts the tracker did not supply read "Unavailable". Given `start`, the header offers Start with the same command states as the BacklogCard.'
				}
			}
		}
	});
</script>

<Story
	name="With description and author"
	args={{ issue: toBacklogCard(backlogIssueWithDetails), id: backlogIssueWithDetails.id }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('h2')).toHaveTextContent(backlogIssueWithDetails.title);
		await expect(pane).toHaveTextContent(backlogIssueWithDetails.displayRef);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Ready');
		await expect(pane.querySelectorAll('[data-slot="issue-label"]')).toHaveLength(2);

		const tracker = pane.querySelector<HTMLAnchorElement>('[data-slot="open-in-tracker"]')!;
		await expect(tracker).toHaveAttribute('href', backlogIssueWithDetails.url);
		await expect(tracker).toHaveAttribute('target', '_blank');
		await expect(tracker).toHaveAttribute('rel', 'noopener noreferrer');
		await expect(tracker).toHaveTextContent('opens in a new tab');

		await expect(field(pane, 'author')).toHaveTextContent('dpaez');
		await expect(field(pane, 'created')).toHaveTextContent('2026-10-01 09:30 UTC');
		await expect(field(pane, 'updated')).toHaveTextContent('2026-10-12 16:45 UTC');

		// Sanitized markdown: structure renders, the XSS payload is inert text.
		const description = field(pane, 'description');
		await expect(description.querySelector('h2')).toHaveTextContent('Why');
		await expect(description.querySelectorAll('li')).toHaveLength(2);
		await expect(description.querySelector('code')).toHaveTextContent('pnpm test');
		// Visible markdown typography: the heading outranks body text, lists keep markers.
		const heading = getComputedStyle(description.querySelector('h2')!);
		const body = getComputedStyle(description.querySelector('p')!);
		await expect(parseFloat(heading.fontSize)).toBeGreaterThan(parseFloat(body.fontSize));
		await expect(Number(heading.fontWeight)).toBeGreaterThanOrEqual(600);
		const list = getComputedStyle(description.querySelector('ul')!);
		await expect(list.listStyleType).toBe('disc');
		await expect(parseFloat(list.paddingLeft)).toBeGreaterThan(0);
		await expect(description.querySelector('script')).toBeNull();
		await expect(description.querySelector('img')).toBeNull();
		await expect(description.querySelector('[onerror]')).toBeNull();
		await expect(description.querySelector('a[href^="javascript:"]')).toBeNull();
		await expect(description).toHaveTextContent('<script>alert("xss")</script>');
		const link = description.querySelector('a')!;
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
		await expect(pane).not.toHaveTextContent(/start/i);
	}}
/>

<Story
	name="Without description and author"
	args={{ issue: toBacklogCard(backlogIssuePlain), id: backlogIssuePlain.id }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		for (const name of ['author', 'created', 'updated', 'description']) {
			await expect(field(pane, name)).toHaveTextContent('Unavailable');
		}
	}}
/>

<Story
	name="Blocked"
	args={{ issue: toBacklogCard(backlogBlockedIssue), id: backlogBlockedIssue.id }}
	play={async ({ canvasElement }) => {
		const blockers = firstPane(canvasElement).querySelector('[data-slot="preview-blockers"]')!;
		const links = blockers.querySelectorAll('[data-slot="issue-link"]');
		await expect(links).toHaveLength(2);
		await expect(links[0]!.tagName).toBe('A');
		await expect(links[0]).toHaveAttribute('target', '_blank');
		// A blocker with no URL is mono text, not a link.
		await expect(links[1]!.tagName).toBe('SPAN');
		await expect(links[1]).toHaveTextContent('KAI-7');
	}}
/>

<Story
	name="Umbrella with sub-issues"
	args={{ issue: toBacklogCard(backlogUmbrellaIssue), id: backlogUmbrellaIssue.id }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelectorAll('[data-slot="preview-sub-issues"] a')).toHaveLength(2);
	}}
/>

<Story
	name="Umbrella without sub-issues"
	args={{ issue: toBacklogCard(backlogUmbrellaNoChildren), id: backlogUmbrellaNoChildren.id }}
	play={async ({ canvasElement }) => {
		await expect(firstPane(canvasElement)).toHaveTextContent('Sub-issues unavailable');
	}}
/>

<Story
	name="Not in the loaded backlog"
	args={{ issue: null, id: 'issue_999' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane).toHaveTextContent('issue_999');
		await expect(pane).toHaveTextContent('Not in the loaded backlog.');
	}}
/>

<Story
	name="Backlog loading"
	args={{ issue: null, id: 'issue_31', loading: true }}
	play={async ({ canvasElement }) => {
		await expect(firstPane(canvasElement)).toHaveTextContent('Loading the backlog');
	}}
/>

<Story
	name="Start: Eligible"
	args={{ issue: ready, id: ready.id, ...startState(ready) }}
	play={async ({ canvasElement, args }) => {
		await expectInHeader(canvasElement, ready.title);
		const start = startButton(canvasElement)!;
		await expect(start).toHaveTextContent('Start');
		await expect(start).toHaveClass('bg-primary');
		await userEvent.click(start);
		await expect(args.onstart).toHaveBeenCalledTimes(1);
		await expect(args.onstart).toHaveBeenLastCalledWith(ready);
	}}
/>

<Story
	name="Start: Blocked"
	args={{ issue: blocked, id: blocked.id, ...startState(blocked) }}
	play={async ({ canvasElement }) => {
		await expectDescribedReason(canvasElement, blockedReason(blocked.blockers));
	}}
/>

<Story
	name="Start: Umbrella"
	args={{ issue: umbrella, id: umbrella.id, ...startState(umbrella) }}
	play={async ({ canvasElement }) => {
		await expect(
			firstPane(canvasElement).querySelectorAll('[data-slot="preview-sub-issues"] a')
		).toHaveLength(2);
		await expectDescribedReason(canvasElement, START_REASONS.umbrella);
	}}
/>

<Story
	name="Start: Submitting"
	args={{ issue: ready, id: ready.id, ...startState(ready, { phase: 'submitting' }) }}
	play={async ({ canvasElement, args }) => {
		const start = startButton(canvasElement)!;
		await expect(start).toHaveTextContent('Starting…');
		await expect(start).toHaveAttribute('aria-busy', 'true');
		await userEvent.dblClick(start);
		start.focus();
		await userEvent.keyboard('{Enter}{Enter}');
		await expect(args.onstart).toHaveBeenCalledTimes(0);
	}}
/>

<Story
	name="Start: Accepted"
	args={{ issue: ready, id: ready.id, ...startState(ready, { phase: 'accepted' }) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectInHeader(canvasElement, ready.title);
		await expect(startButton(canvasElement)).toHaveTextContent('Start accepted');
		await expect(pane.querySelectorAll('[data-slot="status-badge"]')).toHaveLength(1);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Ready');
	}}
/>

<Story
	name="Start: Rejected (umbrella_issue)"
	args={{
		issue: ready,
		id: ready.id,
		...startState(ready, { phase: 'rejected', problem: START_PROBLEMS.umbrella })
	}}
	play={async ({ canvasElement }) => {
		await expectInHeader(canvasElement, ready.title);
		await expect(failureText(canvasElement)).toHaveTextContent(START_FAILURES.umbrella);
		await expect(startButton(canvasElement)).toBeEnabled();
	}}
/>

<Story
	name="Start: Rejected (tracker_unavailable)"
	args={{
		issue: ready,
		id: ready.id,
		...startState(ready, { phase: 'rejected', problem: START_PROBLEMS.tracker, retryable: true })
	}}
	play={async ({ canvasElement }) => {
		await expectInHeader(canvasElement, ready.title);
		await expect(failureText(canvasElement)).toHaveTextContent(START_FAILURES.tracker);
	}}
/>

<Story
	name="Start: Rejected (conflict)"
	args={{
		issue: ready,
		id: ready.id,
		...startState(ready, { phase: 'rejected', problem: START_PROBLEMS.conflict })
	}}
	play={async ({ canvasElement }) => {
		await expectInHeader(canvasElement, ready.title);
		await expect(failureText(canvasElement)).toHaveTextContent(START_FAILURES.conflictRef);
	}}
/>

<Story
	name="Start: Unconfirmed"
	args={{ issue: ready, id: ready.id, ...startState(ready, { phase: 'unconfirmed' }) }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		await expect(failureText(canvasElement)).toHaveTextContent(START_FAILURES.unconfirmed);
		await userEvent.click(pane.querySelector<HTMLButtonElement>('[data-slot="start-resend"]')!);
		await expect(args.onresend).toHaveBeenCalledTimes(1);
		await expect(args.onstart).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Start: Read only"
	args={{ issue: ready, id: ready.id, ...startState(ready, { readOnly: true }) }}
	play={async ({ canvasElement }) => {
		await expectDescribedReason(canvasElement, START_REASONS.readOnly);
	}}
/>

<Story
	name="Start: Read only while submitting"
	args={{
		issue: ready,
		id: ready.id,
		...startState(ready, { phase: 'submitting', readOnly: true })
	}}
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
	args={{ issue: ready, id: ready.id, ...startState(ready, { phase: 'accepted', readOnly: true }) }}
	play={async ({ canvasElement }) => {
		const start = startButton(canvasElement)!;
		await expect(start).not.toHaveTextContent('Start accepted');
		await expect(firstPane(canvasElement).querySelector('[data-slot="start-accepted"]')).toBeNull();
		await expectDescribedReason(canvasElement, START_REASONS.readOnly);
	}}
/>

<Story
	name="Start: Read only while unconfirmed"
	args={{
		issue: ready,
		id: ready.id,
		...startState(ready, { phase: 'unconfirmed', readOnly: true })
	}}
	play={async ({ canvasElement }) => {
		await expect(firstPane(canvasElement).querySelector('[data-slot="start-resend"]')).toBeNull();
		await expectDescribedReason(canvasElement, START_REASONS.readOnly);
	}}
/>
