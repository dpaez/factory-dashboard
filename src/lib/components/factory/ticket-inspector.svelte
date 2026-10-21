<script lang="ts">
	import { X as CloseIcon } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import TicketAttention from '$lib/components/ticket-attention.svelte';
	import TicketHeader from './ticket-header.svelte';
	import TaskList from './task-list.svelte';
	import UsagePanel from './usage-panel.svelte';
	import { formatTimestamp, stageLabel } from '$lib/factory/format';
	import { parseTab, type InspectorState, type InspectorTab } from '$lib/factory/inspector';
	import type { ExecutionView } from '$lib/factory/models';

	/**
	 * The Inspector: one ticket execution's header and Source, its attention
	 * requests, and the Tasks, Activity, Evidence and Usage tabs. It takes a
	 * read state and never fetches or navigates: the tab follows `tab`, and
	 * choosing one reports it through `ontabchange`. Links come from
	 * `hrefForExecution`, so the same Inspector works on the board and on the
	 * ticket page. `onclose` adds Close; `openHref` adds an "Open ticket" link.
	 */
	const uid = $props.id();

	let {
		state: view,
		tab,
		ontabchange,
		hrefForExecution,
		onclose,
		openHref,
		onretry,
		headingId = `${uid}-heading`
	}: {
		state: InspectorState;
		/** The shown tab. */
		tab: InspectorTab;
		/** Called with the tab the operator chose; the caller updates `tab`. */
		ontabchange: (tab: InspectorTab) => void;
		/** The href that shows execution `n` in this placement. */
		hrefForExecution: (execution: number) => string;
		/** Closes the Inspector; no Close control without it. */
		onclose?: () => void;
		/** The ticket page for this execution; the board shows it as "Open ticket". */
		openHref?: string;
		/** Retries a failed read; no Retry control without it. */
		onretry?: () => void;
		/** The title's id, so the page can focus it. */
		headingId?: string;
	} = $props();

	// One report per choice. The Tabs root stays on `tab` until the parent
	// updates it, so focus activation and the click (or a repeated press) can
	// each ask for the same tab: report a tab only when it differs from the last
	// one reported since `tab` last changed.
	let lastReported: InspectorTab | null = null;
	$effect.pre(() => {
		void tab;
		lastReported = null;
	});
	function choose(raw: string) {
		const next = parseTab(raw);
		if (next === (lastReported ?? tab)) return;
		lastReported = next;
		ontabchange(next);
	}

	const detail = $derived(view.kind === 'loaded' ? view.detail : null);
	const ticketKey = $derived(
		view.kind === 'loaded'
			? view.detail.header.key
			: view.kind === 'not_found' || view.kind === 'loading'
				? view.key
				: undefined
	);
	const shownExecution = $derived(
		view.kind === 'loaded'
			? view.detail.header.execution
			: view.kind === 'not_found'
				? view.execution
				: undefined
	);

	const hrefFor = (execution: ExecutionView) => hrefForExecution(execution.generation);

	const latestRun = $derived(
		detail
			? [...detail.runs]
					.filter((run) => run.activity !== null && run.activity !== '')
					.sort((a, b) => b.sequence - a.sequence)[0]
			: undefined
	);

	const LINK =
		'font-mono underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/30';
	const PANEL = 'flex flex-col gap-3 pt-2';
</script>

