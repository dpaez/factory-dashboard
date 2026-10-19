<script lang="ts">
	import type { PageProps } from './$types';

	import TicketsTable from '$lib/components/tickets-table.svelte';
	import { columns } from '$lib/components/tickets-table-columns.js';

	let { data }: PageProps = $props();
	let tickets = $derived(data.tickets);
</script>

<main class="flex flex-col gap-6">
	<section>
		<div class="mt-2 mb-8 flex flex-col">
			<h2 class="not-prose text-4xl font-light">Tickets</h2>
			<p class="not-prose mt-2 text-sm font-extralight text-muted-foreground">
				Every ticket the factory knows, open and finished
			</p>
		</div>

		{#if !tickets.complete}
			<p class="not-prose mb-4 font-mono text-sm text-muted-foreground" data-testid="partial-note">
				Showing the first {tickets.rows.length} tickets. The list is partial.
			</p>
		{/if}

		{#if tickets.rows.length === 0}
			<div class="not-prose font-mono text-sm text-muted-foreground">
				<p>No tickets yet.</p>
				<p class="mt-1 font-extralight">Tickets appear here once the factory starts one.</p>
			</div>
		{:else}
			<TicketsTable data={tickets.rows} {columns} />
		{/if}
	</section>
</main>
