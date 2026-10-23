<script lang="ts" module>
	import type { CommandInput, CommandPhase } from '$lib/factory/commands';
	import type { TicketAction } from '$lib/factory/ticket-actions';

	/** Where one action's latest intent stands, from the coordinator. */
	export type ActionFeedback = { phase: CommandPhase; explanation?: string };

	export type TicketActionsFeedback = Partial<Record<TicketAction, ActionFeedback>>;

	export const ACTION_NOTES = {
		retry: 'Relaunches the step that stopped, reusing its context. It is not a new execution.',
		complete: 'Records that the handoff is done. It does not merge the pull request.',
		rerun: (next: number) =>
			`Starts a new execution (${next}) from a fresh copy of the source. Earlier executions stay readable.`
	} as const;
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import CancelExecutionDialog, { DESTRUCTIVE_TEXT } from './cancel-execution-dialog.svelte';
	import { stageLabel } from '$lib/factory/format';
	import {
		ACTION_REASONS,
		type ActionAvailability,
		type TicketActions
	} from '$lib/factory/ticket-actions';

	/**
	 * The current execution's action bar: Stop agent, Retry, Cancel execution,
	 * Mark complete and Rerun (Reply has its own composer). Presentational: it
	 * renders the selector's availability and each action's phase, and emits
	 * typed command inputs through `oncommand`. Hidden actions are not
	 * rendered; a disabled one shows its reason, tied to the control. Stop
	 * names its run and, with several active runs, asks for one first through
	 * `onstoprunchange`. Cancel opens a confirmation and never sends directly.
	 */
	const uid = $props.id();

	let {
		state: view,
		ticket,
		displayRef,
		execution,
		feedback = {},
		cancelOpen = $bindable(false),
		oncommand,
		onstoprunchange
	}: {
		/** The availability from `ticketActions`. */
		state: TicketActions;
		/** The ticket key commands target. */
		ticket: string;
		displayRef: string;
		/** The current execution's number. */
		execution: number;
		/** Each action's latest phase and explanation. */
		feedback?: TicketActionsFeedback;
		/** Whether the cancel confirmation is open. */
		cancelOpen?: boolean;
		oncommand: (input: CommandInput) => void;
		/** The operator chose (or cleared) the run Stop targets. */
		onstoprunchange?: (run: string | null) => void;
	} = $props();

	const actions = $derived(view.actions);
	const shown = (availability: ActionAvailability) => availability.kind !== 'hidden';
	const visible = $derived(
		(['stop', 'retry', 'cancel', 'complete', 'rerun'] as const).some((action) =>
			shown(actions[action])
		)
	);
	const readOnly = $derived(
		Object.values(actions).some(
			(availability) =>
				availability.kind === 'disabled' && availability.reason === ACTION_REASONS.readOnly
		)
	);

	const reasonOf = (availability: ActionAvailability) =>
		availability.kind === 'disabled' && availability.reason !== ACTION_REASONS.readOnly
			? availability.reason
			: null;
	const failureOf = (action: TicketAction) => {
		const entry = feedback[action];
		return entry && (entry.phase === 'rejected' || entry.phase === 'unconfirmed')
			? (entry.explanation ?? null)
			: null;
	};
	const describedBy = (action: TicketAction, note: boolean) =>
		[
			note && `${uid}-${action}-note`,
			reasonOf(actions[action]) && `${uid}-${action}-reason`,
			failureOf(action) && `${uid}-${action}-failure`,
			readOnly && `${uid}-access`
		]
			.filter(Boolean)
			.join(' ') || undefined;

	const stopTarget = $derived(view.stoppableRuns.find((run) => run.id === view.stopRun) ?? null);
	const choosing = $derived(view.stoppableRuns.length > 1);

	// The parent closes the confirmation once the cancel is confirmed.
	$effect(() => {
		if (feedback.cancel?.phase === 'confirmed') cancelOpen = false;
	});

	const ROW = 'flex flex-col gap-1';
	const NOTE = 'text-foreground/75';
	const REASON = 'font-mono text-foreground/75';
	const FAILURE = 'border-l-2 border-l-signal-fault bg-card px-2 py-1 font-mono';
	const DESTRUCTIVE = `rounded-none ${DESTRUCTIVE_TEXT}`;
</script>

