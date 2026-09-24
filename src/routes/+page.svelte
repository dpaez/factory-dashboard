<script lang="ts">
	import type { PageProps } from './$types';

	import InfoCard from "$lib/components/info-card.svelte";
  import InfoCostCard from "$lib/components/info-cost-card.svelte";
	import Badge from "$lib/components/ui/badge/badge.svelte";
  import WorkCard from "$lib/components/work-card.svelte";
  import TicketsTable from "$lib/components/tickets-table.svelte";
  import { columns } from "$lib/components/tickets-table-columns.js";
  
  import { CalendarClock as CalendarClockIcon } from '@lucide/svelte';

	let { data }: PageProps = $props();
  let tickets = $derived(data.tickets);

  let counts = $derived.by(() => {
    const next = { plan: 0, work: 0, review: 0, wrapup: 0, complete: 0 };
    for (const ticket of tickets) {
      if (ticket.stage in next) next[ticket.stage as keyof typeof next]++;
      if (ticket.status === "complete") next.complete++;
    }
    return next;
  });

  let activeTickets = $derived(counts.plan + counts.work + counts.review + counts.wrapup);

  let ticketsSubtitle = $derived.by(() => `
    ${counts.complete} complete ▪ ${activeTickets} pending
  `);

  let usage = $derived.by(() => {
    const next = { costUsd: 0, tokensInput: 0, tokensOutput: 0, tokensCacheRead: 0, tokensCacheWrite: 0 };
    for (const ticket of tickets) {
      next.costUsd += ticket.usages.reduce((acc, usage) => acc + usage.costUsd, 0);
      next.tokensInput += ticket.usages.reduce((acc, usage) => acc + usage.tokensInput, 0);
      next.tokensOutput += ticket.usages.reduce((acc, usage) => acc + usage.tokensOutput, 0);
      next.tokensCacheRead += ticket.usages.reduce((acc, usage) => acc + usage.tokensCacheRead, 0);
      next.tokensCacheWrite += ticket.usages.reduce((acc, usage) => acc + usage.tokensCacheWrite, 0);
    }
    return next;
  });

  let attentionSubtitle = $derived.by(() => {
    return tickets.filter(ticket => ticket.status === 'blocked').map(ticket => ticket.title).join(', ') || 'No blocked tickets';
  });
</script>

<main class="flex flex-col gap-6  ">
  <section>
    <div class="flex flex-col gap-4 md:flex-row md:justify-between mt-2 mb-8 md:items-start">
      <div class="flex flex-col">
        <h2 class="not-prose text-4xl font-light">Factory Overview</h2>
        <p class="text-muted-foreground not-prose mt-2 text-sm font-extralight">
          Current snapshot across parallel tickets
        </p>
      </div>
      <Badge variant="outline" class="px-4 py-1 mt-1 font-mono tabular-nums h-auto [&>svg]:size-4!">
        <CalendarClockIcon class="mr-2" /><span class="text-xs font-light">Updated Sep 12 · 00:03 UTC</span>
      </Badge>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 justify-items-center-safe">
      <InfoCard title="Tickets" subtitle={ticketsSubtitle} value={activeTickets} />
      <InfoCostCard title="Cost" value={usage.costUsd} tokensInputUsage={usage.tokensInput} tokensOutputUsage={usage.tokensOutput} tokensCacheRead={usage.tokensCacheRead} tokensCacheWrite={usage.tokensCacheWrite} />
      <InfoCard title="Attention" subtitle={attentionSubtitle} value={counts.review} />
    </div>
  </section>
  <section>
    <h3 class="not-prose text-2xl font-light mb-6">Workflow</h3>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 justify-items-center-safe">
      <WorkCard title="Plan" value={counts.plan} />
      <WorkCard title="Work" value={counts.work} />
      <WorkCard title="Review" value={counts.review} />
      <WorkCard title="Wrap-up" value={counts.wrapup} />
    </div>
  </section>

  <section>
    <h3 class="not-prose text-2xl font-light mb-6">Tickets</h3>
    <TicketsTable data={tickets} {columns} />
  </section>
</main>