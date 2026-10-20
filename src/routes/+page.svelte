<script lang="ts">
	import type { PageProps } from './$types';

	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import BoardSummary from '$lib/components/factory/board-summary.svelte';
	import FlowBoard from '$lib/components/factory/flow-board.svelte';

	let { data }: PageProps = $props();
	let board = $derived(data.board);

	// The selection lives only in the URL; the server load never reads it.
	let selectedKey = $derived(page.url.searchParams.get('ticket'));
	let selectedCard = $derived(
		selectedKey === null
			? null
			: (board.lanes.flatMap((lane) => lane.cards).find((card) => card.key === selectedKey) ?? null)
	);

	function select(key: string) {
		goto('?ticket=' + encodeURIComponent(key), {
			keepFocus: true,
			noScroll: true,
			replaceState: false
		});
	}
</script>

<main class="flex flex-col gap-6">
	<section class="not-prose mt-2 flex flex-col gap-3">
		<h2 class="text-4xl font-light">Flow board</h2>
		<BoardSummary summary={board.summary} />
	</section>

	<section aria-label="Flow board lanes">
		<FlowBoard lanes={board.lanes} {selectedKey} onselect={select} />
	</section>

	<!-- TODO(#26): the ticket inspector replaces this selected-ticket region. -->
	{#if selectedKey !== null}
		<section
			aria-label="Selected ticket"
			data-testid="selected-ticket"
			class="not-prose flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-card p-3 text-sm ring-1 ring-foreground/10"
		>
			{#if selectedCard}
				<span class="font-mono text-xs text-foreground/75 tabular-nums">
					{selectedCard.displayRef}
				</span>
				<span class="font-medium wrap-anywhere">{selectedCard.title}</span>
			{/if}
			<a
				href={`/tickets/${encodeURIComponent(selectedKey)}`}
				class="underline outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
			>
				Open ticket
			</a>
		</section>
	{/if}
</main>
