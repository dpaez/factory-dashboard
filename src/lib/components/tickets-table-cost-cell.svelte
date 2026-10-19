<script lang="ts">
	/** Null when the page did not read the ticket's usage: shown as "—", never $0.00. */
	let { cost }: { cost: number | null } = $props();
</script>

<span class="inline-flex items-center gap-2">
	{#if cost === null}
		<span class="text-sm font-medium text-muted-foreground tabular-nums" title="Cost not available"
			>—</span
		>
	{:else}
		<span class="text-sm font-medium tabular-nums">$ {cost.toFixed(2)} USD</span>
	{/if}
</span>