{#snippet closeControl()}
	{#if onclose}
		<Button variant="ghost" size="icon" aria-label="Close inspector" onclick={onclose}>
			<CloseIcon aria-hidden="true" />
		</Button>
	{/if}
{/snippet}

{#snippet placeholder(text: string)}
	<p class="font-mono text-foreground/75" data-slot="tab-placeholder">{text}</p>
{/snippet}

<section
	aria-labelledby={headingId}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	data-testid="ticket-inspector"
	data-state={view.kind}
	data-ticket-key={ticketKey}
	data-execution={shownExecution}
	class="not-prose flex min-w-0 flex-col gap-6 text-xs/relaxed text-foreground"
>
	{#if openHref}
		<p class="flex justify-end">
			<a class={LINK} href={openHref}>Open ticket</a>
		</p>
	{/if}

	{#if view.kind === 'loaded'}
		{@const loaded = view.detail}
		<TicketHeader
			header={loaded.header}
			executions={loaded.executions}
			{hrefFor}
			{onclose}
			{headingId}
		/>

		{#if loaded.attention.length > 0}
			<div class="flex flex-col gap-2" data-slot="inspector-attention">
				<h3 class="text-[0.625rem] font-medium text-foreground/75">Attention requests</h3>
				<TicketAttention attention={loaded.attention} />
			</div>
		{/if}

		<Tabs.Root bind:value={() => tab, choose} data-testid="inspector-tabs">
			<Tabs.List aria-label="Inspector sections">
				<Tabs.Trigger value="tasks">Tasks</Tabs.Trigger>
				<Tabs.Trigger value="activity">Activity</Tabs.Trigger>
				<Tabs.Trigger value="evidence">Evidence</Tabs.Trigger>
				<Tabs.Trigger value="usage">Usage</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="tasks" class={PANEL}>
				<p class="font-mono text-foreground/75 tabular-nums" data-testid="tasks-progress">
					{loaded.header.progress.done}/{loaded.header.progress.total} tasks done
				</p>
				<TaskList tasks={loaded.tasks} stage={loaded.header.stage} />
			</Tabs.Content>
			<Tabs.Content value="activity" class={PANEL}>
				{@render placeholder('Activity is not available yet.')}
				{#if latestRun}
					<div class="flex flex-col gap-1 bg-card p-3 font-mono" data-testid="latest-activity">
						<p class="text-foreground/75 tabular-nums">
							Latest activity · run {latestRun.sequence} · {stageLabel(latestRun.stage)} · {formatTimestamp(
								latestRun.endedAt ?? latestRun.startedAt
							)}
						</p>
						<p class="font-sans whitespace-pre-wrap">{latestRun.activity}</p>
					</div>
				{/if}
			</Tabs.Content>
			<Tabs.Content value="evidence" class={PANEL}>
				{@render placeholder('Evidence is not available yet.')}
			</Tabs.Content>
			<Tabs.Content value="usage" class={PANEL}>
				<UsagePanel
					execution={loaded.header.execution}
					usage={loaded.usage}
					runs={loaded.runs}
					runsComplete={view.runsComplete}
				/>
			</Tabs.Content>
		</Tabs.Root>
	{:else}
		<div class="flex items-start justify-between gap-4">
			<div class="flex min-w-0 flex-col gap-2">
				{#if view.kind === 'loading'}
					<h2 id={headingId} tabindex="-1" class="text-2xl font-light outline-none">
						Loading ticket…
					</h2>
					{#if view.key}
						<span class="font-mono break-all text-foreground/75" data-testid="ticket-key"
							>{view.key}</span
						>
					{/if}
					<div aria-hidden="true" class="flex flex-col gap-2" data-slot="inspector-skeleton">
						<div class="h-4 w-48 animate-pulse bg-muted"></div>
						<div class="h-4 w-72 animate-pulse bg-muted"></div>
						<div class="h-4 w-32 animate-pulse bg-muted"></div>
					</div>
				{:else if view.kind === 'not_found'}
					<h2 id={headingId} tabindex="-1" class="text-2xl font-light outline-none">
						{view.execution === undefined ? 'No such ticket' : 'No such execution'}
					</h2>
					<p class="font-mono break-all text-foreground/75" data-testid="not-found-key">
						{view.key}{#if view.execution !== undefined}
							· Execution <span class="tabular-nums">{view.execution}</span>{/if}
					</p>
				{:else}
					<h2 id={headingId} tabindex="-1" class="text-2xl font-light outline-none">
						{view.title}
					</h2>
					<p class="font-mono text-foreground/75">The ticket could not be read.</p>
					{#if view.retryable && onretry}
						<div>
							<Button variant="secondary" onclick={onretry}>Retry</Button>
						</div>
					{/if}
				{/if}
			</div>
			{@render closeControl()}
		</div>
	{/if}
</section>
