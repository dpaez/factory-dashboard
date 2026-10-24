<script lang="ts">
	import { formatCount, formatSpan, UNAVAILABLE, words } from '$lib/factory/format';
	import type { Metric } from '$lib/factory/stats';
	import {
		SMALL_SAMPLE,
		type ContributorMeasure,
		type TimeBreakdown
	} from '$lib/factory/stats-tickets';
	import MetricValue from './metric-value.svelte';
	import type { PanelState } from './panel-state';
	import StatsPanelState from './stats-panel-state.svelte';

	/**
	 * Start → handoff over the executions that reached handoff (mean, median,
	 * nearest-rank P90), with the sample and the exclusions beside it. Waiting
	 * before handoff and factory time are rows, not bars; stage time bars share
	 * one duration scale. Every figure here uses the same eligible executions;
	 * overhead discloses its own sample. Unknown is "—", never 0.
	 */
	let {
		state: view,
		selected = null,
		onselect,
		onretry
	}: {
		state: PanelState<TimeBreakdown>;
		/** The measure ContributingTickets is listing, if it is one of this panel's. */
		selected?: ContributorMeasure | null;
		onselect?: (measure: ContributorMeasure) => void;
		onretry?: () => void;
	} = $props();

	const uid = $props.id();
	const headingId = `${uid}-time`;

	/** The exact figure for assistive tech: the rounded span plus whole seconds. */
	function exact(metric: Metric): string {
		if (metric.value === null) return 'Unavailable';
		return `${formatSpan(metric.value)} (${formatCount(Math.round(metric.value / 1000))} seconds)`;
	}

	const selectable =
		'cursor-pointer text-left underline decoration-foreground/30 underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/30 aria-pressed:bg-muted aria-pressed:decoration-foreground';
</script>

<article
	aria-labelledby={headingId}
	data-slot="time-breakdown"
	data-state={view.kind}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	class="not-prose flex min-w-0 flex-col gap-3 text-xs/relaxed"
