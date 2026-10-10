<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import TasksTableStatusCell from '$lib/components/tasks-table-status-cell.svelte';
	import { MoveUp as ArrowUpIcon, MoveDown as ArrowDownIcon } from '@lucide/svelte';
	// Types only — erased at runtime, so nothing from `$lib/server` reaches the
	// client bundle.
	import type { TicketDetailSession } from '$lib/server/types';

	/**
	 * Per-session usage rows, straight from the read module: no caller-side
	 * mapping. Cost arrives already converted to USD; context pressure is the
	 * controller's `context_percent`, rendered `—` when it has not reported.
	 */
	let { sessions }: { sessions: TicketDetailSession[] } = $props();
</script>

<Table.Root class="font-mono text-sm!">
	<Table.Header>
		<Table.Row>
			<Table.Head class="w-[100px]">Stage</Table.Head>
			<Table.Head>Task</Table.Head>
			<Table.Head>Model</Table.Head>
			<Table.Head>Usage</Table.Head>
			<Table.Head class="text-end">Cost</Table.Head>
			<Table.Head class="text-end">Context</Table.Head>
			<Table.Head class="text-end">Status</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each sessions as session (session.id)}
			<Table.Row>
				<Table.Cell class="font-medium">{session.stage}</Table.Cell>
				<Table.Cell class="tabular-nums">{session.taskId ?? '—'}</Table.Cell>
				<Table.Cell>{session.model}</Table.Cell>
				<Table.Cell class="flex items-center gap-1 tabular-nums">
					{#if session.usage}
						<ArrowUpIcon class="size-4 text-muted-foreground" alt="Input tokens" />
						{session.usage.tokensInput}
						<ArrowDownIcon class="size-4 text-muted-foreground" alt="Output tokens" />
						{session.usage.tokensOutput}
						<span class="mr-1 font-mono text-muted-foreground" aria-label="Cache read tokens"
							>R</span
						>
						{session.usage.tokensCacheRead}
						<span class="mr-1 font-mono text-muted-foreground" aria-label="Cache write tokens"
							>W</span
						>
						{session.usage.tokensCacheWrite}
					{:else}
						—
					{/if}
				</Table.Cell>
				<Table.Cell class="text-end tabular-nums">
					$ {(session.usage?.costUsd ?? 0).toFixed(2)} USD
				</Table.Cell>
				<Table.Cell class="text-end tabular-nums">
					{session.contextPercent === null ? '—' : `${session.contextPercent}%`}
				</Table.Cell>
				<Table.Cell class="text-end">
					<TasksTableStatusCell status={session.taskStatus} />
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
