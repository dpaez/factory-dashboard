<script lang="ts">
	import type { BoardSummary } from '$lib/factory/board';

	/**
	 * The Flow board's compact count strip. A count that was not read reads
	 * "Unavailable"; a count from a partial ticket or backlog list is marked as
	 * a lower bound, never a bare total.
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
	class="not-prose flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-foreground/75"
>
	{#each items as item (item.id)}
		<li data-summary={item.id} class="flex items-baseline gap-1.5">
			<span class="font-mono text-foreground tabular-nums">
				{#if item.value === null}
					Unavailable
				{:else if item.partial}
					at least {item.value}<span class="sr-only">, partial list</span>
				{:else}
					{item.value}
				{/if}
			</span>
			<span>{item.label}</span>
			{#if item.partial && item.value !== null}
				<span aria-hidden="true" class="font-mono text-[0.625rem]">(partial)</span>
			{/if}
		</li>
	{/each}
</ul>
