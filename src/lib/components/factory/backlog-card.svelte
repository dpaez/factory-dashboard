<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { BacklogCardModel } from '$lib/factory/backlog';
	import { Badge } from '$lib/components/ui/badge';
	import IssueLink from './issue-link.svelte';
	import StatusBadge from './status-badge.svelte';
	import StartControl, { type StartState } from './start-control.svelte';

	/**
	 * One backlog issue on the Flow board. The selection control is a single
	 * native button holding the reference, title, labels and availability, so
	 * Tab, Enter and Space work like a ticket card. An umbrella issue's
	 * sub-issue links follow the button as siblings, never nested in it.
	 * Given `start`, Start and its command state follow as another sibling
	 * (`start-control.svelte`); it emits `onstart(card)` or `onresend(card)`.
	 */
	let {
		card,
		selected = false,
		start,
		phase = 'idle',
		explanation = null,
		onselect,
		onstart,
		onresend
	}: {
		card: BacklogCardModel;
		selected?: boolean;
		/** Start availability from `startAvailability`; no Start control without it. */
		start?: StartState['start'];
		phase?: StartState['phase'];
		explanation?: StartState['explanation'];
		onselect?: (id: string) => void;
		onstart?: (card: BacklogCardModel) => void;
		/** Resend an unconfirmed start under the same intent id. */
		onresend?: (card: BacklogCardModel) => void;
	} = $props();

	const umbrella = $derived(card.availability.kind === 'umbrella');
</script>

<div
	data-slot="backlog-card"
	class={cn(
		'flex w-full min-w-0 flex-col bg-card text-xs/relaxed text-card-foreground ring-1 ring-foreground/10',
		selected && 'bg-accent ring-2 ring-foreground/60'
	)}
>
	<button
		type="button"
		data-slot="backlog-card-button"
		data-issue-id={card.id}
		aria-pressed={selected}
		onclick={() => onselect?.(card.id)}
		class="flex w-full min-w-0 flex-col gap-2 p-3 text-left transition-colors outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset"
	>
		<span class="flex min-w-0 flex-col gap-0.5">
			<span class="font-mono text-[0.625rem] break-all text-foreground/75 tabular-nums"
				>{card.displayRef}</span
			>
			<span class="font-medium wrap-anywhere text-foreground">{card.title}</span>
		</span>

		<span class="flex min-w-0 flex-wrap items-center gap-1">
			<StatusBadge
				label={card.availability.badge.label}
				signal={card.availability.badge.signal}
				class="h-auto max-w-full text-left whitespace-normal"
			/>
			{#each card.labels as label (label)}
				<Badge
					variant="outline"
					data-slot="issue-label"
					class="h-auto max-w-full text-left wrap-anywhere whitespace-normal">{label}</Badge
				>
			{/each}
		</span>

		{#if card.blockers.length > 0}
			<span data-slot="blocked-by" class="wrap-anywhere text-foreground/75">
				Blocked by
				<span class="font-mono tabular-nums"
					>{card.blockers.map((blocker) => blocker.displayRef).join(', ')}</span
				>
			</span>
		{/if}
	</button>

	{#if umbrella}
		<div data-slot="sub-issues" class="flex min-w-0 flex-col gap-1 border-t border-border p-3">
			<span class="text-[0.625rem] font-medium text-foreground/75">Sub-issues</span>
			{#if card.children.length > 0}
				<ul class="flex min-w-0 flex-col gap-1">
					{#each card.children as child (child.displayRef)}
						<li class="min-w-0"><IssueLink link={child} /></li>
					{/each}
				</ul>
			{:else}
				<span class="text-foreground/75">Sub-issues unavailable. See the tracker.</span>
			{/if}
		</div>
	{/if}

	{#if start}
		<StartControl
			class="border-t border-border p-3"
			{start}
			{phase}
			{explanation}
			onstart={() => onstart?.(card)}
			onresend={() => onresend?.(card)}
		/>
	{/if}
</div>
