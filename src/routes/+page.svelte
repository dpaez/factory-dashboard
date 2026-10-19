<script lang="ts">
	import type { PageProps } from './$types';

	import InfoCard from '$lib/components/info-card.svelte';
	import InfoCostCard from '$lib/components/info-cost-card.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import WorkCard from '$lib/components/work-card.svelte';
	import TicketsTable from '$lib/components/tickets-table.svelte';
	import { columns } from '$lib/components/tickets-table-columns.js';
	import { OPEN_TICKETS_USAGE_LABEL } from '$lib/factory/adapters';

	import { CalendarClock as CalendarClockIcon } from '@lucide/svelte';

	let { data }: PageProps = $props();
	let overview = $derived(data.overview);

	const STAGE_CARDS = [
		['plan', 'Plan'],
		['work', 'Work'],
		['qa', 'QA'],
		['review', 'Review'],
		['wrapup', 'Wrap-up']
	] as const;

	// Counts from a list cut at the pager bound are partial: say so.
	let partial = $derived(overview.complete ? '' : ' (partial)');

	let attentionSubtitle = $derived(
		overview.needsAttention.count > 0
			? overview.needsAttention.refs.map((ref) => ref.displayRef).join(' · ')
			: 'No ticket needs you'
	);

	let usage = $derived(overview.usage);
	let usageFigures = $derived(usage.available ? usage.usage : null);
	let usageSubtitle = $derived.by(() => {
		if (!usage.available) return 'Unavailable: not every open ticket could be read';
		if (usage.label !== OPEN_TICKETS_USAGE_LABEL) return usage.label;
		return 'Current execution of each open ticket';
	});

	let updatedLabel = $derived.by(() => {
		if (overview.updatedAt === null) return 'Updated —';
		const date = new Date(overview.updatedAt);
		if (Number.isNaN(date.getTime())) return 'Updated —';
		const iso = date.toISOString();
		return `Updated ${iso.slice(0, 10)} · ${iso.slice(11, 16)} UTC`;
	});
</script>

<main class="flex flex-col gap-6">
	<section>
		<div class="mt-2 mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
			<div class="flex flex-col">
				<h2 class="not-prose text-4xl font-light">Factory Overview</h2>
				<p class="not-prose mt-2 text-sm font-extralight text-muted-foreground">
					Current snapshot across open tickets
				</p>
			</div>
			<Badge variant="outline" class="mt-1 h-auto px-4 py-1 font-mono tabular-nums [&>svg]:size-4!">
				<CalendarClockIcon class="mr-2" /><span class="text-xs font-light">{updatedLabel}</span>
			</Badge>
		</div>

		{#if !overview.complete}
			<p class="not-prose mb-4 font-mono text-sm text-muted-foreground" data-testid="partial-note">
				Showing the first {overview.tickets.length} open tickets. Counts are partial.
			</p>
		{/if}

		<div
			class="grid grid-cols-1 justify-items-center-safe gap-4 md:grid-cols-3"
			data-testid="overview-cards"
		>
			<div data-testid="needs-attention-card">
				<InfoCard
					title={`Needs attention${partial}`}
					subtitle={attentionSubtitle}
					value={overview.needsAttention.count}
				/>
			</div>
			<div data-testid="active-agents-card">
				<InfoCard
					title="Active agents"
					subtitle={overview.activeAgents === null ? 'Unavailable' : 'Running now'}
					value={overview.activeAgents ?? '—'}
				/>
			</div>
			<div data-testid="cost-card">
				<InfoCostCard
					title={OPEN_TICKETS_USAGE_LABEL}
					subtitle={usageSubtitle}
					value={usageFigures?.costUsd ?? null}
					tokensInputUsage={usageFigures?.tokensInput ?? null}
					tokensOutputUsage={usageFigures?.tokensOutput ?? null}
					tokensCacheRead={usageFigures?.tokensCacheRead ?? null}
					tokensCacheWrite={usageFigures?.tokensCacheWrite ?? null}
				/>
			</div>
		</div>
	</section>
	<section>
		<h3 class="not-prose mb-6 text-2xl font-light">Stages{partial}</h3>
		<!-- Stage `done` gets no card: finished tickets live on /tickets. -->
		<div
			class="grid grid-cols-2 justify-items-center-safe gap-4 md:grid-cols-3 lg:grid-cols-5"
			data-testid="stage-cards"
		>
			{#each STAGE_CARDS as [stage, title] (stage)}
				<div data-stage={stage}>
					<WorkCard {title} value={overview.stageCounts[stage]} />
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h3 class="not-prose mb-6 text-2xl font-light">Open tickets</h3>
		{#if overview.tickets.length === 0}
			<div class="not-prose font-mono text-sm text-muted-foreground">
				<p>No open tickets.</p>
				<p class="mt-1 font-extralight">
					Finished tickets are listed under <a href="/tickets" class="underline">Tickets</a>.
				</p>
			</div>
		{:else}
			<TicketsTable data={overview.tickets} {columns} />
		{/if}
	</section>
</main>
