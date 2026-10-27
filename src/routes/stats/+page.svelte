<script lang="ts">
	import type { PageProps } from './$types';

	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import ConfigurationComparison from '$lib/components/factory/stats/configuration-comparison.svelte';
	import EfficiencySignals from '$lib/components/factory/stats/efficiency-signals.svelte';
	import ContributingTickets from '$lib/components/factory/stats/contributing-tickets.svelte';
	import TicketsQuality from '$lib/components/factory/stats/tickets-quality.svelte';
	import TimeBreakdown from '$lib/components/factory/stats/time-breakdown.svelte';
	import CohortHeader from '$lib/components/factory/stats/cohort-header.svelte';
	import MeasurementNotes from '$lib/components/factory/stats/measurement-notes.svelte';
	import MetricSummaryRow from '$lib/components/factory/stats/metric-summary-row.svelte';
	import StageTable from '$lib/components/factory/stats/stage-table.svelte';
	import TokensByStage from '$lib/components/factory/stats/tokens-by-stage.svelte';
	import {
		failedPanel,
		readyPanel,
		type PanelState
	} from '$lib/components/factory/stats/panel-state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CONTRIBUTOR_MEASURES, type ContributorMeasure } from '$lib/factory/stats-tickets';
	import type { StatsPanelResult } from './+page.server';

	let { data }: PageProps = $props();

	const cohort = $derived(data.cohort);
	const summary = $derived(toPanel(data.summary));
	const stages = $derived(toPanel(data.stages));
	const tokens = $derived(toPanel(data.tokens));
	const tickets = $derived(toPanel(data.tickets));
	const time = $derived(toPanel(mapResult(data.tickets, (facts) => facts.time)));
	const quality = $derived(toPanel(mapResult(data.tickets, (facts) => facts.quality)));
	const configurations = $derived(toPanel(data.configurations));
	const efficiency = $derived(toPanel(mapResult(data.efficiency, (facts) => facts.signals)));
	/** `null` when the export read failed: the row reads Unavailable. */
	const noReturnsToWork = $derived(
		data.efficiency.ok ? data.efficiency.model.noReturnsToWork : null
	);

	/** The figure ContributingTickets lists: `?measure=`, else the time sample. */
	const measure = $derived.by((): ContributorMeasure => {
		const param = page.url.searchParams.get('measure');
		return (CONTRIBUTOR_MEASURES as readonly string[]).includes(param ?? '')
			? (param as ContributorMeasure)
			: 'timeSample';
	});
	const contributors = $derived(
		toPanel(mapResult(data.tickets, (facts) => facts.contributors[measure]))
	);
	const complete = $derived(tickets.kind === 'ready' ? tickets.model.complete : true);

	/** Selecting a figure keeps the window and swaps only `?measure=`; the load does not rerun. */
	function select(next: ContributorMeasure) {
		const url = new URL(page.url);
		url.searchParams.set('measure', next);
		void goto(url, { keepFocus: true, noScroll: true, replaceState: true });
	}

	const DAY_MS = 86_400_000;
	/** The window as the date inputs show it: the first and the last day included. */
	const fromDate = $derived(cohort.window.from.slice(0, 10));
	const toDate = $derived.by(() => {
		const to = new Date(cohort.window.to);
		// `to` is exclusive: a window ending at midnight ends on the day before.
		const lastDay = to.getTime() % DAY_MS === 0 ? new Date(to.getTime() - DAY_MS) : to;
		return lastDay.toISOString().slice(0, 10);
	});

	function mapResult<T, M>(result: StatsPanelResult<T>, to: (model: T) => M): StatsPanelResult<M> {
		return result.ok ? { ok: true, model: to(result.model) } : result;
	}

	function toPanel<T>(result: StatsPanelResult<T>): PanelState<T> {
		return result.ok ? readyPanel(result.model) : failedPanel(result.failure);
	}

	const retry = () => void invalidateAll();
</script>

<svelte:head>
	<title>Factory stats · Factory Dashboard</title>
</svelte:head>

<main class="flex flex-col gap-6">
	<section class="flex flex-col gap-6">
		<div class="mt-2 flex flex-col">
			<h2 class="not-prose text-4xl font-light">Factory stats</h2>
			<p class="not-prose mt-2 text-sm font-extralight text-muted-foreground">
				Tokens, cost and outcomes for the tickets started in one window
			</p>
		</div>

		<form
			method="GET"
			action="/stats"
			aria-label="Cohort window"
			class="not-prose flex flex-wrap items-end gap-4 text-xs/relaxed"
			data-testid="cohort-window-form"
		>
			<div class="flex flex-col gap-1">
				<Label for="stats-from">Started on or after</Label>
				<Input id="stats-from" name="from" type="date" value={fromDate} class="w-40 font-mono" />
			</div>
			<div class="flex flex-col gap-1">
				<Label for="stats-to">Started on or before</Label>
				<Input id="stats-to" name="to" type="date" value={toDate} class="w-40 font-mono" />
			</div>
			<Button type="submit">Apply</Button>
		</form>

		{#if data.notice}
			<p
				class="not-prose font-mono text-sm text-foreground/75"
				role="status"
				data-testid="window-notice"
			>
				{data.notice}
			</p>
		{/if}

		<CohortHeader {cohort} />

		<MetricSummaryRow state={summary} onretry={retry} />

		<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
			<div class="min-w-0 lg:col-span-2">
				<StageTable state={stages} onretry={retry} />
			</div>
			<TokensByStage state={tokens} onretry={retry} />
			<TimeBreakdown state={time} selected={measure} onselect={select} onretry={retry} />
			<TicketsQuality
				state={quality}
				{noReturnsToWork}
				selected={measure}
				onselect={select}
				onretry={retry}
			/>
			<EfficiencySignals state={efficiency} onretry={retry} />
			<MeasurementNotes definitions={cohort.definitions} />
			<div class="min-w-0 lg:col-span-2">
				<ContributingTickets state={contributors} {complete} onretry={retry} />
			</div>
			<div class="min-w-0 lg:col-span-2">
				<ConfigurationComparison state={configurations} onretry={retry} />
			</div>
		</div>
	</section>
</main>
