<script lang="ts" module>
	import { createReplyDrafts, type ReplyDrafts } from '$lib/factory/reply-drafts';

	// One store for the page's life, shared by every instance and by the
	// confirmation callbacks that outlive them. Created in the browser only.
	let shared: ReplyDrafts | null = null;
	const replyDrafts = () => (shared ??= createReplyDrafts());
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import ReplyComposer from './reply-composer.svelte';
	import TicketActionsBar, { type TicketActionsFeedback } from './ticket-actions.svelte';
	import {
		commandTarget,
		getCommandContext,
		type CommandInput,
		type CommandIntent
	} from '$lib/factory/commands.svelte';
	import type { TicketDetailView } from '$lib/factory/models';
	import type { ReplyDraftTarget } from '$lib/factory/reply-drafts';
	import { TICKET_ACTIONS, ticketActions, type TicketAction } from '$lib/factory/ticket-actions';

	/**
	 * The Inspector's command region for the current execution: the action bar
	 * and, while a question is open, the reply composer. The one place in the
	 * Inspector that reads the layout's `CommandCoordinator`; the bar and the
	 * composer stay presentational. Without a coordinator (a component rendered
	 * alone) and for a past execution it renders nothing.
	 *
	 * It holds the chosen stop run and the cancel dialog's open state, both
	 * reset when the ticket or execution changes, and the reply draft, kept per
	 * ticket, execution and question in `sessionStorage` and cleared only when
	 * the reply is confirmed. `onreread` is called once per intent of this
	 * ticket that confirms or comes back stale, for a placement whose read is
	 * not a SvelteKit load (the board's Inspector).
	 */
	let {
		detail,
		onreread
	}: {
		detail: TicketDetailView;
		onreread?: () => void;
	} = $props();

	const coordinator = getCommandContext();

	const header = $derived(detail.header);
	const ticket = $derived(header.key);
	const execution = $derived(header.execution);

	let stopRun: string | null = $state(null);
	let cancelOpen = $state(false);
	// A new ticket or execution starts with no run chosen and the dialog closed.
	$effect.pre(() => {
		void ticket;
		void execution;
		untrack(() => {
			stopRun = null;
			cancelOpen = false;
		});
	});

	const view = $derived(
		coordinator
			? ticketActions({
					detail,
					access: coordinator.access,
					phaseFor: (target) => coordinator.phaseFor(target),
					stopRun
				})
			: null
	);

	const targetOf = (action: TicketAction): string | null => {
		if (action === 'stop') {
			return view?.stopRun ? commandTarget({ command: 'stop', run: view.stopRun }) : null;
		}
		if (action === 'reply') return commandTarget({ command: 'reply', ticket, answer: '' });
		return commandTarget({ command: action, ticket });
	};
	const intentOf = (action: TicketAction): CommandIntent | undefined => {
		const target = targetOf(action);
		return target && coordinator ? coordinator.intentFor(target) : undefined;
	};

	const feedback: TicketActionsFeedback = $derived(
		Object.fromEntries(
			TICKET_ACTIONS.flatMap((action) => {
				const intent = intentOf(action);
				return intent ? [[action, { phase: intent.phase, explanation: intent.explanation }]] : [];
			})
		)
	);

	function send(input: CommandInput) {
		coordinator?.submit(input);
	}

	// Reply: the open question, its draft and its intent.
	const question = $derived(view?.reply ?? null);
	const replyAvailability = $derived(view?.actions.reply);
	const replyIntent = $derived(intentOf('reply'));
	const draftTarget: ReplyDraftTarget | null = $derived(
		question ? { ticket, execution, question: question.id } : null
	);
	const kind = $derived(
		question ? (detail.attention.find((item) => item.id === question.id)?.kind ?? '') : ''
	);

	let draft = $state('');
	// Effects run in the browser only, so the stored draft loads after hydration.
	$effect(() => {
		const target = draftTarget;
		untrack(() => {
			draft = target ? replyDrafts().get(target) : '';
		});
	});

	// A confirmed reply empties the shown field when it answered the shown question.
	$effect(() => {
		if (replyIntent?.phase !== 'confirmed') return;
		const target = draftTarget;
		untrack(() => {
			if (target) draft = replyDrafts().get(target);
		});
	});

	/**
	 * Send the reply. The question it answers travels with its intent in the
	 * coordinator, which outlives this component, so that draft (and only it)
	 * is cleared on confirmation even after the operator navigated away.
	 */
	function reply(answer: string) {
		const target = draftTarget;
		if (!target || !coordinator) return;
		coordinator.submit(
			{ command: 'reply', ticket, answer },
			{ onconfirmed: () => replyDrafts().settle(target, 'confirmed') }
		);
	}

	// The board's Inspector rereads itself once per settled intent of this ticket.
	const settled = new Set<string>();
	$effect(() => {
		if (!onreread || !coordinator) return;
		const due = TICKET_ACTIONS.map(intentOf).filter(
			(intent): intent is CommandIntent =>
				intent !== undefined &&
				(intent.phase === 'confirmed' ||
					(intent.phase === 'rejected' && intent.outcome === 'stale'))
		);
		untrack(() => {
			const fresh = due.filter((intent) => !settled.has(`${intent.id}:${intent.phase}`));
			for (const intent of fresh) settled.add(`${intent.id}:${intent.phase}`);
			if (fresh.length > 0) onreread?.();
		});
	});
</script>

{#if view && header.current}
	<div class="flex flex-col gap-4" data-slot="ticket-commands">
		{#if question && replyAvailability && replyAvailability.kind !== 'hidden'}
			<ReplyComposer
				question={{ id: question.id, text: question.question, kind, runId: question.runId }}
				{ticket}
				{execution}
				availability={replyAvailability.kind === 'disabled'
					? { kind: 'disabled', reason: replyAvailability.reason }
					: { kind: 'enabled' }}
				phase={replyIntent?.phase ?? 'idle'}
				outcome={replyIntent?.outcome}
				explanation={replyIntent?.explanation}
				fieldError={replyIntent?.fieldErrors?.answer}
				bind:value={draft}
				onvaluechange={(value) => {
					if (draftTarget) replyDrafts().set(draftTarget, value);
				}}
				onsubmit={reply}
			/>
		{/if}
		<TicketActionsBar
			state={view}
			{ticket}
			displayRef={header.displayRef}
			{execution}
			{feedback}
			bind:cancelOpen
			oncommand={send}
			onstoprunchange={(run) => (stopRun = run)}
		/>
	</div>
{/if}
