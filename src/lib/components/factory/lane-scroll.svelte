<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The scrolling body of a lane. The header stays outside, so only this
	 * region moves. A short tonal fade marks an edge that has more cards.
	 */
	let { children }: { children: Snippet } = $props();

	let scroller: HTMLDivElement | undefined = $state();
	let content: HTMLDivElement | undefined = $state();
	let fadeTop = $state(false);
	let fadeBottom = $state(false);

	function measure() {
		const node = scroller;
		if (!node) return;
		fadeTop = node.scrollTop > 1;
		fadeBottom = node.scrollTop + node.clientHeight < node.scrollHeight - 1;
	}

	$effect(() => {
		const node = scroller;
		const inner = content;
		if (!node) return;
		measure();
		const observer = new ResizeObserver(() => measure());
		observer.observe(node);
		if (inner) observer.observe(inner);
		return () => observer.disconnect();
	});
</script>

<div class="relative flex min-h-0 flex-auto flex-col">
	<div
		bind:this={scroller}
		data-slot="lane-scroll"
		class="min-h-0 flex-auto overflow-x-hidden overflow-y-auto overscroll-y-contain"
		onscroll={measure}
	>
		<div bind:this={content} class="flex flex-col gap-2 p-2">
			{@render children()}
		</div>
	</div>
	{#if fadeTop}
		<div
			aria-hidden="true"
			data-slot="lane-fade"
			data-edge="top"
			class="pointer-events-none absolute inset-x-0 top-0 h-2 bg-linear-to-b from-muted to-transparent"
		></div>
	{/if}
	{#if fadeBottom}
		<div
			aria-hidden="true"
			data-slot="lane-fade"
			data-edge="bottom"
			class="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-linear-to-t from-muted to-transparent"
		></div>
	{/if}
</div>
