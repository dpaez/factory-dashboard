<script lang="ts">
	import { formatCount, formatPercent, UNAVAILABLE } from '$lib/factory/format';
	import { DEFINITIONS, type Metric } from '$lib/factory/stats';
	import { EXPORT_UNAVAILABLE } from '$lib/factory/stats-efficiency';
	import type { ContributorMeasure, TicketsQuality } from '$lib/factory/stats-tickets';
	import MetricValue from './metric-value.svelte';
	import type { PanelState } from './panel-state';
	import StatsPanelState from './stats-panel-state.svelte';

	/**
	 * How often a person had to step in, and what happened after handoff. Each
	 * figure keeps its own numerator, denominator or sample; there is no
	 * combined score. Selecting a row lists its executions. "No returns to
	 * work" comes from the stats export; `null` means the export read failed.
	 */
	let {
		state: view,
		noReturnsToWork = null,
		selected = null,
		onselect,
		onretry
	}: {
		state: PanelState<TicketsQuality>;
		noReturnsToWork?: Metric | null;
		selected?: ContributorMeasure | null;
		onselect?: (measure: ContributorMeasure) => void;
		onretry?: () => void;
	} = $props();

	const uid = $props.id();
	const headingId = `${uid}-quality`;

	const selectable =
		'cursor-pointer text-left underline decoration-foreground/30 underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/30 aria-pressed:bg-muted aria-pressed:decoration-foreground';
</script>

<article
	aria-labelledby={headingId}
	data-slot="tickets-quality"
	data-state={view.kind}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	class="not-prose flex min-w-0 flex-col gap-3 text-xs/relaxed"
>
	<h2 id={headingId} class="text-base font-light">Tickets quality</h2>
	{#if view.kind !== 'ready'}
		<StatsPanelState state={view} {onretry} />
	{:else}
		{@const model = view.model}
		{@const needed = model.neededAPerson}
		{@const rounds = model.externalReviewRounds}
		{@const followUp = model.followUpCommits}
		{@const noReturns = noReturnsToWork}
		{#if !model.complete}
			<p class="font-mono text-foreground/75" data-testid="facts-incomplete" role="note">
				Ticket facts incomplete: not every execution in the window was loaded. Shares and medians
				are Unavailable; counts are partial.
			</p>
		{/if}
		<dl class="flex flex-col divide-y divide-foreground/10 ring-1 ring-foreground/10">
			<div
				class="flex flex-col gap-1 p-3"
				data-row="no-returns-to-work"
				data-availability={noReturns?.availability ?? 'unavailable'}
			>
				<dt>No returns to work</dt>
				<dd class="flex flex-col gap-1">
					<span class="font-mono tabular-nums" data-testid="no-returns-to-work-value">
						{#if noReturns === null}
							<span class="text-lg font-light"
								>{UNAVAILABLE} <span class="sr-only">Unavailable</span></span
							>
							<span class="text-foreground/75">— {EXPORT_UNAVAILABLE}</span>
						{:else}
							<span class="text-lg font-light"><MetricValue metric={noReturns} percent /></span>
							<span class="text-foreground/75"
								>{formatCount(noReturns.numerator)} of {formatCount(noReturns.denominator)} executions
								that reached handoff{#if noReturns.value === null && noReturns.unavailableReason}{' '}—
									{noReturns.unavailableReason}{/if}</span
							>
						{/if}
					</span>
					<p class="text-foreground/75" data-testid="no-returns-to-work-definition">
						{noReturns?.definition ?? DEFINITIONS.noReturnsToWork}
					</p>
				</dd>
			</div>

			<div class="flex flex-col gap-2 p-3" data-row="needed-a-person">
				<dt>
					<button
						type="button"
						class={selectable}
						aria-pressed={selected === 'neededAPerson'}
						onclick={() => onselect?.('neededAPerson')}>Needed a person</button
					>
				</dt>
				<dd class="flex flex-col gap-2">
					<span class="font-mono tabular-nums" data-testid="needed-a-person-value">
						<span class="text-lg font-light"
							>{formatPercent(needed.value)}{#if needed.value === null}{' '}<span class="sr-only"
									>Unavailable</span
								>{/if}</span
						>
						<span class="text-foreground/75"
							>{formatCount(needed.numerator)} of {formatCount(needed.denominator)} executions started
							in the window</span
						>
					</span>
					<ul
						class="grid grid-cols-2 gap-x-4 gap-y-1 font-mono tabular-nums sm:grid-cols-3"
						aria-label="Interventions by kind"
					>
						{#each model.interventions as item (item.kind)}
							<li data-intervention={item.kind} class="flex justify-between gap-2">
								<span class="text-foreground/75">{item.label}</span>
								<MetricValue metric={item.count} />
							</li>
						{/each}
					</ul>
					{#if model.reconciled === false}
						<p class="font-mono text-foreground/75" data-testid="not-reconciled">
							These execution rows do not match the cohort summary's intervention counts.
						</p>
					{/if}
				</dd>
			</div>

			<div class="flex flex-col gap-2 p-3" data-row="external-review-rounds">
				<dt>
					<button
						type="button"
						class={selectable}
						aria-pressed={selected === 'externalReviewRounds'}
						onclick={() => onselect?.('externalReviewRounds')}>External review rounds</button
					>
				</dt>
				<dd class="flex flex-col gap-1">
					<span class="font-mono tabular-nums">
						<span class="text-lg font-light"><MetricValue metric={rounds.total} /></span>
						<span class="text-foreground/75"
							>· {formatCount(rounds.human.value)} human · {formatCount(rounds.bot.value)} bot · median
							<span class="text-foreground"><MetricValue metric={rounds.median} fractional /></span>
							over {formatCount(rounds.sampleSize)} executions with a merged or abandoned pull request</span
						>
					</span>
					<p class="text-foreground/75" data-testid="external-review-rounds-definition">
						{rounds.total.definition}
					</p>
				</dd>
			</div>

			<div
				class="flex flex-col gap-1 p-3"
				data-row="external-changes-requested"
				data-availability={model.externalChangesRequested.availability}
			>
				<dt>External changes requested</dt>
				<dd class="font-mono">
					{UNAVAILABLE} <span class="text-foreground">Unavailable</span>
					<span class="text-foreground/75"
						>— {model.externalChangesRequested.unavailableReason}</span
					>
				</dd>
			</div>

			<div class="flex flex-col gap-1 p-3" data-row="follow-up-commits">
				<dt>
					<button
						type="button"
						class={selectable}
						aria-pressed={selected === 'followUpCommits'}
						onclick={() => onselect?.('followUpCommits')}>Follow-up commits after handoff</button
					>
				</dt>
				<dd class="font-mono tabular-nums">
					<span class="text-lg font-light"><MetricValue metric={followUp} /></span>
					<span class="text-foreground/75"
						>over {formatCount(followUp.sampleSize)} executions that reached handoff{#if followUp.availability === 'partial'}{' '}·
							partial{/if}</span
					>
				</dd>
			</div>
		</dl>
	{/if}
</article>
