<script>
	import InfoCard from "$lib/components/info-card.svelte";
	import Badge from "$lib/components/ui/badge/badge.svelte";
  import { CalendarClock as CalendarClockIcon } from '@lucide/svelte';
  import WorkCard from "$lib/components/work-card.svelte";
  import TicketsTable from "$lib/components/tickets-table.svelte";
  import { columns, data as tickets } from "$lib/components/tickets-table-columns.js";

  let planningTickets = 2;
  let workTickets = 1;
  let reviewTickets = 1;
  let wrapupTickets = 3; // this is like done

  let totalTickets = planningTickets + workTickets + reviewTickets + wrapupTickets;

  let ticketsSubtitle = `
    ${wrapupTickets} complete ▪ ${totalTickets - wrapupTickets} pending
  `;
  let costSubtitle = 'Includes partial usage for PROJ-14'

  let attentionSubtitle = 'PROJ-14 ▪ review round 1'
</script>

<main class="flex flex-col gap-6  ">
  <section>
    <div class="flex mt-2 mb-8 justify-between items-start">
      <div class="flex flex-col">
        <h2 class="not-prose text-4xl font-light">Factory Overview</h2>
        <p class="text-muted-foreground not-prose mt-2 text-sm font-extralight">
          Current snapshot across parallel tickets
        </p>
      </div>
      <Badge variant="outline" class="px-4 py-1 mt-1 font-mono tabular-nums h-auto [&>svg]:size-4!">
        <CalendarClockIcon class="mr-2" /><span class="text-sm font-light">Updated Sep 12 · 00:03 UTC</span>
      </Badge>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 justify-items-center-safe">
      <InfoCard title="Tickets" subtitle={ticketsSubtitle} value={totalTickets} />
      <InfoCard title="Cost" subtitle={costSubtitle} value={'$4.7729'} />
      <InfoCard title="Attention" subtitle={attentionSubtitle} value={reviewTickets} />
    </div>
  </section>
  <section>
    <h3 class="not-prose text-2xl font-light mb-6">Workflow</h3>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 justify-items-center-safe">
      <WorkCard title="Plan" value={planningTickets} />
      <WorkCard title="Work" value={workTickets} />
      <WorkCard title="Review" value={reviewTickets} />
      <WorkCard title="Wrap-up" value={wrapupTickets} />
    </div>
  </section>

  <section>
    <h3 class="not-prose text-2xl font-light mb-6">Tickets</h3>
    <TicketsTable data={tickets} {columns} />
  </section>
</main>