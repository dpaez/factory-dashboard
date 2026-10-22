<script lang="ts">
	import { X as CloseIcon } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import AgentMessage from '$lib/components/agent-message.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import TicketAttention from '$lib/components/ticket-attention.svelte';
	import TicketHeader from './ticket-header.svelte';
	import TaskList from './task-list.svelte';
	import UsagePanel from './usage-panel.svelte';
	import RunTimeline from './run-timeline.svelte';
	import EvidencePanel from './evidence-panel.svelte';
	import { formatTimestamp, stageLabel } from '$lib/factory/format';
	import {
		parseTab,
		type InspectorState,
		type InspectorTab,
		type RunDetailSource
	} from '$lib/factory/inspector';
	import type { ExecutionView, RunView } from '$lib/factory/models';

	/**
	 * The Inspector: one ticket execution's header and Source, its attention
	 * requests, and the Tasks, Activity, Evidence and Usage tabs. It takes a
	 * read state and never fetches or navigates: the tab follows `tab`, and
	 * choosing one reports it through `ontabchange`. Links come from
	 * `hrefForExecution`, so the same Inspector works on the board and on the
	 * ticket page. `onclose` adds Close; `openHref` adds an "Open ticket" link.
	 *
	 * Activity shows the run timeline and the latest activity; Evidence shows
	 * one run's evidence. The selected run follows `run`, and choosing one
	 * reports it through `onrunchange`. Run detail comes from `runDetail`: the
	 * Inspector asks it to load a run only when Activity has a selection or
	 * Evidence is shown, so Tasks and Usage never read a run. A run read that
	 * fails stays inside its panel.
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
		run = null,
		onrunchange,
		runDetail,
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
		/** The selected run id, from the URL; null for no selection. */
		run?: string | null;
		/** Called with the run the operator chose; the caller updates `run`. */
		onrunchange?: (id: string | null) => void;
		/** Where run detail comes from: the placement's cache, or a static source in stories. */
		runDetail?: RunDetailSource;
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

	const runs: RunView[] = $derived(detail?.runs ?? []);
	const execution = $derived(detail?.header.execution ?? 0);
	/** The URL's run when it is one of the shown execution's runs; else nothing is selected. */
	const selectedRun = $derived(run === null ? undefined : runs.find((item) => item.id === run));
	/** A `run` that names no run of this execution: noted inline, never read. */
	const unknownRun = $derived(run !== null && selectedRun === undefined ? run : null);
	const newestRun = $derived(
		runs.length === 0 ? undefined : runs.reduce((a, b) => (b.sequence > a.sequence ? b : a))
	);
	const hasActivity = (item: RunView | undefined) =>
		item !== undefined && item.activity !== null && item.activity !== '';
	const activityRun = $derived(
		hasActivity(selectedRun)
			? selectedRun
			: runs
					.filter(hasActivity)
					.reduce<RunView | undefined>((a, b) => (a && a.sequence > b.sequence ? a : b), undefined)
	);
	/** Evidence shows the selected run, or the newest one when the URL names none. */
	const evidenceRun = $derived(selectedRun ?? (run === null ? newestRun : undefined));

	/** The run this tab needs read: Activity's selection, or Evidence's run. */
	const runToLoad = $derived(
		tab === 'activity' ? selectedRun?.id : tab === 'evidence' ? evidenceRun?.id : undefined
	);
	$effect(() => {
		const id = runToLoad;
		const source = runDetail;
		const shown = execution;
		if (id === undefined || !source || detail === null) return;
		untrack(() => void source.load(shown, id));
	});

	// One report per choice, as for tabs: a repeated press before `run`
	// catches up reports nothing.
	let lastRunReported: string | null | undefined = undefined;
	$effect.pre(() => {
		void run;
		lastRunReported = undefined;
	});
	function chooseRun(id: string | null) {
		if (!onrunchange) return;
		if (id === (lastRunReported === undefined ? (selectedRun?.id ?? null) : lastRunReported))
			return;
		lastRunReported = id;
		onrunchange(id);
	}

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

{#snippet runEvidence(item: RunView, caption?: string)}
	{#if runDetail}
		<EvidencePanel
			state={runDetail.view(execution, item.id)}
			onretry={() => void runDetail?.retry(execution, item.id)}
			{caption}
		/>
	{/if}
{/snippet}

{#snippet unknownRunNote(id: string)}
	<p class="font-mono break-all text-foreground/75" data-testid="run-unknown">
		Run {id} is not in this execution.
	</p>
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
			<!-- Activity and Evidence render only while shown: a hidden panel holds no run. -->
			<Tabs.Content value="activity" class={PANEL}>
				{#if tab === 'activity'}
					{#if activityRun}
						<div data-testid="latest-activity">
							<AgentMessage
								label="Latest activity"
								agentName={`${stageLabel(activityRun.stage)} · run ${activityRun.sequence}`}
								content={activityRun.activity ?? ''}
								createdAt={formatTimestamp(activityRun.endedAt ?? activityRun.startedAt)}
							/>
						</div>
					{/if}
					{#if unknownRun !== null}
						{@render unknownRunNote(unknownRun)}
					{/if}
					<RunTimeline
						{runs}
						runsComplete={view.runsComplete}
						selected={selectedRun?.id ?? null}
						onselect={chooseRun}
					/>
					{#if selectedRun}
						{@render runEvidence(selectedRun)}
					{/if}
				{/if}
			</Tabs.Content>
			<Tabs.Content value="evidence" class={PANEL}>
				{#if tab === 'evidence'}
					{#if unknownRun !== null}
						{@render unknownRunNote(unknownRun)}
					{:else if evidenceRun === undefined}
						<p class="font-mono text-foreground/75" data-testid="evidence-empty">
							No runs yet for this execution.
						</p>
					{:else}
						{@render runEvidence(evidenceRun, selectedRun ? undefined : 'Latest run')}
					{/if}
				{/if}
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
