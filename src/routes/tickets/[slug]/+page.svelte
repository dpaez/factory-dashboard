<script lang="ts">
	import type { PageProps } from './$types';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import Timeline from '$lib/components/timeline.svelte';
	import AgentMessage from '$lib/components/agent-message.svelte';
	import UsageList from '$lib/components/usage-list.svelte';
	import TasksTableStatusCell from '$lib/components/tasks-table-status-cell.svelte';
	import TicketsTableStatusCell from '$lib/components/tickets-table-status-cell.svelte';
	import type { TicketDetailTask } from '$lib/server/types';

	const { data }: PageProps = $props();
	const detail = $derived(data.detail);
	const execution = $derived(detail.execution);

	// The five-step lifecycle, including the v2-only `done` step. An
	// out-of-vocabulary stage must never silently render an empty bar: it is
	// clamped to step 1 *and* called out visibly below the timeline.
	const steps = ['plan', 'work', 'review', 'wrapup', 'done'];
	const totalSteps = steps.length;
	const stageIndex = $derived(execution === null ? -1 : steps.indexOf(execution.stage));
	const currentStep = $derived(stageIndex >= 0 ? stageIndex + 1 : 1);
	const unexpectedStage = $derived(execution !== null && stageIndex < 0 ? execution.stage : null);

	function formatTimestamp(value: string | null): string {
		if (value === null) return '—';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '—';
		const iso = date.toISOString();
		return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
	}

	// Tasks whose dependencies are not all `done` yet are marked as waiting.
	const taskStatusById = $derived(new Map(detail.tasks.map((task) => [task.taskId, task.status])));
	function pendingDependencies(task: TicketDetailTask): string[] {
		return task.dependsOnTaskIds.filter((id) => taskStatusById.get(id) !== 'done');
	}

	// The review card follows the highest review round across tasks and that
	// task's verdict, tolerating zero rounds and a null verdict.
	const lastReview = $derived.by(() => {
		let best: TicketDetailTask | null = null;
		for (const task of detail.tasks) {
			if (best === null || task.reviewRound > best.reviewRound) best = task;
		}
		return best;
	});
	const reviewLabel = $derived.by(() => {
		if (lastReview === null || lastReview.reviewRound === 0) return 'No reviews yet';
		const verdict = lastReview.reviewVerdict ?? '—';
		const rounds = `${lastReview.reviewRound} round${lastReview.reviewRound === 1 ? '' : 's'}`;
		return `${verdict.replaceAll('_', ' ')} (${rounds})`;
	});

	const openAttention = $derived(detail.attention.filter((item) => item.status === 'open'));

	// Per-stage costs are sums of deltas, so adding them is the execution total.
	const totalCostUsd = $derived(detail.usageByStage.reduce((sum, row) => sum + row.costUsd, 0));
</script>

