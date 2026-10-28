<script lang="ts">
	import { X as CloseIcon } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import Timeline from '$lib/components/timeline.svelte';
	import StatusBadge from './status-badge.svelte';
	import { formatTimestamp, stageLabel } from '$lib/factory/format';
	import type { ExecutionView, TicketHeader } from '$lib/factory/models';
	import { executionStatusSignal } from '$lib/factory/status';

	/**
	 * The Inspector's header: the ticket's identity, the shown execution with
	 * its history, the status and why, the current task and round, the pull
	 * request, tracker warnings (apart from failures), the lifecycle locator and
	 * the Source section. Links come from `hrefFor`, so the header works on the
	 * board and on the ticket page. `onclose` adds a Close control.
	 */
	const uid = $props.id();

	let {
		header,
		executions,
		hrefFor,
		onclose,
		headingId = `${uid}-heading`
	}: {
		header: TicketHeader;
		/** The ticket's executions, oldest first, with the shown one `selected`. */
		executions: ExecutionView[];
		/** The href that shows an execution in the current placement. */
		hrefFor: (execution: ExecutionView) => string;
		/** Closes the Inspector; no Close control without it. */
		onclose?: () => void;
		/** The title's id, so a page can label a region by it or focus it. */
		headingId?: string;
	} = $props();

	// The execution stages in pipeline order, QA included. An unknown stage is
	// pinned to step 1 and called out visibly, never an empty bar.
	const steps = ['plan', 'work', 'qa', 'review', 'wrapup', 'done'];
	const stepLabels = steps.map(stageLabel);
	const stageIndex = $derived(steps.indexOf(header.stage));
	const currentStep = $derived(stageIndex >= 0 ? stageIndex + 1 : 1);
	const unexpectedStage = $derived(stageIndex < 0 ? header.stage : null);

	const currentExecution = $derived(executions.find((execution) => execution.current));

	const warningsId = `${uid}-warnings`;
	const sourceId = `${uid}-source`;
	const historyId = `${uid}-history`;

	const UNAVAILABLE = 'Unavailable';
	const LINK =
		'underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/30';
</script>

<article
	data-slot="ticket-header"
	aria-labelledby={headingId}
	class="not-prose flex min-w-0 flex-col gap-4 text-xs/relaxed text-foreground"
