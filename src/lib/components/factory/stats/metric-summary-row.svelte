<script lang="ts">
	import InfoCard from '$lib/components/info-card.svelte';
	import {
		formatCompact,
		formatCost,
		formatCount,
		formatPercent,
		words
	} from '$lib/factory/format';
	import type { SummaryMetrics } from '$lib/factory/stats';
	import type { PanelState } from './panel-state';
	import StatsPanelState from './stats-panel-state.svelte';

	/**
	 * Cohort totals and the merge rate with its denominator. A zero-denominator
	 * merge rate is Unavailable ("—"), never 0%. "Inspect cohort" expands the
	 * outcome counts without changing the window.
	 */
	let { state: view, onretry }: { state: PanelState<SummaryMetrics>; onretry?: () => void } =
		$props();
</script>

<article
	aria-label="Cohort summary"
	data-slot="metric-summary-row"
	data-state={view.kind}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	class="not-prose flex flex-col items-start gap-4 text-xs/relaxed"
>
	{#if view.kind !== 'ready'}
		<StatsPanelState state={view} {onretry} />
	{:else}
		{@const metrics = view.model}
		{@const merge = metrics.mergeRate}
		{@const started = metrics.started.value}
		<div class="grid w-full grid-cols-1 gap-px bg-border sm:grid-cols-3">
			<div data-metric="tokens" class="min-w-0 bg-card">
				<InfoCard
					fluid
					title={metrics.tokens.label}
					value={formatCompact(metrics.tokens.value)}
					unavailable={metrics.tokens.value === null}
					subtitle={`${formatCount(metrics.tokens.value)} tokens · all outcomes · ${formatCount(started)} started`}
				/>
			</div>
			<div data-metric="cost" class="min-w-0 bg-card">
				<InfoCard
					fluid
					title={metrics.cost.label}
					value={formatCost(metrics.cost.value)}
					unavailable={metrics.cost.value === null}
					subtitle={`All outcomes · ${formatCount(started)} started`}
				/>
			</div>
			<div data-metric="merge-rate" class="min-w-0 bg-card">
				<InfoCard
					fluid
					title={merge.label}
					value={formatPercent(merge.value)}
					unavailable={merge.value === null}
				>
					{#snippet footer()}
						<span data-testid="merge-rate-denominator">
							{#if merge.denominator}
								{formatCount(merge.numerator)} of {formatCount(merge.denominator)} finished
							{:else}
								No finished tickets
							{/if}
							· {formatCount(merge.excludedCount ?? 0)} open or unknown excluded
						</span>
					{/snippet}
				</InfoCard>
			</div>
		</div>

		<details class="w-full font-mono text-xs" data-testid="inspect-cohort">
			<summary class="cursor-pointer text-foreground/75 hover:text-foreground"
				>Inspect cohort</summary
			>
			<dl
				class="mt-2 grid grid-cols-2 gap-2 bg-muted p-3 tabular-nums ring-1 ring-foreground/10 sm:grid-cols-6"
			>
				{#each [...metrics.outcomes, metrics.started] as outcome (outcome.key)}
					<div data-outcome={outcome.key}>
						<dt class="text-foreground/75">{words(outcome.label)}</dt>
						<dd class="text-foreground">{formatCount(outcome.value)}</dd>
					</div>
				{/each}
			</dl>
		</details>
	{/if}
</article>
