<script lang="ts">
	import type { BacklogCardModel } from '$lib/factory/backlog';
	import { formatTimestamp } from '$lib/factory/format';
	import { renderMarkdown } from '$lib/factory/markdown';
	import { Badge } from '$lib/components/ui/badge';
	import IssueLink from './issue-link.svelte';
	import StatusBadge from './status-badge.svelte';
	import StartControl, { type StartState } from './start-control.svelte';

	/**
	 * The Issue preview: a read-only summary of one backlog issue, shown in
	 * the region below the board. Facts the tracker did not supply read
	 * "Unavailable". Given only an id (`issue` null), it says the issue is not
	 * in the loaded backlog, or that the backlog is still loading. Given
	 * `start`, the header offers Start and shows its command state; a rejected
	 * start keeps the preview and shows the reason.
	 */
	let {
		issue,
		id,
		loading = false,
		start,
		phase = 'idle',
		explanation = null,
		onstart,
		onresend
	}: {
		issue: BacklogCardModel | null;
		/** The selected id; shown when the issue is not in the loaded backlog. */
		id: string;
		/** The backlog has not loaded yet. */
		loading?: boolean;
		/** Start availability from `startAvailability`; no Start control without it. */
		start?: StartState['start'];
		phase?: StartState['phase'];
		explanation?: StartState['explanation'];
		onstart?: (issue: BacklogCardModel) => void;
		/** Resend an unconfirmed start under the same intent id. */
		onresend?: (issue: BacklogCardModel) => void;
	} = $props();

	/** Markdown typography: visible heading hierarchy, list markers and indentation. */
	const MARKDOWN = [
		'flex min-w-0 flex-col gap-2 text-xs/relaxed wrap-anywhere text-foreground',
		'[&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold',
		'[&_h3]:text-xs [&_h3]:font-semibold [&_h4]:text-xs [&_h4]:font-medium',
		'[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
		'[&_a]:underline [&_a]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-ring/30',
		'[&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_pre]:overflow-x-auto [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:p-0',
		'[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-foreground/75',
		'[&_hr]:border-border [&_img]:max-w-full [&_strong]:font-semibold [&_em]:italic'
	].join(' ');

	const uid = $props.id();
	const headingId = `${uid}-heading`;
	const description = $derived(
		issue?.description == null ? null : renderMarkdown(issue.description)
	);
</script>

<article
	data-slot="issue-preview"
	data-issue-id={id}
	aria-labelledby={headingId}
	class="not-prose flex min-w-0 flex-col gap-4 bg-card p-4 text-xs/relaxed text-card-foreground ring-1 ring-foreground/10"
>
	{#if issue === null}
		<h2 id={headingId} class="text-[0.625rem] font-medium text-foreground/75">Issue preview</h2>
		<p class="flex flex-wrap items-baseline gap-x-2">
			<span class="font-mono break-all text-foreground tabular-nums">{id}</span>
			<span class="text-foreground/75">
				{loading ? 'Loading the backlog…' : 'Not in the loaded backlog.'}
			</span>
		</p>
	{:else}
		<header class="flex min-w-0 flex-col gap-1">
			<span class="text-[0.625rem] font-medium text-foreground/75">Issue preview</span>
			<span class="font-mono text-[0.625rem] break-all text-foreground/75 tabular-nums"
				>{issue.displayRef}</span
			>
			<h2 id={headingId} class="text-base font-medium wrap-anywhere text-foreground">
				{issue.title}
			</h2>
			<div class="flex min-w-0 flex-wrap items-center gap-1">
				<StatusBadge
					label={issue.availability.badge.label}
					signal={issue.availability.badge.signal}
				/>
				{#each issue.labels as label (label)}
					<Badge
						variant="outline"
						data-slot="issue-label"
						class="h-auto max-w-full text-left wrap-anywhere whitespace-normal">{label}</Badge
					>
				{/each}
			</div>
			<a
				href={issue.url}
				target="_blank"
				rel="noopener noreferrer"
				data-slot="open-in-tracker"
				class="self-start underline outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
			>
				Open in tracker <span aria-hidden="true">↗</span><span class="sr-only"
					>(opens in a new tab)</span
				>
			</a>
			{#if start}
				<StartControl
					class="pt-2"
					{start}
					{phase}
					{explanation}
					onstart={() => onstart?.(issue)}
					onresend={() => onresend?.(issue)}
				/>
			{/if}
		</header>

		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
			<dt class="text-foreground/75">Author</dt>
			<dd data-field="author" class="wrap-anywhere text-foreground">
				{issue.author ?? 'Unavailable'}
			</dd>
			<dt class="text-foreground/75">Created</dt>
			<dd data-field="created" class="font-mono text-foreground tabular-nums">
				{issue.createdAt === null ? 'Unavailable' : formatTimestamp(issue.createdAt)}
			</dd>
			<dt class="text-foreground/75">Updated</dt>
			<dd data-field="updated" class="font-mono text-foreground tabular-nums">
				{issue.updatedAt === null ? 'Unavailable' : formatTimestamp(issue.updatedAt)}
			</dd>
		</dl>

		{#if issue.blockers.length > 0}
			<div data-slot="preview-blockers" class="flex flex-col gap-1">
				<h3 class="text-[0.625rem] font-medium text-foreground/75">Blocked by</h3>
				<ul class="flex flex-col gap-1">
					{#each issue.blockers as blocker (blocker.displayRef)}
						<li class="min-w-0"><IssueLink link={blocker} /></li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if issue.availability.kind === 'umbrella'}
			<div data-slot="preview-sub-issues" class="flex flex-col gap-1">
				<h3 class="text-[0.625rem] font-medium text-foreground/75">Sub-issues</h3>
				{#if issue.children.length > 0}
					<ul class="flex flex-col gap-1">
						{#each issue.children as child (child.displayRef)}
							<li class="min-w-0"><IssueLink link={child} /></li>
						{/each}
					</ul>
				{:else}
					<p class="text-foreground/75">Sub-issues unavailable. See the tracker.</p>
				{/if}
			</div>
		{/if}

		<div class="flex flex-col gap-1">
			<h3 class="text-[0.625rem] font-medium text-foreground/75">Description</h3>
			{#if description === null}
				<p data-field="description" class="text-foreground">Unavailable</p>
			{:else}
				<!--
					Typography plugin `prose` cannot nest under a `not-prose` ancestor (the
					board, the page regions and the Storybook panes all are), so the
					markdown is styled with explicit descendant utilities instead.
				-->
				<div data-field="description" data-slot="markdown" class={MARKDOWN}>
					<!-- The only {@html} in the app: renderMarkdown escapes raw HTML and filters URLs. -->
					{@html description}
				</div>
			{/if}
		</div>
	{/if}
</article>
