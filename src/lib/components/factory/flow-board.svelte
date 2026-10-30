<script lang="ts">
	import { PanelLeftClose, PanelLeftOpen } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import { toBoard, type BoardLane } from '$lib/factory/board';
	import StageLane from './stage-lane.svelte';

	/**
	 * The Flow board: one lane per stage in projection order. From the `lg`
	 * breakpoint up, the lanes share one viewport row and each scrolls its
	 * cards. Below that, a phone shows one column and a tablet two, and the
	 * rest stack; each column peeks one card until See more. Selection is
	 * owned by the caller (`selectedKey`, `onselect`). Nothing is draggable.
	 *
	 * A ticket that changes lanes is a new card element, so the focused card
	 * would lose focus to `body`. The board remembers the focused card's key
	 * and, after lanes change, refocuses that card when focus fell to `body`.
	 * Focus the user moved elsewhere is never taken back.
	 *
	 * An optional `backlog` snippet renders as the first column, before Plan,
	 * with a divider on its trailing edge. It folds to the left, leaving the
	 * icon button.
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

	let backlogOpen = $state(true);
	// False until the operator uses the fold button. Below this width the five
	// pipeline lanes cannot stay readable beside an open Backlog, so it folds
	// itself until they ask for it.
	let backlogChosen = $state(false);
	const backlogRoom = 60 * 16;

	// Loading or failed before any data: show the known lanes, empty.
	const placeholderLanes = toBoard({
		tickets: [],
		complete: true,
		agents: null,
		details: []
	}).lanes;
	const shown = $derived(lanes.length === 0 && (loading || error) ? placeholderLanes : lanes);

	let root: HTMLElement | undefined = $state();

	$effect(() => {
		const node = root;
		if (!node || !backlog) return;
		const fit = () => {
			if (backlogChosen) return;
			backlogOpen = node.clientWidth >= backlogRoom;
		};
		fit();
		const observer = new ResizeObserver(fit);
		observer.observe(node);
		return () => observer.disconnect();
	});

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
	class="not-prose grid h-auto grid-cols-1 gap-3 md:grid-cols-2 lg:flex lg:h-full lg:min-h-0 lg:grid-cols-none lg:overflow-hidden"
	{onfocusin}
	{onfocusout}
>
	{#if backlog}
		<div
			data-slot="flow-board-backlog"
			data-open={backlogOpen ? 'true' : 'false'}
			class={cn(
				'flex min-h-0 flex-col bg-muted lg:h-full lg:shrink-0 lg:flex-row lg:border-r lg:border-border',
				backlogOpen ? 'lg:w-80 lg:max-w-[36%] lg:min-w-12' : 'lg:w-8'
			)}
		>
			<div class="hidden w-8 shrink-0 justify-center pt-1.5 lg:flex">
				<Button
					variant="ghost"
					size="icon-sm"
					data-slot="backlog-fold"
					aria-expanded={backlogOpen}
					aria-label={backlogOpen ? 'Hide backlog' : 'Show backlog'}
					onclick={() => {
						backlogChosen = true;
						backlogOpen = !backlogOpen;
					}}
				>
					{#if backlogOpen}
						<PanelLeftClose aria-hidden="true" />
					{:else}
						<PanelLeftOpen aria-hidden="true" />
					{/if}
				</Button>
			</div>
			<div class={cn('min-h-0 min-w-0', backlogOpen ? 'lg:flex-1' : 'lg:hidden')}>
				{@render backlog()}
			</div>
		</div>
	{/if}
	<div
		class="contents lg:grid lg:h-full lg:min-h-0 lg:min-w-0 lg:flex-1 lg:auto-cols-[minmax(0,1fr)] lg:grid-flow-col lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:overflow-hidden"
	>
		{#each shown as lane (lane.id)}
			<StageLane {lane} {selectedKey} {loading} {error} {onselect} />
		{/each}
	</div>
</div>