>
	<h2 id={headingId} class="text-base font-light">Time to handoff</h2>
	{#if view.kind !== 'ready'}
		<StatsPanelState state={view} {onretry} />
	{:else}
		{@const model = view.model}
		{@const n = model.sampleSize}
		{@const head = model.startToHandoff}
		{@const executions = model.executions.value}
		{#if !model.complete}
			<p class="font-mono text-foreground/75" data-testid="facts-incomplete" role="note">
				Ticket facts incomplete: not every execution in the window was loaded. Means, medians and
				P90 are Unavailable; counts are partial.
			</p>
		{/if}

		<dl class="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="start-to-handoff">
			<div class="flex flex-col gap-1" data-figure="mean">
				<dt class="text-foreground/75">Mean start → handoff</dt>
				<dd class="text-2xl font-light"><MetricValue metric={head.mean} /></dd>
			</div>
			<div class="flex flex-col gap-1" data-figure="median">
				<dt class="text-foreground/75">Median</dt>
				<dd class="flex items-baseline gap-2">
					<span class="text-lg font-light"><MetricValue metric={head.median} /></span>
					<span class="font-mono text-foreground/75 tabular-nums" data-testid="median-sample"
						>n = {formatCount(n)}</span
					>
				</dd>
			</div>
			<div class="flex flex-col gap-1" data-figure="p90">
				<dt class="text-foreground/75">
					P90 <span class="text-foreground/60">(nearest-rank)</span>
				</dt>
				<dd class="flex items-baseline gap-2">
					<span class="text-lg font-light"><MetricValue metric={head.p90} /></span>
					<span class="font-mono text-foreground/75 tabular-nums" data-testid="p90-sample"
						>n = {formatCount(n)}</span
					>
				</dd>
			</div>
		</dl>
		{#if n > 0 && n < SMALL_SAMPLE}
			<p class="font-mono text-foreground/75" data-testid="small-sample">
				Small sample: {formatCount(n)}
				{n === 1 ? 'execution' : 'executions'}. Quantiles over so few executions move a lot.
			</p>
		{/if}

		<p class="font-mono text-foreground/75 tabular-nums" data-testid="time-sample">
			<button
				type="button"
				class={selectable}
				aria-pressed={selected === 'timeSample'}
				onclick={() => onselect?.('timeSample')}
				>{formatCount(n)} of {formatCount(executions)} executions reached handoff</button
			>
			·
			<button
				type="button"
				class={selectable}
				aria-pressed={selected === 'timeExcluded'}
				onclick={() => onselect?.('timeExcluded')}
				data-testid="time-excluded">{formatCount(model.excludedCount)} excluded</button
			>{#if model.excludedByOutcome.length > 0}{' '}({model.excludedByOutcome
					.map((item) => `${formatCount(item.count)} ${words(item.outcome)}`)
					.join(', ')}){/if}{#if !model.complete}{' '}· partial{/if}
		</p>

		<dl class="flex flex-col gap-1" data-testid="time-split">
			<div class="grid grid-cols-[12rem_1fr] gap-3" data-figure="waiting-before-handoff">
				<dt class="text-foreground/75">Waiting before handoff</dt>
				<dd><MetricValue metric={model.waitingBeforeHandoff} /> mean</dd>
			</div>
			<div class="grid grid-cols-[12rem_1fr] gap-3" data-figure="factory-time">
				<dt class="text-foreground/75">Factory time</dt>
				<dd><MetricValue metric={model.factoryTime} /> mean</dd>
			</div>
		</dl>
		{#if model.clampedCount > 0}
			<p class="font-mono text-foreground/75" data-testid="clamped">
				{formatCount(model.clampedCount)}
				{model.clampedCount === 1 ? 'execution has' : 'executions have'} factory time 0: the factory clamps
				it at 0, so its waiting before handoff may be overstated.
			</p>
		{/if}

		<div class="flex flex-col gap-2" data-testid="stage-time">
			<h3 class="text-sm font-light">Stage time</h3>
			<ul class="flex flex-col gap-2" aria-label="Mean stage time per execution">
				{#each model.stages as stage (stage.stage)}
					{@const mean = stage.mean}
					<li
						data-stage={stage.stage}
						data-availability={mean.value === null
							? 'unavailable'
							: stage.noRuns
								? 'no-runs'
								: mean.availability}
						class="grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[5rem_1fr_9rem]"
					>
						<span class="font-mono text-foreground/75">{stage.label}</span>
						<div class="h-4 bg-muted" aria-hidden="true">
							{#if mean.value !== null && !stage.noRuns}
								<div
									class="h-full bg-chart-3"
									data-slot="stage-bar"
									style:width={`${(stage.scale * 100).toFixed(2)}%`}
								></div>
							{/if}
						</div>
						<span class="col-start-2 font-mono tabular-nums sm:col-start-auto sm:text-right">
							{#if mean.value === null}
								{UNAVAILABLE}{' '}<span class="sr-only">Unavailable</span>
							{:else if stage.noRuns}
								<span class="text-foreground/75">Not run in these executions</span>
							{:else}
								<span aria-hidden="true">{formatSpan(mean.value)}</span><span class="sr-only"
									>{stage.label} stage time: {exact(mean)} mean per execution</span
								>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
			<p class="font-mono text-foreground/75 tabular-nums" data-testid="stage-sample">
				Over {formatCount(n)}
				{n === 1 ? 'execution' : 'executions'} that reached handoff; a stage an execution did not run
				counts as 0.{#if n > 0 && (model.overhead.excludedCount ?? 0) > 0}{' '}<span
						data-testid="stage-partial"
						>Partial: {formatCount(model.overhead.excludedCount)} of {formatCount(n)} have no stage timings
						and count as 0.</span
					>{/if}
			</p>
			{#if model.inconsistencyMs !== null}
				<p class="font-mono text-foreground" data-testid="time-inconsistent" role="note">
					Inconsistent: mean stage time exceeds mean factory time by {formatSpan(
						model.inconsistencyMs
					)} for these executions.
				</p>
			{:else}
				<p class="font-mono text-foreground/75" data-testid="unattributed">
					Unattributed factory time: <MetricValue metric={model.unattributed} /> mean
				</p>
			{/if}
		</div>

		<p class="font-mono text-foreground/75 tabular-nums" data-testid="agent-overhead">
			Agent time <span class="text-foreground"><MetricValue metric={model.agentTime} /></span> mean
			per execution (n = {formatCount(model.agentTime.sampleSize)}; runs can overlap, not wall time)
			· Overhead <span class="text-foreground"><MetricValue metric={model.overhead} /></span> mean
			(n = {formatCount(model.overhead.sampleSize)}{#if model.overhead.availability === 'partial'},
				partial: {formatCount(model.overhead.excludedCount)} without stage timings left out{/if})
		</p>
	{/if}
</article>
