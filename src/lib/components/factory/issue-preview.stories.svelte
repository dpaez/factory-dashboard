<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import IssuePreview from './issue-preview.svelte';
	import { toBacklogCard } from '$lib/factory/backlog';
	import {
		backlogBlockedIssue,
		backlogIssuePlain,
		backlogIssueWithDetails,
		backlogUmbrellaIssue,
		backlogUmbrellaNoChildren
	} from '$lib/factory/fixtures';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const field = (pane: HTMLElement, name: string) =>
		pane.querySelector<HTMLElement>(`[data-field="${name}"]`)!;

	const { Story } = defineMeta({
		title: 'Components/Factory/IssuePreview',
		component: IssuePreview,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'A read-only summary of one backlog issue: title, display reference, labels, availability, "Open in tracker", blockers and sub-issues as links, author, created and updated time, and the description as sanitized markdown. Facts the tracker did not supply read "Unavailable".'
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
