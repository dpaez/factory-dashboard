<script lang="ts">
	import TicketsTableStatusCell from '$lib/components/tickets-table-status-cell.svelte';
	import { formatTimestamp, stageLabel } from '$lib/factory/format';
	import type { ExecutionView, TicketKey } from '$lib/factory/models';

	/**
	 * A ticket's executions, oldest first. Each links to its read-only view;
	 * the current one links to the plain ticket address.
	 */
	let { ticketKey, executions }: { ticketKey: TicketKey; executions: ExecutionView[] } = $props();

	const base = $derived(`/tickets/${encodeURIComponent(ticketKey)}`);
	const href = (execution: ExecutionView) =>
		execution.current ? base : `${base}?execution=${execution.generation}`;
</script>

<div class="flex flex-col gap-2 font-mono text-xs font-light tabular-nums" data-testid="executions">
	{#each executions as execution (execution.generation)}
		<div
			class="flex flex-wrap items-center gap-2"
			data-execution={execution.generation}
			data-selected={execution.selected}
		>
			{#if execution.selected}
				<span class="font-medium" aria-current="page">Execution {execution.generation}</span>
			{:else}
				<a class="underline underline-offset-4" href={href(execution)}>
					Execution {execution.generation}
				</a>
			{/if}
			<span>{stageLabel(execution.stage)}</span>
			<TicketsTableStatusCell status={execution.status} />
			{#if execution.current}<span class="text-foreground">current</span>{/if}
			<span class="text-muted-foreground">
				created {formatTimestamp(execution.createdAt)} · finished {formatTimestamp(
					execution.finishedAt
				)}
			</span>
			{#if execution.statusReason}
				<span class="w-full text-muted-foreground">{execution.statusReason}</span>
			{/if}
		</div>
	{:else}
		<p class="text-muted-foreground">No executions recorded.</p>
	{/each}
</div>
