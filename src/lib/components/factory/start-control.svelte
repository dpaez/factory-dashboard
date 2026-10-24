<script lang="ts" module>
	import type { CommandPhase } from '$lib/factory/commands';
	import type { StartAvailability } from '$lib/factory/start';

	/** One backlog issue's start, as the page derives it from the coordinator. */
	export type StartState = {
		/** From `startAvailability`. */
		start: StartAvailability;
		/** The phase of the issue's start target; `idle` when none was sent. */
		phase?: CommandPhase;
		/** A rejected or unconfirmed start's message, from `startFailureMessage`. */
		explanation?: string | null;
	};
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils.js';
	import { START_REASONS } from '$lib/factory/start';

	/**
	 * Start for one backlog issue (spec 02 → BacklogCard, IssuePreview "After
	 * Start"). Presentational: it renders the availability and the start's phase
	 * and emits `onstart` or `onresend`; the page owns the coordinator.
	 *
	 * - Enabled: Beacon Yellow Start.
	 * - Disabled (blocked, umbrella, read-only): Start disabled, its reason
	 *   visible and tied to it with `aria-describedby`.
	 * - Submitting: "Starting…", `aria-busy`. The button stays focusable but
	 *   ignores clicks and Enter, so one action sends one intent.
	 * - Accepted: "Start accepted" until a read shows the ticket. Never shown as
	 *   running.
	 * - Rejected: the reason inline; Start is enabled again when eligible.
	 * - Unconfirmed: the explanation and Resend, which resends the same intent.
	 */
	let {
		start,
		phase = 'idle',
		explanation = null,
		onstart,
		onresend,
		class: className
	}: StartState & {
		onstart?: () => void;
		/** Resend an unconfirmed start under the same intent id. */
		onresend?: () => void;
		class?: string;
	} = $props();

	const uid = $props.id();
	const reasonId = `${uid}-start-reason`;
	const failureId = `${uid}-start-failure`;

	// Read-only access outranks the start's phase, as in `startAvailability`: Start is
	// disabled with the access reason whatever the phase, and Resend is not offered.
	const readOnly = $derived(start.kind === 'disabled' && start.reason === START_REASONS.readOnly);
	const shown = $derived(readOnly ? 'idle' : phase);
	const pending = $derived(shown === 'submitting' || shown === 'accepted');
	const unconfirmed = $derived(shown === 'unconfirmed');
	// A rejection's reason stays; an unconfirmed one asks for a Resend read-only access cannot send.
	const failure = $derived(
		phase === 'rejected' || unconfirmed ? (explanation ?? START_REASONS.unconfirmed) : null
	);
	// A pending start says what it is doing in its label; other disabled reasons are written out.
	const reason = $derived(
		start.kind === 'disabled' && !pending && !unconfirmed ? start.reason : null
	);
	const label = $derived(
		shown === 'submitting' ? 'Starting…' : shown === 'accepted' ? 'Start accepted' : 'Start'
	);
	const describedBy = $derived(
		[reason && reasonId, failure && failureId].filter(Boolean).join(' ') || undefined
	);

	function activate() {
		if (pending || unconfirmed || start.kind !== 'enabled') return;
		onstart?.();
	}
</script>

{#if start.kind !== 'hidden' || phase !== 'idle'}
	<div
		data-slot="start-control"
		data-phase={phase}
		data-start={start.kind}
		class={cn('flex min-w-0 flex-col gap-1 text-xs/relaxed text-foreground', className)}
	>
		{#if !unconfirmed}
			<div>
				<Button
					variant="default"
					class="rounded-none"
					data-slot="start-button"
					disabled={!pending && start.kind !== 'enabled'}
					aria-disabled={pending ? 'true' : undefined}
					aria-busy={shown === 'submitting' ? 'true' : undefined}
					aria-describedby={describedBy}
					onclick={activate}
				>
					{label}
				</Button>
			</div>
		{/if}
		{#if shown === 'accepted'}
			<p data-slot="start-accepted" role="status" class="text-foreground/75">
				Waiting for the factory to show the ticket.
			</p>
		{/if}
		{#if reason}
			<p id={reasonId} data-slot="start-reason" class="font-mono wrap-anywhere text-foreground/75">
				{reason}
			</p>
		{/if}
		{#if failure}
			<p
				id={failureId}
				data-slot="start-failure"
				role="status"
				class="border-l-2 border-l-signal-fault bg-card px-2 py-1 font-mono wrap-anywhere"
			>
				{failure}
			</p>
		{/if}
		{#if unconfirmed}
			<div>
				<Button
					variant="outline"
					class="rounded-none"
					data-slot="start-resend"
					aria-describedby={failureId}
					onclick={() => onresend?.()}
				>
					Resend
				</Button>
			</div>
		{/if}
	</div>
{/if}