>
	{#if !header.current}
		<p
			class="flex flex-wrap items-center justify-between gap-2 border-t border-t-signal-standby bg-card p-3 font-mono"
			data-testid="past-execution"
		>
			<span>Past execution <span class="tabular-nums">{header.execution}</span>, read-only.</span>
			{#if currentExecution}
				<a class={LINK} href={hrefFor(currentExecution)}>Go to the current execution</a>
			{/if}
		</p>
	{/if}

	<div class="flex min-w-0 items-start justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			<span class="font-mono break-all text-foreground/75 tabular-nums">{header.displayRef}</span>
			<h2 id={headingId} tabindex="-1" class="text-2xl font-light wrap-anywhere outline-none">
				{header.title}
			</h2>
			<span class="font-mono text-[0.625rem] break-all text-foreground/75" data-testid="ticket-key"
				>{header.key}</span
			>
		</div>
		{#if onclose}
			<Button variant="ghost" size="icon" aria-label="Close inspector" onclick={onclose}>
				<CloseIcon aria-hidden="true" />
			</Button>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-2 font-mono">
		<Badge variant="outline" class="tabular-nums" data-testid="execution">
			Execution <span class="tabular-nums">{header.execution}</span>
		</Badge>
		<Badge variant="outline" data-testid="stage">{stageLabel(header.stage)}</Badge>
		<StatusBadge {...executionStatusSignal(header.status)} />
		{#if header.pullRequest}
			<a
				class="{LINK} tabular-nums"
				href={header.pullRequest.url}
				target="_blank"
				rel="noopener noreferrer"
				data-testid="pull-request"
				data-state={header.pullRequest.state}
			>
				PR #{header.pullRequest.number} · {header.pullRequest.state}<span class="sr-only"
					>(opens in a new tab)</span
				>
			</a>
		{/if}
	</div>

	{#if header.statusReason}
		<p class="font-mono text-foreground/75" data-testid="status-reason">{header.statusReason}</p>
	{/if}

	{#if header.currentTask}
		<p class="font-mono tabular-nums" data-testid="current-task">
			<span class="text-foreground/75">Current task</span>
			{header.currentTask.label}{#if header.currentTask.round !== null}
				<span class="text-foreground/75"> · round {header.currentTask.round}</span>{/if}
		</p>
	{/if}

	{#if header.trackerWarnings.length > 0}
		<div
			role="group"
			aria-labelledby={warningsId}
			data-testid="tracker-warnings"
			class="flex flex-col gap-1 border-l-2 border-l-signal-wait bg-card p-3"
		>
			<h3 id={warningsId} class="text-[0.625rem] font-medium text-foreground/75">
				Tracker warnings
			</h3>
			<ul class="flex flex-col gap-1 font-mono">
				{#each header.trackerWarnings as warning, i (`${warning}-${i}`)}
					<li>{warning}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="flex flex-col gap-2" data-testid="timeline" data-stage={header.stage}>
		<Timeline
			steps={stepLabels}
			{currentStep}
			totalSteps={steps.length}
			label="Lifecycle: {stageLabel(header.stage)}"
		/>
		{#if unexpectedStage}
			<p class="font-mono text-foreground/75 tabular-nums" data-testid="unknown-stage">
				Unrecognized stage “{unexpectedStage}”: timeline pinned to step 1.
			</p>
		{/if}
	</div>

	<div
		role="group"
		aria-labelledby={sourceId}
		data-slot="ticket-source"
		class="flex flex-col gap-2"
	>
		<h3 id={sourceId} class="text-[0.625rem] font-medium text-foreground/75">Source</h3>
		<p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<span class="font-mono break-all" data-field="source-ref">{header.source.ref}</span>
			{#if header.source.href}
				<a
					href={header.source.href}
					target="_blank"
					rel="noopener noreferrer"
					data-slot="open-in-tracker"
					class={LINK}
				>
					Open in tracker <span aria-hidden="true">↗</span><span class="sr-only"
						>(opens in a new tab)</span
					>
				</a>
			{/if}
		</p>
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
			<dt class="text-foreground/75">Labels</dt>
			<dd data-field="labels">{UNAVAILABLE}</dd>
			<dt class="text-foreground/75">Author</dt>
			<dd data-field="author">{UNAVAILABLE}</dd>
			<dt class="text-foreground/75">Dates</dt>
			<dd data-field="dates">{UNAVAILABLE}</dd>
			<dt class="text-foreground/75">Description</dt>
			<dd data-field="description">{UNAVAILABLE}</dd>
		</dl>
	</div>

	<div role="group" aria-labelledby={historyId} class="flex flex-col gap-2">
		<h3 id={historyId} class="text-[0.625rem] font-medium text-foreground/75">Executions</h3>
		<ul class="flex flex-col gap-2 font-mono tabular-nums" data-testid="executions">
			{#each executions as execution (execution.generation)}
				<li
					class="flex flex-wrap items-center gap-2"
					data-execution={execution.generation}
					data-selected={execution.selected}
				>
					<a
						class={execution.selected ? `${LINK} font-medium no-underline` : LINK}
						href={hrefFor(execution)}
						aria-current={execution.selected ? 'page' : undefined}
					>
						Execution {execution.generation}
					</a>
					<span>{stageLabel(execution.stage)}</span>
					<StatusBadge {...executionStatusSignal(execution.status)} />
					{#if execution.current}<span>current</span>{/if}
					<span class="text-foreground/75">
						created {formatTimestamp(execution.createdAt)} · finished {formatTimestamp(
							execution.finishedAt
						)}
					</span>
					{#if execution.statusReason}
						<span class="w-full text-foreground/75">{execution.statusReason}</span>
					{/if}
				</li>
			{:else}
				<li class="text-foreground/75">No executions recorded.</li>
			{/each}
		</ul>
	</div>
</article>
