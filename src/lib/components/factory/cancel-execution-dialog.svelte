<script lang="ts" module>
	/**
	 * The local destructive variant's `text-destructive` on its wash is below
	 * strict axe's 4.5:1 at text-xs; this token mix passes in light and dark
	 * (the fix from `alert-dialog.stories.svelte`).
	 */
	export const DESTRUCTIVE_TEXT =
		'text-[color-mix(in_oklch,var(--destructive)_75%,var(--foreground))]';
</script>

<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import type { CommandPhase } from '$lib/factory/commands';

	/**
	 * Confirms cancelling the current execution. Controlled: `open` is the
	 * parent's, Keep execution and Escape close it and send nothing, and
	 * "Cancel execution" only calls `onconfirm`. While the cancel intent is
	 * submitting or accepted the dialog stays open with its action disabled;
	 * a rejection keeps it open with the explanation. `disabledReason` (known
	 * read-only access) disables the action with that reason. The parent closes it
	 * once the cancel is confirmed.
	 */
	let {
		open = $bindable(false),
		displayRef,
		execution,
		phase = 'idle',
		explanation,
		disabledReason,
		onconfirm
	}: {
		open?: boolean;
		/** The ticket's display reference, such as `dpaez/factory-dashboard#29`. */
		displayRef: string;
		/** The execution being cancelled. */
		execution: number;
		/** The phase of the ticket's cancel intent. */
		phase?: CommandPhase;
		/** The cancel intent's explanation, shown when rejected or unconfirmed. */
		explanation?: string;
		/** Why the cancel cannot be sent at all, such as read-only access; disables the action. */
		disabledReason?: string | null;
		onconfirm: () => void;
	} = $props();

	const uid = $props.id();
	const pending = $derived(phase === 'submitting' || phase === 'accepted');
	const blocked = $derived(pending || !!disabledReason);
	const failed = $derived((phase === 'rejected' || phase === 'unconfirmed') && !!explanation);
	const actionLabel = $derived(
		phase === 'submitting' ? 'Sending…' : phase === 'accepted' ? 'Cancelling…' : 'Cancel execution'
	);
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content data-slot="cancel-execution-dialog" class="rounded-none">
		<AlertDialog.Header>
			<AlertDialog.Title>
				Cancel execution <span class="font-mono tabular-nums">{execution}</span> of
				<span class="font-mono break-all">{displayRef}</span>?
			</AlertDialog.Title>
			<AlertDialog.Description>
				Agents stop, open tasks and questions are cancelled, and execution
				<span class="tabular-nums">{execution}</span> ends. The worktree, branch and pull request are
				kept.
			</AlertDialog.Description>
		</AlertDialog.Header>
		{#if disabledReason}
			<p
				id="{uid}-blocked"
				class="border-l-2 border-l-signal-standby bg-card p-2 font-mono"
				data-testid="cancel-blocked"
			>
				{disabledReason}
			</p>
		{/if}
		{#if failed}
			<p
				role="alert"
				class="border-l-2 border-l-signal-fault bg-card p-2 font-mono"
				data-testid="cancel-explanation"
			>
				{explanation}
			</p>
		{/if}
		<AlertDialog.Footer>
			<AlertDialog.Cancel class="rounded-none">Keep execution</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				class="rounded-none {DESTRUCTIVE_TEXT}"
				disabled={blocked}
				aria-busy={pending}
				aria-describedby={disabledReason ? `${uid}-blocked` : undefined}
				onclick={() => {
					if (!blocked) onconfirm();
				}}
			>
				{actionLabel}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
