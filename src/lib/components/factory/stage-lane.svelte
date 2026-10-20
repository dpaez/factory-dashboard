<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { BoardLane } from '$lib/factory/board';
	import { CountFlash } from './count-flash.svelte';
	import TicketCard from './ticket-card.svelte';

	/**
	 * One Flow board lane: a heading with its label, card count and the QA
	 * "optional" marker, then its cards in projection order. Empty, loading and
	 * error states keep the lane heading so the lane stays recognizable.
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
</script>

<div
	role="group"
	data-slot="stage-lane"
	data-lane={lane.id}
	aria-labelledby={headingId}
	class="flex min-w-0 flex-col gap-2"
>
	<h2
		id={headingId}
		class="flex items-baseline gap-2 border-b border-border pb-1 text-xs font-medium text-foreground"
	>
		<span>{lane.label}</span>
		{#if !loading && !error}
			<span
				data-slot="lane-count"
				data-flash={flash.active ? 'on' : undefined}
				class={cn(
					'px-1 font-mono text-foreground/75 tabular-nums transition-colors duration-300',
					flash.active && 'bg-primary text-primary-foreground'
				)}>{count}</span
			>
		{/if}
		{#if lane.optional}
			<span class="text-[0.625rem] font-normal text-foreground/75">optional</span>
		{/if}
	</h2>

	{#if error}
		<p role="alert" class="bg-muted p-3 text-xs text-foreground">
			<span class="font-medium">Lane unavailable.</span>
			{error}
		</p>
	{:else if loading}
		<div aria-busy="true" class="flex flex-col gap-2">
			<span class="sr-only">Loading {lane.label} lane</span>
			{#each [0, 1] as placeholder (placeholder)}
				<div
					data-slot="card-placeholder"
					class="h-28 animate-pulse bg-muted ring-1 ring-foreground/10 motion-reduce:animate-none"
				></div>
			{/each}
		</div>
	{:else if count === 0}
		<p class="p-3 text-xs text-foreground/75 ring-1 ring-foreground/10 ring-inset">
			No tickets in {lane.label}
		</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each lane.cards as card (card.key)}
				<li class="min-w-0">
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
</div>
