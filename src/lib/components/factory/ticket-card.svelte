<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { BoardCard } from '$lib/factory/board';
	import { formatCount, formatTimestamp } from '$lib/factory/format';
	import StatusBadge from './status-badge.svelte';
	import TaskProgress from './task-progress.svelte';

	/**
	 * One current execution on the Flow board. The whole card is a single
	 * selection control: a native button, so Tab, Enter and Space work, with
	 * no nested links or buttons. Stop and Cancel belong to the inspector.
	 *
	 * Three tiers: identity (reference, title), signal (status, attention,
	 * current task), then telemetry under a hairline (progress, time, tokens).
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

	// Tokens, not USD: cost belongs to the ticket page's usage breakdown.
	const tokens = $derived(
		card.tokens === null
			? 'Tokens Unavailable'
			: `In ${formatCount(card.tokens.input)} · Out ${formatCount(card.tokens.output)}`
	);
	const tokensLabel = $derived(
		card.tokens === null
			? 'Token usage unavailable'
			: `${formatCount(card.tokens.input)} input tokens, ${formatCount(card.tokens.output)} output tokens`
	);
</script>

<button
	type="button"
	data-slot="ticket-card"
	data-ticket-key={card.key}
	data-needs-attention={card.needsUser ? 'true' : undefined}
	aria-pressed={selected}
	onclick={() => onselect?.(card.key)}
	class={cn(
		'flex w-full min-w-0 flex-col gap-2 border-l-2 bg-card p-3 text-left text-xs/relaxed text-card-foreground ring-1 ring-foreground/10 transition-colors outline-none hover:bg-accent/50',
		'focus-visible:ring-2 focus-visible:ring-ring/30',
		card.needsUser ? 'border-l-signal-wait' : 'border-l-transparent',
		selected && 'bg-accent ring-2 ring-foreground/60'
	)}
>
	<span class="flex min-w-0 flex-col gap-0.5">
		<span class="font-mono text-[0.625rem] break-all text-foreground/75 tabular-nums"
			>{card.displayRef}</span
		>
		<span
			data-slot="ticket-title"
			class="line-clamp-2 text-sm font-medium text-foreground"
			title={card.title}>{card.title}</span
		>
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
		<span class="line-clamp-2 text-foreground/75" title={card.currentTask}>{card.currentTask}</span>
	{/if}

	<span class="flex flex-col gap-1.5 border-t border-border pt-2">
		<TaskProgress progress={card.progress} stage={card.rawStage} />
		<span
			class="flex flex-wrap items-center justify-between gap-x-2 font-mono text-[0.625rem] text-foreground/75 tabular-nums"
		>
			<span>Updated {formatTimestamp(card.updatedAt)}</span>
			<span data-slot="ticket-tokens" title={tokensLabel}>{tokens}</span>
		</span>
	</span>
</button>
