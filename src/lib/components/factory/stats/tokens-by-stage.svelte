<script lang="ts">
	import { formatCount, formatPercent, UNAVAILABLE } from '$lib/factory/format';
	import type { TokensByStage } from '$lib/factory/stats';
	import type { PanelState } from './panel-state';
	import StatsPanelState from './stats-panel-state.svelte';

	/**
	 * Total tokens per stage on one shared scale: the largest stage fills the
	 * track, the rest are proportional, never normalized to 100%. Partial stages
	 * disclose their excluded runs; a stage with no runs says so. Token
	 * categories are Unavailable until stats facts carry them.
	 */
	let { state: view, onretry }: { state: PanelState<TokensByStage>; onretry?: () => void } =
		$props();

	const uid = $props.id();
	const headingId = `${uid}-tokens`;
</script>

<article
	aria-labelledby={headingId}
	data-slot="tokens-by-stage"
	data-state={view.kind}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	class="not-prose flex min-w-0 flex-col gap-3 text-xs/relaxed"
>
	<h2 id={headingId} class="text-base font-light">Tokens by stage</h2>
	{#if view.kind !== 'ready'}
		<StatsPanelState state={view} {onretry} />
	{:else}
		{@const model = view.model}
		{@const coverage = model.coverage}
		{@const categories = model.categories}
		<ul class="flex flex-col gap-2" aria-label="Total tokens per stage">
			{#each model.stages as stage (stage.stage)}
				{@const total = stage.total}
				<li
					data-stage={stage.stage}
					data-availability={stage.noRuns ? 'no-runs' : total.availability}
					class="grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[5rem_1fr_9rem]"
				>
					<span class="text-foreground/75">{stage.label}</span>
					<div class="h-4 bg-muted" aria-hidden="true">
						{#if total.value !== null && !stage.noRuns}
							<div
								class="h-full bg-chart-3"
								data-slot="token-bar"
								style:width={`${(stage.scale * 100).toFixed(2)}%`}
							></div>
						{/if}
					</div>
					<span class="col-start-2 font-mono tabular-nums sm:col-start-auto sm:text-right">
						{#if stage.noRuns}
							<span class="text-foreground/75">No runs in this cohort</span>
						{:else if total.value === null}
							{UNAVAILABLE}{' '}<span class="sr-only">Unavailable</span>
							<span class="text-foreground/75" data-testid="stage-partial"
								>· {formatCount(total.excludedCount)} runs excluded</span
							>
						{:else}
							<span aria-hidden="true">{formatCount(total.value)}</span><span class="sr-only"
								>{formatCount(total.value)} tokens</span
							>
							{#if total.availability === 'partial'}
								<span class="text-foreground/75" data-testid="stage-partial"
									>partial · {formatCount(total.excludedCount)} runs excluded</span
								>
							{/if}
						{/if}
					</span>
				</li>
			{/each}
		</ul>

		<p class="font-mono text-foreground/75 tabular-nums" data-testid="tokens-coverage">
			Stage totals: {formatCount(model.knownTotal)} tokens · coverage of cohort tokens
			<span class="text-foreground"
				>{formatPercent(coverage.value)}{#if coverage.value === null}{' '}<span class="sr-only"
						>Unavailable</span
					>{/if}</span
			>{#if coverage.denominator !== undefined && coverage.value !== null}{' '}({formatCount(
					coverage.numerator
				)} of {formatCount(coverage.denominator)}){/if}
		</p>
		<p class="font-mono text-foreground/75" data-testid="token-categories">
			{categories.label}: <span class="text-foreground">Unavailable</span> — input, cache read,
			cache write and output are {categories.unavailableReason}.
		</p>
	{/if}
</article>
