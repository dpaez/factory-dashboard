<script lang="ts">
	import { formatCost, formatCount, formatPercent, formatSpan } from '$lib/factory/format';
	import type { Metric } from '$lib/factory/stats';
	import type { EfficiencySignals } from '$lib/factory/stats-efficiency';
	import MetricValue from './metric-value.svelte';
	import type { PanelState } from './panel-state';
	import StatsPanelState from './stats-panel-state.svelte';

	/**
	 * Efficiency signals from the stats export: waiting share, blended cost per
	 * merged ticket, rework token share with its per-purpose parts, and usage
	 * coverage. Infrastructure-lost sits in its own block: it overlaps with
	 * rework and is never added to or subtracted from it. Every figure keeps
	 * its numerator, denominator or sample beside it. When the export is
	 * incomplete the status line says why, shares read Unavailable and counts
	 * are partial.
	 */
	let {
		state: view,
		onretry
	}: {
		state: PanelState<EfficiencySignals>;
		onretry?: () => void;
	} = $props();

	const uid = $props.id();
	const headingId = `${uid}-efficiency`;
	const infraId = `${uid}-infrastructure`;

	function sentence(text: string): string {
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	function runs(value: number | null | undefined): string {
		return `${formatCount(value)} ${value === 1 ? 'run' : 'runs'}`;
	}
</script>

{#snippet figure(metric: Metric, percent = false)}
	<span class="text-lg font-light"><MetricValue {metric} {percent} /></span>
	{#if metric.value === null && metric.unavailableReason}
		<span class="text-foreground/75" data-testid="unavailable-reason"
			>— {metric.unavailableReason}</span
		>
	{/if}
{/snippet}

<article
	aria-labelledby={headingId}
	data-slot="efficiency-signals"
	data-state={view.kind}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	class="not-prose flex min-w-0 flex-col gap-3 text-xs/relaxed"
>
	<h2 id={headingId} class="sr-only">Efficiency signals</h2>
	{#if view.kind !== 'ready'}
		<StatsPanelState state={view} {onretry} />
	{:else}
		{@const model = view.model}
		{@const status = model.status}
		{@const partial = !status.complete}
		{@const waiting = model.waitingShare}
		{@const blended = model.blendedCostPerMerged}
		{@const rework = model.rework.share}
		{@const coverage = model.usageCoverage}
		{@const infra = model.infrastructureLost}
		{#if partial && status.reason}
			<p
				class="font-mono text-foreground"
				data-testid="export-status"
				data-malformed-lines={status.malformedLines}
				role="note"
			>
				{sentence(status.reason)}. Shares and per-merge figures are Unavailable; counts are partial.
			</p>
		{/if}
		<p class="font-mono text-foreground/75 tabular-nums" data-testid="export-sample">
			<MetricValue metric={model.executions} /> executions started in the window ·
			<MetricValue metric={model.runs} /> runs{#if partial}{' '}· partial{/if}
		</p>

		<dl class="flex flex-col divide-y divide-foreground/10 ring-1 ring-foreground/10">
			<div
				class="flex flex-col gap-1 p-3"
				data-row="waiting-share"
				data-availability={waiting.availability}
			>
				<dt>Waiting share</dt>
				<dd class="flex flex-col gap-1">
					<span class="font-mono tabular-nums">
						{@render figure(waiting, true)}
						<span class="block text-foreground/75" data-testid="waiting-share-parts"
							>{formatSpan(waiting.numerator)} waiting before handoff of {formatSpan(
								waiting.denominator
							)} start → handoff · over {formatCount(waiting.sampleSize)} executions that reached handoff
							({formatCount(waiting.excludedCount)} excluded){#if partial}{' '}· partial{/if}</span
						>
					</span>
					<p class="text-foreground/75">{waiting.definition}</p>
				</dd>
			</div>

			<div
				class="flex flex-col gap-1 p-3"
				data-row="blended-cost-per-merged"
				data-availability={blended.availability}
			>
				<dt>Blended cost per merged ticket</dt>
				<dd class="flex flex-col gap-1">
					<span class="font-mono tabular-nums">
						{@render figure(blended)}
						<span class="block text-foreground/75" data-testid="blended-parts"
							>blended: {formatCost(blended.numerator)} total cost, all outcomes / {formatCount(
								blended.denominator
							)} merged{#if partial}{' '}· partial{/if}</span
						>
					</span>
					<p class="text-foreground/75">{blended.definition}</p>
				</dd>
			</div>

			<div
				class="flex flex-col gap-2 p-3"
				data-row="rework-token-share"
				data-availability={rework.availability}
			>
				<dt>Rework token share</dt>
				<dd class="flex flex-col gap-2">
					<span class="font-mono tabular-nums">
						{@render figure(rework, true)}
						<span class="block text-foreground/75" data-testid="rework-parts"
							>{formatCount(rework.numerator)} of {formatCount(rework.denominator)} tokens over {runs(
								rework.sampleSize
							)} with known usage{#if partial}{' '}· partial{/if}</span
						>
					</span>
					<p class="text-foreground/75" data-testid="rework-definition">{rework.definition}</p>
					<ul class="flex flex-col gap-1 font-mono tabular-nums" aria-label="Rework by purpose">
						{#each model.rework.parts as part (part.purpose)}
							<li
								class="grid grid-cols-[10rem_1fr] gap-x-3"
								data-purpose={part.purpose}
								data-availability={part.share.availability}
							>
								<span class="text-foreground/75">{part.label}</span>
								<span
									><MetricValue metric={part.share} percent /> · <MetricValue
										metric={part.tokens}
									/> tokens · <MetricValue metric={part.runs} />
									{part.runs.value === 1 ? 'run' : 'runs'}</span
								>
							</li>
						{/each}
					</ul>
				</dd>
			</div>

			<div
				class="flex flex-col gap-1 p-3"
				data-row="usage-coverage"
				data-availability={coverage.availability}
			>
				<dt>Runs with known usage</dt>
				<dd class="flex flex-col gap-1">
					<span class="font-mono tabular-nums">
						{@render figure(coverage, true)}
						<span class="block text-foreground/75" data-testid="coverage-parts"
							>{formatCount(coverage.numerator)} of {runs(coverage.denominator)} · {formatCount(
								coverage.excludedCount
							)} with unknown usage, left out of token shares{#if partial}{' '}· partial{/if}</span
						>
					</span>
				</dd>
			</div>
		</dl>

		<div
			role="group"
			aria-labelledby={infraId}
			class="flex flex-col gap-2 border-l-2 border-chart-3 bg-muted/40 p-3"
			data-testid="infrastructure-lost"
			data-availability={infra.share.availability}
		>
			<h3 id={infraId} class="text-sm font-light">Infrastructure-lost</h3>
			<p class="font-mono text-foreground" data-testid="overlap-note">
				Overlaps with rework: a separate measure, not a partition. Never added to or subtracted from
				rework.
			</p>
			<dl class="flex flex-col gap-1 font-mono tabular-nums">
				<div class="grid grid-cols-[10rem_1fr] gap-x-3" data-figure="attempts">
					<dt class="text-foreground/75">Attempts</dt>
					<dd>
						<MetricValue metric={infra.attempts} /> of {runs(
							infra.attempts.sampleSize
						)}{#if partial}{' '}· partial{/if}
					</dd>
				</div>
				<div class="grid grid-cols-[10rem_1fr] gap-x-3" data-figure="tokens">
					<dt class="text-foreground/75">Tokens</dt>
					<dd>
						<MetricValue metric={infra.tokens} /> · <MetricValue metric={infra.share} percent /> of {formatCount(
							infra.share.denominator
						)} known-usage tokens{#if infra.share.value === null && infra.share.unavailableReason}{' '}—
							{infra.share.unavailableReason}{/if}
					</dd>
				</div>
				<div class="grid grid-cols-[10rem_1fr] gap-x-3" data-figure="overlap">
					<dt class="text-foreground/75">Also rework</dt>
					<dd>
						<MetricValue metric={infra.overlap.runs} />
						{infra.overlap.runs.value === 1 ? 'run' : 'runs'} · <MetricValue
							metric={infra.overlap.tokens}
						/> tokens counted in both
					</dd>
				</div>
			</dl>
			<p class="text-foreground/75">{infra.attempts.definition}</p>
		</div>
	{/if}
</article>
