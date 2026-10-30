<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { BoardSummary } from '$lib/factory/board';

	/**
	 * The Flow board's count strip. A count that was not read reads
	 * "Unavailable"; a count from a partial ticket or backlog list is marked as
	 * a lower bound, never a bare total. The numeral is the metric voice.
	 * Below `md` the label sits beside it; from `md` up the label sits under it.
	 */
	let { summary }: { summary: BoardSummary } = $props();

	const items = $derived([
		{
			id: 'in-progress',
			label: 'in progress',
			value: summary.inProgress as number | null,
			partial: !summary.inProgressComplete
		},
		{ id: 'agents-running', label: 'agents running', value: summary.agentsRunning, partial: false },
		{
			id: 'ready-to-start',
			label: 'ready to start',
			value: summary.readyToStart,
			partial: !summary.readyToStartComplete
		}
	]);
</script>

<ul
	data-slot="board-summary"
	aria-label="Board summary"
	class="not-prose flex flex-wrap items-end gap-x-2 gap-y-1 md:gap-x-6 md:gap-y-2"
>
	{#each items as item (item.id)}
		<li data-summary={item.id} class="flex items-baseline gap-1 md:flex-col md:gap-0">
			<span
				class={cn(
					'font-mono font-bold text-foreground tabular-nums max-md:leading-none',
					item.value !== null && !item.partial ? 'text-lg md:text-3xl' : 'text-base md:text-lg'
				)}
			>
				{#if item.value === null}
					Unavailable
				{:else if item.partial}
					at least {item.value}<span class="sr-only">, partial list</span>
				{:else}
					{item.value}
				{/if}
			</span>
			<span class="font-mono text-[0.625rem] tracking-wide text-foreground/75 md:text-xs"
				>{item.label}</span
			>
			{#if item.partial && item.value !== null}
				<span aria-hidden="true" class="font-mono text-[0.625rem] text-foreground/75"
					>(partial)</span
				>
			{/if}
		</li>
	{/each}
</ul>
