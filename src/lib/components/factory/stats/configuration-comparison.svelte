<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import { SMALL_SAMPLE, type ConfigurationComparison } from '$lib/factory/stats-tickets';
	import MetricValue from './metric-value.svelte';
	import type { PanelState } from './panel-state';
	import StatsPanelState from './stats-panel-state.svelte';

	/**
	 * One row per factory configuration (stage=setup pairs) with its sample.
	 * Rows are listed as the factory returns them; nothing is ranked. A null
	 * figure is "—" with accessible "Unavailable" text.
	 */
	let {
		state: view,
		onretry
	}: { state: PanelState<ConfigurationComparison>; onretry?: () => void } = $props();

	const COLUMNS = [
		'Factory configuration',
		'Executions',
		'Merged',
		'Merge rate',
		'Median factory time',
		'Median cost',
		'Median external review rounds',
		'Interventions'
	];

	const uid = $props.id();
	const headingId = `${uid}-configurations`;
</script>

<article
	aria-labelledby={headingId}
	data-slot="configuration-comparison"
	data-state={view.kind}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	class="not-prose flex min-w-0 flex-col gap-2 text-xs/relaxed"
>
	<h2 id={headingId} class="text-base font-light">Factory configurations</h2>
	{#if view.kind !== 'ready'}
		<StatsPanelState state={view} {onretry} />
	{:else}
		{@const model = view.model}
		<p class="font-mono text-foreground/75" data-testid="configuration-versions">
			Factory versions in this cohort: {model.factoryVersions.length > 0
				? model.factoryVersions.join(', ')
				: 'none reported'}. Executions are counted per configuration; fewer than {SMALL_SAMPLE} is marked
			small sample.
		</p>
		{#if model.rows.length === 0}
			<p class="font-mono text-foreground/75" data-testid="configurations-empty">
				No executions in this cohort
			</p>
		{:else}
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
					<Table.Body>
						{#each model.rows as row (row.configuration)}
							<Table.Row
								data-configuration={row.configuration}
								data-small-sample={row.smallSample ? 'true' : undefined}
							>
								<Table.Head scope="row" class="font-mono font-normal whitespace-normal">
									<ul class="flex flex-col">
										{#each row.stages as pair, index (index)}
											<li>
												{#if pair.stage}<span class="text-foreground/75">{pair.label}=</span
													>{/if}{pair.setup}
											</li>
										{/each}
									</ul>
								</Table.Head>
								<Table.Cell class="text-right" data-column="tickets">
									<span class="flex flex-col items-end">
										<MetricValue metric={row.tickets} />
										{#if row.smallSample}
											<span class="font-mono text-foreground/75" data-testid="small-sample"
												>small sample</span
											>
										{/if}
									</span>
								</Table.Cell>
								<Table.Cell class="text-right" data-column="merged"
									><MetricValue metric={row.merged} /></Table.Cell
								>
								<Table.Cell class="text-right" data-column="merge-rate"
									><MetricValue metric={row.mergeRate} percent /></Table.Cell
								>
								<Table.Cell class="text-right" data-column="factory-time"
									><MetricValue metric={row.medianFactoryTime} /></Table.Cell
								>
								<Table.Cell class="text-right" data-column="cost"
									><MetricValue metric={row.medianCost} /></Table.Cell
								>
								<Table.Cell class="text-right" data-column="review-rounds"
									><MetricValue metric={row.medianExternalReviewRounds} fractional /></Table.Cell
								>
								<Table.Cell class="text-right" data-column="interventions"
									><MetricValue metric={row.interventions} /></Table.Cell
								>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	{/if}
</article>
