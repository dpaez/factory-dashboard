<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils.js';
	import type { StageGroup } from '$lib/factory/stats';
	import MetricValue from './metric-value.svelte';
	import type { PanelState } from './panel-state';
	import StatsPanelState from './stats-panel-state.svelte';

	/**
	 * One group per stage in pipeline order, one row per model setup
	 * (model · thinking). A stage with no runs says so; an Unavailable ratio
	 * reads "—" with accessible "Unavailable" text, never 0.
	 */
	let { state: view, onretry }: { state: PanelState<StageGroup[]>; onretry?: () => void } =
		$props();

	const COLUMNS = [
		{ key: 'setup', short: 'Model setup', full: 'Model setup', extra: false },
		{ key: 'runs', short: 'Runs', full: 'Runs', extra: false },
		{ key: 'accepted', short: 'Accepted outputs', full: 'Accepted outputs', extra: false },
		{ key: 'first-pass', short: 'First pass', full: 'First-pass acceptance', extra: false },
		{ key: 'tokens', short: 'Tokens / output', full: 'Tokens per accepted output', extra: false },
		{ key: 'cost', short: 'Cost / output', full: 'Cost per accepted output', extra: false },
		{
			key: 'corrections',
			short: 'Corrections',
			full: 'Corrections per accepted output',
			extra: true
		},
		{ key: 'returns', short: 'Returns', full: 'Returns to work', extra: true },
		{ key: 'review-rounds', short: 'Review rounds', full: 'Review rounds per task', extra: true },
		{ key: 'agent', short: 'Agent time', full: 'Agent time', extra: true },
		{
			key: 'infrastructure-lost',
			short: 'Infra-lost',
			full: 'Infrastructure-lost attempts',
			extra: true
		}
	] as const;

	const uid = $props.id();
	const headingId = `${uid}-stages`;
	let more = $state(false);
	const shown = $derived(more ? COLUMNS.length : COLUMNS.filter((column) => !column.extra).length);
</script>

<article
	aria-labelledby={headingId}
	data-slot="stage-table"
	data-state={view.kind}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	class="not-prose flex min-w-0 flex-col gap-2 text-xs/relaxed"
>
	<div class="flex items-baseline justify-between gap-3">
		<h2 id={headingId} class="text-base font-light">Stages</h2>
		{#if view.kind === 'ready'}
			<Button variant="ghost" size="sm" aria-pressed={more} onclick={() => (more = !more)}>
				More columns
			</Button>
		{/if}
	</div>
	{#if view.kind !== 'ready'}
		<StatsPanelState state={view} {onretry} />
	{:else}
		<!-- The table scrolls sideways on narrow screens; keyboard users can focus it to scroll. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			role="group"
			aria-labelledby={headingId}
			tabindex="0"
			class="min-w-0 overflow-x-auto ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&>[data-slot=table-container]]:overflow-visible"
		>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						{#each COLUMNS as column (column.key)}
							<Table.Head
								class={cn(
									'whitespace-nowrap',
									column.key === 'setup' ? '' : 'text-right',
									column.extra && !more && 'hidden'
								)}
								title={column.full}
							>
								{#if column.short === column.full}
									{column.short}
								{:else}
									<span class="sr-only">{column.full}</span>
									<span aria-hidden="true">{column.short}</span>
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				</Table.Header>
				{#each view.model as group (group.stage)}
					<Table.Body data-stage={group.stage} data-no-runs={group.noRuns ? 'true' : undefined}>
						<Table.Row class="hover:bg-transparent">
							<Table.Head
								scope="rowgroup"
								colspan={shown}
								class="h-7 border-t border-border font-mono text-[0.625rem] tracking-wide uppercase"
								>{group.label}</Table.Head
							>
						</Table.Row>
						{#if group.noRuns}
							<Table.Row>
								<Table.Cell colspan={shown} class="font-mono text-foreground/75"
									>No runs in this cohort</Table.Cell
								>
							</Table.Row>
						{:else}
							{#each group.rows as row (row.setup)}
								{@const m = row.metrics}
								<Table.Row data-setup={row.setup}>
									<Table.Head scope="row" class="font-mono font-normal"
										>{row.model} · {row.thinking}</Table.Head
									>
									<Table.Cell class="text-right"><MetricValue metric={m.runs} /></Table.Cell>
									<Table.Cell class="text-right"
										><MetricValue metric={m.acceptedOutputs} /></Table.Cell
									>
									<Table.Cell class="text-right" data-column="first-pass"
										><MetricValue metric={m.firstPassAcceptance} percent /></Table.Cell
									>
									<Table.Cell class={cn('text-right', !more && 'hidden')} data-column="corrections"
										><MetricValue metric={m.correctionsPerAcceptedOutput} /></Table.Cell
									>
									<Table.Cell
										class={cn('text-right font-mono tabular-nums', !more && 'hidden')}
										data-column="returns"
									>
										{row.returnsToWork
											.map((item) => `${item.label} ${item.count.value ?? '—'}`)
											.join(' · ')}
									</Table.Cell>
									<Table.Cell
										class={cn('text-right', !more && 'hidden')}
										data-column="review-rounds"
										><MetricValue metric={m.reviewRoundsPerTask} /></Table.Cell
									>
									<Table.Cell class="text-right" data-column="tokens"
										><MetricValue metric={m.tokensPerAcceptedOutput} /></Table.Cell
									>
									<Table.Cell class="text-right" data-column="cost"
										><MetricValue metric={m.costUsdPerAcceptedOutput} /></Table.Cell
									>
									<Table.Cell class={cn('text-right', !more && 'hidden')}
										><MetricValue metric={m.agentMs} /></Table.Cell
									>
									<Table.Cell
										class={cn('text-right', !more && 'hidden')}
										data-column="infrastructure-lost"
										><MetricValue metric={m.infrastructureLost} /></Table.Cell
									>
								</Table.Row>
							{/each}
						{/if}
					</Table.Body>
				{/each}
			</Table.Root>
		</div>
	{/if}
</article>