<main class="flex flex-col gap-6 pb-8">
	<section>
		<div class="mt-2 mb-8 flex items-start justify-between">
			<div class="flex flex-col">
				<h2 class="not-prose text-4xl font-light">Ticket Detail</h2>
				<p class="not-prose mt-2 text-sm font-extralight text-muted-foreground">
					Operational state, sessions, and task handoff
				</p>
			</div>
			{#if execution}
				<div class="mt-1 flex items-center gap-2">
					<Badge variant="outline" class="h-auto px-4 py-1 font-mono tabular-nums [&>svg]:size-4!">
						Gen <span class="tabular-nums">{execution.generation}</span>
					</Badge>
					<TicketsTableStatusCell status={execution.status} />
				</div>
			{/if}
		</div>
	</section>

	<section class="flex flex-col gap-6 bg-card p-4 md:px-8">
		<div class="mb-4 flex flex-col gap-4 md:mb-6 md:flex-row md:items-start md:justify-between">
			<h3 class="not-prose text-2xl font-light">
				<pre class="font-mono whitespace-pre-wrap tabular-nums">{detail.ticket.title ??
						detail.ticket.id}</pre>
			</h3>
			{#if detail.ticket.type}
				<Badge
					variant="outline"
					class="mt-1 h-auto px-4 py-1 font-mono tabular-nums [&>svg]:size-4!"
				>
					{detail.ticket.type}
				</Badge>
			{/if}
		</div>

		{#if execution}
			<div class="flex max-w-5xl flex-col gap-6">
				<div class="flex flex-col gap-2">
					<Timeline {steps} {currentStep} {totalSteps} />
					{#if unexpectedStage}
						<p class="not-prose font-mono text-xs text-destructive tabular-nums">
							Unrecognized stage “{unexpectedStage}” — timeline pinned to step 1.
						</p>
					{/if}
				</div>

				{#if execution.message}
					<AgentMessage
						agentName="Last Message"
						content={execution.message}
						createdAt={formatTimestamp(execution.messageAt)}
					/>
				{:else}
					<AgentMessage agentName="Last Message" content="No message yet" />
				{/if}

				{#if execution.statusReason}
					<p class="not-prose font-mono text-xs text-muted-foreground tabular-nums">
						{execution.statusReasonCode ?? 'reason'}: {execution.statusReason}
					</p>
				{/if}
			</div>
		{:else}
			<p class="not-prose font-mono text-sm text-muted-foreground">
				No current execution recorded for this ticket.
			</p>
		{/if}

		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<Card.Root class="not-prose border-t border-t-primary bg-primary/20 shadow-none ring-0">
				<Card.Header>
					<Card.Title class="text-xs tracking-wide text-muted-foreground">Tasks</Card.Title>
				</Card.Header>
				<Card.Content class="flex flex-col gap-3 font-mono text-xs font-light tabular-nums">
					{#each detail.tasks as task (task.taskId)}
						{@const waiting = pendingDependencies(task)}
						<div class="flex flex-col gap-1">
							<div class="flex items-center justify-between gap-2">
								<p class="tabular-nums">
									<span class="text-muted-foreground">{task.ordinal}.</span>
									{task.title ?? task.taskId}
								</p>
								<TasksTableStatusCell status={task.status} />
							</div>
							<p class="text-muted-foreground">
								review round <span class="tabular-nums">{task.reviewRound}</span>
								· verdict {task.reviewVerdict?.replaceAll('_', ' ') ?? '—'}
								· findings {task.findingCount ?? '—'}
								· blocking {task.blockingCount ?? '—'}
								{#if waiting.length > 0}
									· waiting on {waiting.join(', ')}
								{/if}
							</p>
						</div>
					{:else}
						<p class="text-muted-foreground">No tasks yet.</p>
					{/each}
				</Card.Content>
			</Card.Root>

			<div class="flex flex-col gap-6">
				<Card.Root class="not-prose border-t border-t-primary bg-primary/20 shadow-none ring-0">
					<Card.Header>
						<Card.Title class="text-xs tracking-wide text-muted-foreground">
							Attention
							{#if openAttention.length > 0}
								<span class="tabular-nums">({openAttention.length} open)</span>
							{/if}
						</Card.Title>
					</Card.Header>
					<Card.Content class="flex flex-col gap-3 font-mono text-xs font-light tabular-nums">
						{#each detail.attention as item (item.id)}
							<div class="flex flex-col gap-1">
								<p>{item.question}</p>
								<p class="text-muted-foreground">
									{item.kind.replaceAll('_', ' ')} · {item.status.replaceAll('_', ' ')}
									· created {formatTimestamp(item.createdAt)}
									· answered {formatTimestamp(item.answeredAt)}
									· resolved {formatTimestamp(item.resolvedAt)}
								</p>
							</div>
						{:else}
							<p class="text-muted-foreground">No open attention.</p>
						{/each}
					</Card.Content>
				</Card.Root>

				<Card.Root class="not-prose border-t border-t-primary bg-primary/20 shadow-none ring-0">
					<Card.Header>
						<Card.Title class="text-xs tracking-wide text-muted-foreground">Review</Card.Title>
					</Card.Header>
					<Card.Content class="font-mono text-xs font-light tracking-tight tabular-nums">
						{reviewLabel}
					</Card.Content>
				</Card.Root>
			</div>
		</div>
	</section>

	<section class="flex flex-col gap-6 bg-card p-4 md:px-8">
		<div class="flex items-baseline justify-between">
			<h3 class="not-prose text-2xl font-light">Usage breakdown</h3>
			<p class="not-prose font-mono text-sm tabular-nums">
				Total $ {totalCostUsd.toFixed(2)} USD
			</p>
		</div>

		{#if detail.usageByStage.length > 0}
			<Table.Root class="font-mono text-sm!">
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-[100px]">Stage</Table.Head>
						<Table.Head class="text-end">Input</Table.Head>
						<Table.Head class="text-end">Output</Table.Head>
						<Table.Head class="text-end">Cache R</Table.Head>
						<Table.Head class="text-end">Cache W</Table.Head>
						<Table.Head class="text-end">Cost</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each detail.usageByStage as row (row.stage)}
						<Table.Row>
							<Table.Cell class="font-medium">{row.stage}</Table.Cell>
							<Table.Cell class="text-end tabular-nums">{row.tokensInput}</Table.Cell>
							<Table.Cell class="text-end tabular-nums">{row.tokensOutput}</Table.Cell>
							<Table.Cell class="text-end tabular-nums">{row.tokensCacheRead}</Table.Cell>
							<Table.Cell class="text-end tabular-nums">{row.tokensCacheWrite}</Table.Cell>
							<Table.Cell class="text-end tabular-nums">$ {row.costUsd.toFixed(2)} USD</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<p class="not-prose font-mono text-sm text-muted-foreground">
				No usage recorded yet — $0.00.
			</p>
		{/if}

		<h4 class="not-prose text-lg font-light">Sessions</h4>
		{#if detail.sessions.length > 0}
			<UsageList sessions={detail.sessions} />
		{:else}
			<p class="not-prose font-mono text-sm text-muted-foreground">No sessions yet.</p>
		{/if}
	</section>

	{#if detail.priorGenerations.length > 0}
		<section class="flex flex-col gap-4 bg-card p-4 md:px-8">
			<h3 class="not-prose text-2xl font-light">Generation history</h3>
			<div class="flex flex-col gap-2 font-mono text-xs font-light tabular-nums">
				{#each detail.priorGenerations as generation (generation.id)}
					<div class="flex flex-wrap items-center gap-2">
						<span>Gen {generation.generation}</span>
						<Separator
							class="max-w-8 border-t border-dashed border-accent-foreground bg-transparent"
						/>
						<span>{generation.stage}/{generation.status.replaceAll('_', ' ')}</span>
						<Separator
							class="max-w-8 border-t border-dashed border-accent-foreground bg-transparent"
						/>
						<span class="text-muted-foreground">
							created {formatTimestamp(generation.createdAt)}
							· updated {formatTimestamp(generation.updatedAt)}
							· finished {formatTimestamp(generation.finishedAt)}
						</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if execution && (execution.planPath || execution.adrPath)}
		<section class="bg-card p-4 md:px-8">
			<!-- Paths are exposed as text only; the dashboard never reads these
			     files (ADR 0002 holds until task 05 supersedes it). -->
			<p
				class="not-prose font-mono text-xs font-light break-all text-muted-foreground tabular-nums"
			>
				{#if execution.planPath}plan: {execution.planPath}{/if}
				{#if execution.planPath && execution.adrPath}
					·
				{/if}
				{#if execution.adrPath}adr: {execution.adrPath}{/if}
			</p>
		</section>
	{/if}
</main>