{#snippet details(action: TicketAction, note?: string)}
	{#if note}
		<p id="{uid}-{action}-note" class={NOTE} data-note={action}>{note}</p>
	{/if}
	{#if reasonOf(actions[action])}
		<p id="{uid}-{action}-reason" class={REASON} data-reason={action}>
			{reasonOf(actions[action])}
		</p>
	{/if}
	{#if failureOf(action)}
		<p id="{uid}-{action}-failure" class={FAILURE} role="status" data-failure={action}>
			{failureOf(action)}
		</p>
	{/if}
{/snippet}

{#if visible}
	<div
		role="group"
		data-slot="ticket-actions"
		aria-label="Ticket actions"
		class="not-prose flex flex-col gap-4 border-t border-border pt-4 text-xs/relaxed text-foreground"
	>
		{#if readOnly}
			<p
				id="{uid}-access"
				class="border-l-2 border-l-signal-standby bg-card p-2 font-mono"
				data-testid="access-explanation"
			>
				{ACTION_REASONS.readOnly}
			</p>
		{/if}

		{#if shown(actions.stop)}
			<div class={ROW} data-action="stop">
				{#if choosing}
					<fieldset class="flex flex-col gap-1" disabled={readOnly}>
						<legend class="mb-1 text-[0.625rem] font-medium text-foreground/75">Run to stop</legend>
						{#each view.stoppableRuns as run (run.id)}
							<label class="flex items-center gap-2 font-mono tabular-nums">
								<input
									type="radio"
									name="{uid}-stop-run"
									value={run.id}
									checked={view.stopRun === run.id}
									onchange={() => onstoprunchange?.(run.id)}
								/>
								<span
									>#{run.sequence}
									{stageLabel(run.stage)}{run.task ? ` · task ${run.task}` : ''}</span
								>
								<span class="break-all text-foreground/75">{run.id}</span>
							</label>
						{/each}
					</fieldset>
				{/if}
				<div>
					<Button
						variant="destructive"
						class={DESTRUCTIVE}
						disabled={actions.stop.kind !== 'enabled'}
						aria-describedby={describedBy('stop', true)}
						onclick={() => {
							if (actions.stop.kind === 'enabled' && view.stopRun) {
								oncommand({ command: 'stop', run: view.stopRun });
							}
						}}
					>
						Stop agent
					</Button>
				</div>
				{@render details(
					'stop',
					stopTarget
						? `Stops run #${stopTarget.sequence} (${stageLabel(stopTarget.stage)}, ${stopTarget.id}). The ticket pauses.`
						: 'Stops the chosen run. The ticket pauses.'
				)}
			</div>
		{/if}

		{#if shown(actions.retry)}
			<div class={ROW} data-action="retry">
				<div>
					<Button
						variant="outline"
						class="rounded-none"
						disabled={actions.retry.kind !== 'enabled'}
						aria-describedby={describedBy('retry', true)}
						onclick={() => oncommand({ command: 'retry', ticket })}
					>
						Retry
					</Button>
				</div>
				{@render details('retry', ACTION_NOTES.retry)}
			</div>
		{/if}

		{#if shown(actions.complete)}
			<div class={ROW} data-action="complete">
				<div>
					<Button
						variant="outline"
						class="rounded-none"
						disabled={actions.complete.kind !== 'enabled'}
						aria-describedby={describedBy('complete', true)}
						onclick={() => oncommand({ command: 'complete', ticket })}
					>
						Mark complete
					</Button>
				</div>
				{@render details('complete', ACTION_NOTES.complete)}
			</div>
		{/if}

		{#if shown(actions.rerun)}
			<div class={ROW} data-action="rerun">
				<div>
					<Button
						variant="outline"
						class="rounded-none"
						disabled={actions.rerun.kind !== 'enabled'}
						aria-describedby={describedBy('rerun', true)}
						onclick={() => oncommand({ command: 'rerun', ticket })}
					>
						Rerun
					</Button>
				</div>
				{@render details('rerun', ACTION_NOTES.rerun(execution + 1))}
			</div>
		{/if}

		{#if shown(actions.cancel)}
			<div class={ROW} data-action="cancel">
				<div>
					<Button
						variant="destructive"
						class={DESTRUCTIVE}
						disabled={actions.cancel.kind !== 'enabled'}
						aria-haspopup="dialog"
						aria-describedby={describedBy('cancel', false)}
						onclick={() => (cancelOpen = true)}
					>
						Cancel execution
					</Button>
				</div>
				{@render details('cancel')}
			</div>
			<CancelExecutionDialog
				bind:open={cancelOpen}
				{displayRef}
				{execution}
				phase={feedback.cancel?.phase}
				explanation={feedback.cancel?.explanation}
				disabledReason={readOnly ? ACTION_REASONS.readOnly : null}
				onconfirm={() => {
					if (!readOnly) oncommand({ command: 'cancel', ticket });
				}}
			/>
		{/if}
	</div>
{/if}
