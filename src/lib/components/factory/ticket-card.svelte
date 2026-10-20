<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { BoardCard } from '$lib/factory/board';
	import { formatTimestamp } from '$lib/factory/format';
	import StatusBadge from './status-badge.svelte';
	import TaskProgress from './task-progress.svelte';

	/**
	 * One current execution on the Flow board. The whole card is a single
	 * selection control: a native button, so Tab, Enter and Space work, with
	 * no nested links or buttons. Stop and Cancel belong to the inspector.
	 */
	let {
		card,
		selected = false,
		showStage = false,
		onselect
	}: {
		card: BoardCard;
		selected?: boolean;
		/** Show the raw stage label; the Other lane uses it for unknown stages. */
		showStage?: boolean;
		onselect?: (key: string) => void;
	} = $props();

	const cost = $derived(card.costUsd === null ? 'Unavailable' : `$${card.costUsd.toFixed(2)}`);
</script>

<button
	type="button"
	data-slot="ticket-card"
	data-ticket-key={card.key}
	aria-pressed={selected}
	onclick={() => onselect?.(card.key)}
	class={cn(
		'flex w-full min-w-0 flex-col gap-2 bg-card p-3 text-left text-xs/relaxed text-card-foreground ring-1 ring-foreground/10 transition-colors outline-none hover:bg-accent/50',
		'focus-visible:ring-2 focus-visible:ring-ring/30',
		selected && 'bg-accent ring-2 ring-foreground/60'
	)}
>
	<span class="flex min-w-0 flex-col gap-0.5">
		<span class="font-mono text-[0.625rem] break-all text-foreground/75 tabular-nums"
			>{card.displayRef}</span
		>
		<span class="font-medium wrap-anywhere text-foreground">{card.title}</span>
	</span>

	<span class="flex min-w-0 flex-wrap items-center gap-1">
		<StatusBadge
			label={card.badge.label}
			signal={card.badge.signal}
			class="h-auto max-w-full text-left whitespace-normal"
		/>
		{#if card.needsUser}
			<span class="text-[0.625rem] font-medium text-foreground">Needs attention</span>
		{/if}
		{#if showStage}
			<span class="font-mono text-[0.625rem] text-foreground/75">
				stage {card.rawStage}
			</span>
		{/if}
	</span>

	{#if card.currentTask}
		<span class="wrap-anywhere text-foreground/75">{card.currentTask}</span>
	{/if}

	<TaskProgress progress={card.progress} stage={card.rawStage} />

	<span
		class="flex flex-wrap items-center justify-between gap-x-2 font-mono text-[0.625rem] text-foreground/75 tabular-nums"
	>
		<span>Updated {formatTimestamp(card.updatedAt)}</span>
		<span data-slot="ticket-cost">{cost}</span>
	</span>
</button>
