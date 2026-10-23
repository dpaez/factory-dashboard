<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils.js';
	import StatusBadge from './status-badge.svelte';
	import { commandPhaseSignal } from '$lib/factory/status';
	import type { CommandFeedbackItem } from '$lib/factory/commands.svelte';

	/**
	 * The shell's command feedback (spec 01 → ApplicationShell). Presentational:
	 * the command coordinator owns the intents and the notice.
	 *
	 * - The notice, the latest transition, sits in one polite live region.
	 * - Below it, every unresolved intent stays listed after the notice clears,
	 *   with its ticket context, a signal chip and an explanation. Confirmed
	 *   intents are announced, not listed.
	 * - Retry delivery is offered only for an unconfirmed intent; Dismiss for a
	 *   rejected or unconfirmed one. Field errors belong to the form, not here.
	 */
	let {
		intents,
		notice,
		onretry,
		ondismiss,
		class: className
	}: {
		intents: CommandFeedbackItem[];
		/** The latest transition as text; null when it has cleared. */
		notice: string | null;
		/** Resend an unconfirmed intent under the same intent id. */
		onretry?: (id: string) => void;
		/** Remove a rejected or unconfirmed intent. */
		ondismiss?: (id: string) => void;
		class?: string;
	} = $props();

	const rows = $derived(intents.filter((intent) => intent.phase !== 'confirmed'));
	const empty = $derived(!notice && rows.length === 0);
</script>

<div
	data-slot="command-feedback"
	data-empty={empty}
	class={cn('not-prose flex flex-col gap-2 text-xs text-foreground', className)}
>
	<div data-slot="command-notice" role="status" aria-live="polite">{notice ?? ''}</div>
	{#if rows.length > 0}
		<ul data-slot="command-intents" class="flex flex-col gap-2">
			{#each rows as intent (intent.id)}
				{@const resolved = intent.phase === 'rejected' || intent.phase === 'unconfirmed'}
				<li
					data-slot="command-intent"
					data-phase={intent.phase}
					class="flex flex-wrap items-center gap-x-3 gap-y-1 border border-border px-3 py-2"
				>
					<span data-slot="command-label" class="font-medium">{intent.label}</span>
					{#if intent.context}
						<span
							data-slot="command-context"
							data-kind={intent.context.kind}
							class="font-mono break-all tabular-nums">{intent.context.value}</span
						>
					{/if}
					<StatusBadge {...commandPhaseSignal(intent.phase)} />
					<span data-slot="command-explanation" class="min-w-0 flex-1">{intent.explanation}</span>
					{#if resolved}
						<span class="flex items-center gap-2">
							{#if intent.phase === 'unconfirmed' && onretry}
								<Button variant="outline" size="sm" onclick={() => onretry(intent.id)}>
									Retry delivery
								</Button>
							{/if}
							{#if ondismiss}
								<Button variant="ghost" size="sm" onclick={() => ondismiss(intent.id)}>
									Dismiss
								</Button>
							{/if}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
