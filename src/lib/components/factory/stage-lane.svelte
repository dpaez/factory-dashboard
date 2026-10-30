<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import type { BoardLane } from '$lib/factory/board';
	import { CountFlash } from './count-flash.svelte';
	import LaneScroll from './lane-scroll.svelte';
	import TicketCard from './ticket-card.svelte';

	/**
	 * One Flow board lane: a pinned heading with its label, card count and the
	 * QA "optional" marker, then its cards in a list that scrolls on its own.
	 * Empty, loading and error states keep the lane heading so the lane stays
	 * recognizable. The lane is a recessed well; the cards sit on it.
	 */
	let {
		lane,
		selectedKey = null,
		loading = false,
		error = null,
		onselect
	}: {
		lane: Pick<BoardLane, 'id' | 'label' | 'optional' | 'cards'>;
		selectedKey?: string | null;
		loading?: boolean;
		/** A message when the lane could not be read. */
		error?: string | null;
		onselect?: (key: string) => void;
	} = $props();

	const count = $derived(lane.cards.length);
	const flash = new CountFlash(() => count);
	const uid = $props.id();
	const headingId = `${uid}-heading`;

	// Below the desktop row, a lane shows one card until See more opens it.
	// A selected card past that first one keeps the lane open so it can take focus.
	let opened = $state(false);
	const selectedPastPeek = $derived(lane.cards.findIndex((card) => card.key === selectedKey) > 0);
	const expanded = $derived(opened || selectedPastPeek);
</script>

<div
	role="group"
	data-slot="stage-lane"
	data-lane={lane.id}
	data-expanded={expanded ? 'true' : 'false'}
	aria-labelledby={headingId}
	class={cn(
		'group/lane flex min-h-0 min-w-0 flex-col bg-muted max-lg:self-start lg:h-full',
		expanded && 'h-80'
	)}
>
	<h2
		id={headingId}
		class="flex shrink-0 items-baseline gap-2 border-b border-border px-3 py-2 text-sm font-medium text-foreground"
	>
		<span>{lane.label}</span>
		{#if !loading && !error}
			<span
				data-slot="lane-count"
				data-flash={flash.active ? 'on' : undefined}
				class={cn(
					'px-1 font-mono text-lg font-bold text-foreground tabular-nums transition-colors duration-300',
					flash.active && 'bg-primary text-primary-foreground'
				)}>{count}</span
			>
		{/if}
		{#if lane.optional}
			<span class="text-[0.625rem] font-normal text-foreground/75">optional</span>
		{/if}
	</h2>

	<LaneScroll>
		{#if error}
			<p role="alert" class="bg-background p-3 text-xs text-foreground">
				<span class="font-medium">Lane unavailable.</span>
				{error}
			</p>
		{:else if loading}
			<div aria-busy="true" class="flex flex-col gap-2">
				<span class="sr-only">Loading {lane.label} lane</span>
				{#each [0, 1] as placeholder (placeholder)}
					<div
						data-slot="card-placeholder"
						class="h-28 animate-pulse bg-background ring-1 ring-foreground/10 motion-reduce:animate-none"
					></div>
				{/each}
			</div>
		{:else if count === 0}
			<p class="p-3 text-xs text-foreground/75 ring-1 ring-foreground/10 ring-inset">
				No tickets in {lane.label}
			</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each lane.cards as card, index (card.key)}
					<li class={cn('min-w-0', index > 0 && 'max-lg:group-data-[expanded=false]/lane:hidden')}>
						<TicketCard
							{card}
							selected={card.key === selectedKey}
							showStage={lane.id === 'other'}
							{onselect}
						/>
					</li>
				{/each}
			</ul>
		{/if}
	</LaneScroll>
	{#if count > 1}
		<Button
			variant="ghost"
			size="sm"
			data-slot="lane-more"
			class="m-2 self-start lg:hidden"
			aria-expanded={expanded}
			onclick={() => (opened = !opened)}
		>
			{expanded ? 'See less' : 'See more'}
		</Button>
	{/if}
</div>
