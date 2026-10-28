<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import StatusBadge from '$lib/components/factory/status-badge.svelte';
	import { formatCost, formatCount, stageLabel } from '$lib/factory/format';
	import type { RunView } from '$lib/factory/models';
	import { runStatusSignal } from '$lib/factory/status';
	import { MoveUp as ArrowUpIcon, MoveDown as ArrowDownIcon } from '@lucide/svelte';

	/**
	 * The runs of one execution, oldest first, each with its own usage. A run
	 * with no recorded usage shows "—" for usage and cost, never $0.00. Runs are
	 * never summed here: the execution total comes from the ticket.
	 */
	let { runs }: { runs: RunView[] } = $props();
</script>

<Table.Root class="font-mono text-sm!" data-testid="runs-table">
	<Table.Header>
		<Table.Row>
			<Table.Head class="w-12 text-end">#</Table.Head>
			<Table.Head class="w-[100px]">Stage</Table.Head>
			<Table.Head>Task</Table.Head>
			<Table.Head>Model</Table.Head>
			<Table.Head>Usage</Table.Head>
			<Table.Head class="text-end">Cost</Table.Head>
			<Table.Head class="text-end">Status</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each runs as run, i (`${run.id}-${i}`)}
			<Table.Row data-run={run.id}>
				<Table.Cell class="text-end text-muted-foreground tabular-nums">{run.sequence}</Table.Cell>
				<Table.Cell class="font-medium">{stageLabel(run.stage)}</Table.Cell>
				<Table.Cell class="tabular-nums">{run.task ?? '—'}</Table.Cell>
				<Table.Cell>{run.model}</Table.Cell>
				<Table.Cell class="tabular-nums">
					{#if run.usage}
						<span class="flex items-center gap-1">
							<ArrowUpIcon class="size-4 text-muted-foreground" aria-label="Input tokens" />
							{formatCount(run.usage.tokensInput)}
							<ArrowDownIcon class="size-4 text-muted-foreground" aria-label="Output tokens" />
							{formatCount(run.usage.tokensOutput)}
							<span class="ml-1 text-muted-foreground" aria-label="Cache read tokens">R</span>
							{formatCount(run.usage.tokensCacheRead)}
							<span class="ml-1 text-muted-foreground" aria-label="Cache write tokens">W</span>
							{formatCount(run.usage.tokensCacheWrite)}
						</span>
					{:else}
						<span class="text-muted-foreground" title="No usage recorded">—</span>
					{/if}
				</Table.Cell>
				<Table.Cell class="text-end tabular-nums" data-testid="run-cost">
					{formatCost(run.costUsd)}
				</Table.Cell>
				<Table.Cell class="text-end">
					<StatusBadge {...runStatusSignal(run.status)} />
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
