<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cubicOut } from 'svelte/easing';

	/**
	 * The board's selection panel: a non-modal drawer over the right side of
	 * the lanes. The board stays usable, so another card or Open next replaces
	 * the contents. Escape closes it unless focus is in a text field or a dialog.
	 */
	let {
		open,
		labelledBy,
		scrollKey,
		onclose,
		children
	}: {
		open: boolean;
		/** Id of the heading inside the drawer. */
		labelledBy: string;
		/** A change scrolls the drawer back to the top. */
		scrollKey: string;
		onclose: () => void;
		children: Snippet;
	} = $props();

	let scroller: HTMLDivElement | undefined = $state();

	$effect(() => {
		void scrollKey;
		if (!open) return;
		scroller?.scrollTo({ top: 0 });
	});

	function onkeydown(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape' || event.defaultPrevented) return;
		const target = event.target;
		if (target instanceof Element) {
			if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
			if (target.closest('[role="dialog"], [role="alertdialog"]')) return;
		}
		event.preventDefault();
		onclose();
	}

	/** Slide in from the right. Reduced motion skips the movement. */
	function drawer(_node: HTMLElement) {
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		return {
			duration: reduce ? 0 : 150,
			easing: cubicOut,
			css: (t: number) => `transform: translateX(${(1 - t) * 100}%)`
		};
	}
</script>

<svelte:window {onkeydown} />

{#if open}
	<aside
		transition:drawer
		data-slot="board-drawer"
		aria-labelledby={labelledBy}
		class="absolute inset-y-0 right-0 z-20 flex w-[min(40rem,100%)] min-w-0 flex-col border-l border-border bg-card"
	>
		<div
			bind:this={scroller}
			data-slot="board-drawer-scroll"
			class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
		>
			{@render children()}
		</div>
	</aside>
{/if}
