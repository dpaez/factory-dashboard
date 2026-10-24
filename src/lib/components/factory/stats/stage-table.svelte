<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
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
		'Model setup',
		'Runs',
		'Accepted outputs',
		'First-pass acceptance',
		'Corrections per accepted output',
		'Returns to work',
		'Review rounds per task',
		'Tokens per accepted output',
		'Cost per accepted output',
		'Agent time',
		'Infrastructure-lost attempts'
	];

	const uid = $props.id();
	const headingId = `${uid}-stages`;
</script>

<article
	aria-labelledby={headingId}
	data-slot="stage-table"
	data-state={view.kind}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	class="not-prose flex min-w-0 flex-col gap-2 text-xs/relaxed"
>
	<h2 id={headingId} class="text-base font-light">Stages</h2>
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
						{#each COLUMNS as column, index (column)}
							<Table.Head class={index === 0 ? '' : 'text-right whitespace-normal'}
								>{column}</Table.Head
							>
						{/each}
					</Table.Row>
				</Table.Header>
				{#each view.model as group (group.stage)}
					<Table.Body data-stage={group.stage} data-no-runs={group.noRuns ? 'true' : undefined}>
						<Table.Row class="bg-muted hover:bg-muted">
							<Table.Head scope="rowgroup" colspan={COLUMNS.length} class="h-8"
								>{group.label}</Table.Head
							>
						</Table.Row>
						{#if group.noRuns}
							<Table.Row>
								<Table.Cell colspan={COLUMNS.length} class="font-mono text-foreground/75"
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
									<Table.Cell class="text-right" data-column="corrections"
										><MetricValue metric={m.correctionsPerAcceptedOutput} /></Table.Cell
									>
									<Table.Cell class="text-right font-mono tabular-nums" data-column="returns">
										{row.returnsToWork
											.map((item) => `${item.label} ${item.count.value ?? '—'}`)
											.join(' · ')}
									</Table.Cell>
									<Table.Cell class="text-right" data-column="review-rounds"
										><MetricValue metric={m.reviewRoundsPerTask} /></Table.Cell
									>
									<Table.Cell class="text-right" data-column="tokens"
										><MetricValue metric={m.tokensPerAcceptedOutput} /></Table.Cell
									>
									<Table.Cell class="text-right" data-column="cost"
										><MetricValue metric={m.costUsdPerAcceptedOutput} /></Table.Cell
									>
									<Table.Cell class="text-right"><MetricValue metric={m.agentMs} /></Table.Cell>
									<Table.Cell class="text-right" data-column="infrastructure-lost"
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
