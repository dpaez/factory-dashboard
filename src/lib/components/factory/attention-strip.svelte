<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { nextAttention, type AttentionModel } from '$lib/factory/attention';
	import StatusBadge from './status-badge.svelte';

	/**
	 * The Flow board's attention strip: how many tickets need attention, why,
	 * and "Open next", which selects the next ticket in the priority queue.
	 *
	 * The parent owns the selection (`selectedKey`, `onselect`). The strip keeps
	 * only the set of tickets it has already opened, so repeated presses advance
	 * through the queue and wrap. New, reordered or resolved items never call
	 * `onselect`; only a press does. The button shows its target's display
	 * reference before the press, computed by the same rule the press uses.
	 */
	let {
		attention,
		selectedKey = null,
		loading = false,
		error = null,
		onselect
	}: {
		/** Null when the attention list was not read; renders as unavailable. */
		attention: AttentionModel | null;
		selectedKey?: string | null;
		loading?: boolean;
		/** Why the attention list could not be read. */
		error?: string | null;
		onselect?: (key: string) => void;
	} = $props();

	let visited = $state<ReadonlySet<string>>(new Set());

	const queue = $derived(attention?.queue ?? []);
	const next = $derived(nextAttention(queue, selectedKey, visited));
	const target = $derived(next ? queue.find((item) => item.key === next.key) : undefined);
	const count = $derived(attention?.headline.count ?? 0);
	const partial = $derived(attention ? !attention.headline.complete : false);

	function openNext() {
		// Recompute at press time from the same inputs the label used.
		const result = nextAttention(queue, selectedKey, visited);
		if (!result) return;
		visited = result.visited;
		onselect?.(result.key);
	}

	const uid = $props.id();
	const headingId = `${uid}-heading`;
</script>

<div
	role="group"
	data-slot="attention-strip"
	aria-labelledby={headingId}
	class="not-prose flex flex-col gap-2 border border-border p-3 text-xs text-foreground"
>
	{#if error !== null || (!loading && attention === null)}
		<h2 id={headingId} class="sr-only">Needs attention</h2>
		<p role="alert" class="text-xs text-foreground">
			<span class="font-medium">Attention unavailable.</span>
			{#if error}{error}{/if}
		</p>
	{:else if loading}
		<h2 id={headingId} class="sr-only">Needs attention</h2>
		<div aria-busy="true" class="flex flex-col gap-2">
			<span class="sr-only">Loading tickets that need attention</span>
			<div
				data-slot="attention-placeholder"
				class="h-4 w-48 animate-pulse bg-muted motion-reduce:animate-none"
			></div>
			<div
				data-slot="attention-placeholder"
				class="h-5 w-72 max-w-full animate-pulse bg-muted motion-reduce:animate-none"
			></div>
		</div>
	{:else if count === 0}
		<h2
			id={headingId}
			data-slot="attention-headline"
			class="text-xs font-normal text-foreground/75"
		>
			No attention needed.
		</h2>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<h2 id={headingId} data-slot="attention-headline" class="text-xs font-medium text-foreground">
				<span class="font-mono tabular-nums">
					{#if partial}at least {count}<span class="sr-only">, partial list</span
						>{:else}{count}{/if}
				</span>
				{count === 1 ? 'ticket needs attention' : 'tickets need attention'}
				{#if partial}
					<span aria-hidden="true" class="font-mono text-[0.625rem] font-normal text-foreground/75"
						>(partial)</span
					>
				{/if}
			</h2>
			{#if next && target}
				<Button
					data-slot="attention-open-next"
					data-target-key={next.key}
					class="max-w-full min-w-0"
					onclick={openNext}
				>
					<span>Open next</span>
					<span data-slot="attention-target" class="truncate font-mono">{target.displayRef}</span>
				</Button>
			{/if}
		</div>
		<ul aria-label="Attention reasons" class="flex flex-wrap items-center gap-x-4 gap-y-1">
			{#each attention?.groups ?? [] as group (group.reason)}
				<li
					data-slot="attention-group"
					data-reason={group.reason}
					class="flex items-center gap-1.5"
				>
					<StatusBadge label={group.label} signal={group.signal} />
					<span class="font-mono text-foreground tabular-nums"
						>{group.count}<span class="sr-only"
							>{' '}{group.count === 1 ? 'ticket' : 'tickets'}</span
						></span
					>
				</li>
			{/each}
		</ul>
	{/if}
</div>
