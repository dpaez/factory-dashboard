<script lang="ts">
	import type { PageProps } from './$types';

	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import BacklogLane from '$lib/components/factory/backlog-lane.svelte';
	import BoardSummary from '$lib/components/factory/board-summary.svelte';
	import FlowBoard from '$lib/components/factory/flow-board.svelte';
	import IssuePreview from '$lib/components/factory/issue-preview.svelte';
	import { BacklogState } from '$lib/factory/backlog-state.svelte';

	let { data }: PageProps = $props();
	let board = $derived(data.board);

	const backlogState = new BacklogState();
	// The load streams the backlog; a rerun of the load seeds it again.
	$effect.pre(() => {
		backlogState.seed(data.backlog);
	});

	let summary = $derived({
		...board.summary,
		readyToStart: backlogState.readyToStart,
		readyToStartComplete: backlogState.readyToStart === null || backlogState.complete
	});

	// The selection lives only in the URL; the server load never reads it.
	// `?issue=` and `?ticket=` share one region; an issue wins if both are present.
	let selectedIssueId = $derived(page.url.searchParams.get('issue'));
	let selectedKey = $derived(selectedIssueId === null ? page.url.searchParams.get('ticket') : null);
	let selectedCard = $derived(
		selectedKey === null
			? null
			: (board.lanes.flatMap((lane) => lane.cards).find((card) => card.key === selectedKey) ?? null)
	);
	let selectedIssue = $derived(
		selectedIssueId === null
			? null
			: (backlogState.cards.find((card) => card.id === selectedIssueId) ?? null)
	);

	/** Select into the URL; the other selection parameter is dropped. */
	function select(param: 'ticket' | 'issue', value: string) {
		goto(`?${param}=${encodeURIComponent(value)}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: false
		});
	}
</script>

<main class="flex flex-col gap-6">
	<section class="not-prose mt-2 flex flex-col gap-3">
		<h2 class="text-4xl font-light">Flow board</h2>
		<BoardSummary {summary} />
	</section>

	<section aria-label="Flow board lanes">
		<FlowBoard lanes={board.lanes} {selectedKey} onselect={(key) => select('ticket', key)}>
			{#snippet backlog()}
				<BacklogLane
					cards={backlogState.cards}
					bind:label={backlogState.label}
					fetchedAt={backlogState.fetchedAt}
					status={backlogState.status}
					failure={backlogState.reason}
					refreshing={backlogState.refreshing}
					complete={backlogState.complete}
					selectedId={selectedIssueId}
					onselect={(id) => select('issue', id)}
					onrefresh={() => backlogState.refresh()}
					onretry={() => backlogState.retry()}
				/>
			{/snippet}
		</FlowBoard>
	</section>

	<!-- One region below the board: the Issue preview for ?issue=, the ticket for ?ticket=. -->
	<div data-testid="selection" class="contents">
		{#if selectedIssueId !== null}
			<section aria-label="Selected issue" data-testid="selected-issue">
				<IssuePreview
					issue={selectedIssue}
					id={selectedIssueId}
					loading={backlogState.status === 'loading'}
				/>
			</section>
		{:else if selectedKey !== null}
			<!-- TODO(#26): the ticket inspector replaces this selected-ticket region. -->
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
	</div>
</main>
