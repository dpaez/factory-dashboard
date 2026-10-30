<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils.js';

	/**
	 * A fixed-width metric card. An `unavailable` figure reads "—" with a visible
	 * "Unavailable" label, never 0. `footer` replaces the plain-text subtitle
	 * when the footnote needs markup, such as a denominator.
	 */
	type InfoCardProps = {
		title: string;
		value?: string | number | null;
		subtitle?: string;
		/** The figure is unknown: renders "—" and "Unavailable" instead of `value`. */
		unavailable?: boolean;
		footer?: Snippet;
		/** Accessible text for the value, such as the exact figure behind "6.4M". */
		valueLabel?: string;
		/** Fill the parent instead of the fixed metric-card width. */
		fluid?: boolean;
	};

	let {
		title,
		value,
		subtitle,
		unavailable = false,
		footer,
		valueLabel,
		fluid = false
	}: InfoCardProps = $props();

	const shown = $derived(unavailable || value == null ? '—' : value);
	const isUnavailable = $derived(unavailable || value == null);
</script>

<Card.Root
	class={cn(
		'overflow-hidden font-mono text-ellipsis text-muted-foreground',
		fluid ? '@container w-full rounded-none ring-0' : 'w-64 md:w-56 lg:w-64'
	)}
	size="sm"
	data-slot="info-card"
	data-unavailable={isUnavailable ? 'true' : undefined}
>
	<Card.Header>
		<Card.Title class="text-sm font-light tracking-wide text-foreground capitalize"
			>{title}</Card.Title
		>
	</Card.Header>
	<Card.Content class="flex h-24 items-center justify-start gap-2">
		<p
			class={cn(
				'bg-transparent text-4xl font-bold text-foreground tabular-nums',
				fluid ? '@min-[16rem]:text-5xl' : 'lg:text-5xl'
			)}
			data-testid="info-card-value"
		>
			{#if valueLabel && !isUnavailable}
				<span aria-hidden="true">{shown}</span><span class="sr-only">{valueLabel}</span>
			{:else}
				{shown}
			{/if}
		</p>
		{#if isUnavailable}
			<span class="text-xs text-foreground/75" data-testid="info-card-unavailable">Unavailable</span
			>
		{/if}
	</Card.Content>
	<Card.Footer class="items-start text-xs font-extralight text-foreground/75 tabular-nums">
		{#if footer}
			{@render footer()}
		{:else}
			{subtitle}
		{/if}
	</Card.Footer>
</Card.Root>
