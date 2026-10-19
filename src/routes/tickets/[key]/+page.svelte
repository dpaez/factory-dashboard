<script lang="ts">
	import type { PageProps } from './$types';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import Timeline from '$lib/components/timeline.svelte';
	import AgentMessage from '$lib/components/agent-message.svelte';
	import UsageList from '$lib/components/usage-list.svelte';
	import TicketTasks from '$lib/components/ticket-tasks.svelte';
	import TicketAttention from '$lib/components/ticket-attention.svelte';
	import TicketExecutions from '$lib/components/ticket-executions.svelte';
	import TicketsTableStatusCell from '$lib/components/tickets-table-status-cell.svelte';
	import { formatCost, formatCount, formatTimestamp, stageLabel } from '$lib/factory/format';

	const { data }: PageProps = $props();
	const detail = $derived(data.detail);
	const header = $derived(detail.header);
	const currentHref = $derived(`/tickets/${encodeURIComponent(header.key)}`);

	// The execution stages in pipeline order, QA included. An unknown stage is
	// pinned to step 1 and called out visibly, never an empty bar.
	const steps = ['plan', 'work', 'qa', 'review', 'wrapup', 'done'];
	const stepLabels = steps.map(stageLabel);
	const stageIndex = $derived(steps.indexOf(header.stage));
	const currentStep = $derived(stageIndex >= 0 ? stageIndex + 1 : 1);
	const unexpectedStage = $derived(stageIndex < 0 ? header.stage : null);

	const latestRun = $derived(
		[...detail.runs]
			.filter((run) => run.activity !== null && run.activity !== '')
			.sort((a, b) => b.sequence - a.sequence)[0]
	);

	const openAttention = $derived(
		detail.attention.filter((request) => request.status === 'open').length
	);
</script>

<main class="flex flex-col gap-6 pb-8">
	{#if !header.current}
		<section
			class="not-prose flex flex-wrap items-center justify-between gap-2 border-t border-t-signal-standby bg-card p-4 font-mono text-sm md:px-8"
			data-testid="past-execution"
		>
			<p>
				Past execution <span class="tabular-nums">{header.execution}</span>, read-only.
			</p>
			<a class="underline underline-offset-4" href={currentHref}>Go to the current execution</a>
		</section>
	{/if}

	<section>
		<div class="mt-2 mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
			<div class="flex min-w-0 flex-col">
				<p class="not-prose font-mono text-sm text-muted-foreground tabular-nums">
					<a class="underline underline-offset-4" href={header.sourceRef}>{header.displayRef}</a>
				</p>
				<h2 class="not-prose mt-1 text-4xl font-light break-words">{header.title}</h2>
				<p
					class="not-prose mt-2 font-mono text-xs font-extralight break-all text-muted-foreground"
					data-testid="ticket-key"
				>
					{header.key}
				</p>
			</div>
			<div class="mt-1 flex flex-wrap items-center gap-2">
				<Badge variant="outline" class="h-auto px-4 py-1 font-mono tabular-nums">
					Execution <span class="tabular-nums">{header.execution}</span>
				</Badge>
				<Badge variant="outline" class="h-auto px-4 py-1 font-mono">
					{stageLabel(header.stage)}
				</Badge>
				<TicketsTableStatusCell status={header.status} />
				{#if header.pullRequest}
					<a
						class="font-mono text-xs tabular-nums underline underline-offset-4"
						href={header.pullRequest.url}
						data-testid="pull-request"
					>
						PR #{header.pullRequest.number} · {header.pullRequest.state}
					</a>
				{/if}
			</div>
		</div>
	</section>

	<section class="flex flex-col gap-6 bg-card p-4 md:px-8">
		<div class="flex max-w-5xl flex-col gap-6">
			<div class="flex flex-col gap-2" data-testid="timeline" data-stage={header.stage}>
				<Timeline steps={stepLabels} {currentStep} totalSteps={steps.length} />
				{#if unexpectedStage}
					<p class="not-prose font-mono text-xs text-destructive tabular-nums">
						Unrecognized stage “{unexpectedStage}”: timeline pinned to step 1.
					</p>
				{/if}
			</div>

			{#if latestRun}
				<AgentMessage
					agentName={`Latest activity · run ${latestRun.sequence} · ${stageLabel(latestRun.stage)}`}
					content={latestRun.activity ?? ''}
					createdAt={formatTimestamp(latestRun.endedAt ?? latestRun.startedAt)}
				/>
			{:else}
				<AgentMessage agentName="Latest activity" content="No activity yet" />
			{/if}

			{#if header.statusReason}
				<p class="not-prose font-mono text-xs text-muted-foreground" data-testid="status-reason">
					{header.statusReason}
				</p>
			{/if}
			{#each header.trackerWarnings as warning (warning)}
				<p class="not-prose font-mono text-xs text-destructive">{warning}</p>
			{/each}
		</div>

		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<Card.Root class="not-prose border-t border-t-primary bg-primary/20 shadow-none ring-0">
				<Card.Header>
					<Card.Title class="text-xs tracking-wide text-muted-foreground">
						Tasks
						<span class="tabular-nums">({header.progress.done}/{header.progress.total} done)</span>
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<TicketTasks tasks={detail.tasks} />
				</Card.Content>
			</Card.Root>

			<Card.Root
				class="not-prose min-w-0 border-t border-t-primary bg-primary/20 shadow-none ring-0"
			>
				<Card.Header>
					<Card.Title class="text-xs tracking-wide text-muted-foreground">
						Attention
						{#if openAttention > 0}
							<span class="tabular-nums">({openAttention} open)</span>
						{/if}
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<TicketAttention attention={detail.attention} />
				</Card.Content>
			</Card.Root>
		</div>
	</section>

	<section class="flex flex-col gap-6 bg-card p-4 md:px-8">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h3 class="not-prose text-2xl font-light">Usage</h3>
			<p class="not-prose font-mono text-sm tabular-nums" data-testid="usage-total">
				Execution {header.execution} total {formatCost(detail.usage.costUsd)}
			</p>
		</div>
		<dl
			class="not-prose grid grid-cols-2 gap-2 font-mono text-xs tabular-nums md:grid-cols-5"
			data-testid="usage-tokens"
		>
			<div>
				<dt class="text-muted-foreground">Input</dt>
				<dd>{formatCount(detail.usage.tokensInput)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Output</dt>
				<dd>{formatCount(detail.usage.tokensOutput)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Cache read</dt>
				<dd>{formatCount(detail.usage.tokensCacheRead)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Cache write</dt>
				<dd>{formatCount(detail.usage.tokensCacheWrite)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Total</dt>
				<dd>{formatCount(detail.usage.tokensTotal)}</dd>
			</div>
		</dl>

		<h4 class="not-prose text-lg font-light">Runs</h4>
		{#if !data.runsComplete}
			<p class="not-prose font-mono text-sm text-muted-foreground">
				Showing the first {detail.runs.length} runs. The list is partial.
			</p>
		{/if}
		{#if detail.runs.length > 0}
			<UsageList runs={detail.runs} />
		{:else}
			<p class="not-prose font-mono text-sm text-muted-foreground">No runs yet.</p>
		{/if}
	</section>

	<section class="flex flex-col gap-4 bg-card p-4 md:px-8">
		<h3 class="not-prose text-2xl font-light">Executions</h3>
		<TicketExecutions ticketKey={header.key} executions={detail.executions} />
	</section>
</main>
