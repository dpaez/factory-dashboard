<script lang="ts">
	import type { Snippet } from 'svelte';
	import { toBoard, type BoardLane } from '$lib/factory/board';
	import StageLane from './stage-lane.svelte';

	/**
	 * The Flow board: one lane per stage in projection order. Selection is
	 * owned by the caller (`selectedKey`, `onselect`). Nothing is draggable.
	 *
	 * A ticket that changes lanes is a new card element, so the focused card
	 * would lose focus to `body`. The board remembers the focused card's key
	 * and, after lanes change, refocuses that card when focus fell to `body`.
	 * Focus the user moved elsewhere is never taken back.
	 *
	 * An optional `backlog` snippet renders as the first column, before Plan,
	 * with a divider on its trailing edge at desktop widths.
	 */
	let {
		lanes,
		selectedKey = null,
		loading = false,
		error = null,
		backlog = undefined,
		onselect
	}: {
		lanes: BoardLane[];
		selectedKey?: string | null;
		loading?: boolean;
		/** A board-level read failure, shown in every lane. */
		error?: string | null;
		/** The Backlog lane, shown as the first column. */
		backlog?: Snippet;
		onselect?: (key: string) => void;
	} = $props();

	// Loading or failed before any data: show the known lanes, empty.
	const placeholderLanes = toBoard({
		tickets: [],
		complete: true,
		agents: null,
		details: []
	}).lanes;
	const shown = $derived(lanes.length === 0 && (loading || error) ? placeholderLanes : lanes);

	let root: HTMLElement | undefined = $state();
	let focusedKey: string | null = null;

	function cardOf(target: EventTarget | null): HTMLElement | null {
		return target instanceof HTMLElement
			? target.closest<HTMLElement>('[data-slot="ticket-card"]')
			: null;
	}

	function onfocusin(event: FocusEvent) {
		focusedKey = cardOf(event.target)?.dataset.ticketKey ?? null;
	}

	function onfocusout(event: FocusEvent) {
		const card = cardOf(event.target);
		if (!card) return;
		// A card removed by a lane change loses focus while detached; keep its key.
		// A card that is still in the document lost focus to the user; forget it.
		queueMicrotask(() => {
			if (card.isConnected && focusedKey === card.dataset.ticketKey) focusedKey = null;
		});
	}

	$effect(() => {
		void shown;
		const key = focusedKey;
		if (!root || key === null) return;
		const active = document.activeElement;
		if (active !== null && active !== document.body) return;
		const card = [...root.querySelectorAll<HTMLElement>('[data-slot="ticket-card"]')].find(
			(element) => element.dataset.ticketKey === key
		);
		card?.focus();
	});
</script>

<div
	bind:this={root}
	data-slot="flow-board"
	class="not-prose grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6"
	{onfocusin}
	{onfocusout}
>
	{#if backlog}
		<div data-slot="flow-board-backlog" class="min-w-0 lg:border-r lg:border-border lg:pr-3">
			{@render backlog()}
		</div>
	{/if}
	{#each shown as lane (lane.id)}
		<StageLane {lane} {selectedKey} {loading} {error} {onselect} />
	{/each}
</div>
