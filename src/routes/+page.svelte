<script lang="ts">
	import type { PageProps } from './$types';

	import InfoCard from '$lib/components/info-card.svelte';
	import InfoCostCard from '$lib/components/info-cost-card.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import WorkCard from '$lib/components/work-card.svelte';
	import TicketsTable from '$lib/components/tickets-table.svelte';
	import { columns } from '$lib/components/tickets-table-columns.js';

	import { CalendarClock as CalendarClockIcon } from '@lucide/svelte';

	let { data }: PageProps = $props();
	let overview = $derived(data.overview);
	let tickets = $derived(data.tickets);

	let ticketsSubtitle = $derived(
		`${overview.completeCount} complete ▪ ${overview.activeCount} active`
	);

	// The Attention card is driven by open attention requests (title +
	// question), not by any legacy `blocked` status derivation.
	let attentionSubtitle = $derived(
		overview.openAttention.length > 0
			? overview.openAttention
					.map((request) => `${request.ticketTitle ?? request.ticketId}: ${request.question}`)
					.join(' · ')
			: 'No open attention requests'
	);

	// A real timestamp from the database; `—` when the factory has no
	// executions yet (the overview must not fabricate data).
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
					Current snapshot across parallel tickets
				</p>
			</div>
			<Badge variant="outline" class="mt-1 h-auto px-4 py-1 font-mono tabular-nums [&>svg]:size-4!">
				<CalendarClockIcon class="mr-2" /><span class="text-xs font-light">{updatedLabel}</span>
			</Badge>
		</div>

		<div class="grid grid-cols-1 justify-items-center-safe md:grid-cols-3">
			<InfoCard title="Active" subtitle={ticketsSubtitle} value={overview.activeCount} />
			<InfoCostCard
				title="Cost"
				value={overview.totals.costUsd}
				tokensInputUsage={overview.totals.tokensInput}
				tokensOutputUsage={overview.totals.tokensOutput}
				tokensCacheRead={overview.totals.tokensCacheRead}
				tokensCacheWrite={overview.totals.tokensCacheWrite}
			/>
			<InfoCard
				title="Attention"
				subtitle={attentionSubtitle}
				value={overview.openAttention.length}
			/>
		</div>
	</section>
	<section>
		<h3 class="not-prose mb-6 text-2xl font-light">Workflow</h3>
		<!-- Stage `done` gets no card: completed executions are counted in the
		     Active card's "complete" figure instead. -->
		<div class="grid grid-cols-2 justify-items-center-safe lg:grid-cols-4">
			<WorkCard title="Plan" value={overview.stageCounts.plan} />
			<WorkCard title="Work" value={overview.stageCounts.work} />
			<WorkCard title="Review" value={overview.stageCounts.review} />
			<WorkCard title="Wrap-up" value={overview.stageCounts.wrapup} />
		</div>
	</section>

	<section>
		<h3 class="not-prose mb-6 text-2xl font-light">Tickets</h3>
		{#if tickets.length === 0}
			<div class="not-prose font-mono text-sm text-muted-foreground">
				<p>No tickets yet.</p>
				<p class="mt-1 font-extralight">
					The factory has nothing to show — tickets appear here as soon as the controller records
					them.
				</p>
			</div>
		{:else}
			<TicketsTable data={tickets} {columns} />
		{/if}
	</section>
</main>
