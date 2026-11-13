<script lang="ts" module>
	import { createReplyDrafts, type ReplyDrafts } from '$lib/factory/reply-drafts';

	// One store for the page's life, shared by every instance and by the
	// confirmation callbacks that outlive them. Created in the browser only.
	let shared: ReplyDrafts | null = null;
	const replyDrafts = () => (shared ??= createReplyDrafts());
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import FeedbackRoundsBox from './feedback-rounds-box.svelte';
	import ReplyComposer from './reply-composer.svelte';
	import TicketActionsBar, { type TicketActionsFeedback } from './ticket-actions.svelte';
	import { classifyCommandFailure, refusalRereads } from '$lib/factory/commands';
	import {
		commandTarget,
		getCommandContext,
		type CommandInput,
		type CommandIntent
	} from '$lib/factory/commands.svelte';
	import {
		feedbackRoundAvailability,
		feedbackTarget,
		pendingFeedbackReadable,
		type FeedbackChoice
	} from '$lib/factory/feedback-rounds';
	import { earlierRounds } from '$lib/factory/adapters';
	import type { TicketDetailView } from '$lib/factory/models';
	import { PendingFeedbackState } from '$lib/factory/pending-feedback-state.svelte';
	import type { ReplyDraftTarget } from '$lib/factory/reply-drafts';
	import { TICKET_ACTIONS, ticketActions, type TicketAction } from '$lib/factory/ticket-actions';

	/**
	 * The Inspector's command region for the current execution: the action bar,
	 * while a question is open the reply composer, and with a pull request the
	 * Feedback rounds box with the execution's earlier rounds. The one place in the Inspector that reads the
	 * layout's `CommandCoordinator`; the bar, the composer and the box stay
	 * presentational. Without a coordinator (a component rendered
	 * alone) and for a past execution it renders nothing.
	 *
	 * It holds the chosen stop run and the cancel dialog's open state, both
	 * reset when the ticket or execution changes, and the reply draft, kept per
	 * ticket, execution and question in `sessionStorage` and cleared only when
	 * the reply is confirmed, and the Feedback round note, kept for the shown
	 * ticket until the round confirms. It reads the pending feedback while a
	 * round can start (`pendingFeedbackReadable`), and rereads it when a round
	 * confirms or comes back with a refusal that rereads. `onreread` is called once per intent of
	 * this ticket that confirms or comes back with a refusal that rereads
	 * (`refusalRereads`), for a placement whose read is not a SvelteKit load
	 * (the board's Inspector).
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
	// The Feedback round note: kept after a refusal, cleared once the round confirms.
	let feedbackNote = $state('');
	// The pending comments a round picks from, with their ticks.
	const pending = new PendingFeedbackState();
	// A new ticket or execution starts with no run chosen, the dialog closed and no note.
	$effect.pre(() => {
		void ticket;
		void execution;
		untrack(() => {
			stopRun = null;
			cancelOpen = false;
			feedbackNote = '';
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

	// Feedback rounds: the box's availability, its pending list and the round's intent.
	const feedbackIntent = $derived(coordinator?.intentFor(feedbackTarget(ticket)));
	const feedbackPhase = $derived(feedbackIntent?.phase);
	const feedbackAvailability = $derived(
		feedbackRoundAvailability({
			header,
			access: coordinator?.access ?? 'unknown',
			phase: feedbackPhase ?? 'idle'
		})
	);
	const readable = $derived(header.current && pendingFeedbackReadable(header));
	// The execution's earlier rounds, shown whether or not a round can start.
	const rounds = $derived(earlierRounds(detail.tasks));
	// Read the list while a round can start; elsewhere forget it and make no read.
	$effect(() => {
		const key = ticket;
		if (!coordinator || !readable) {
			untrack(() => pending.clear());
			return;
		}
		untrack(() => void pending.load(key));
	});

	function startRound(choice: FeedbackChoice) {
		coordinator?.submit({ command: 'feedback', ticket, ...choice });
	}

	// A confirmed round empties the note it was sent with and rereads the list;
	// a refusal that rereads the ticket rereads the list too.
	const roundsSettled = new Set<string>();
	$effect(() => {
		const intent = feedbackIntent;
		if (!intent) return;
		const confirmed = intent.phase === 'confirmed';
		const refused =
			intent.phase === 'rejected' &&
			intent.failure !== undefined &&
			refusalRereads(intent.command, classifyCommandFailure(intent.failure), intent.failure);
		if (!confirmed && !refused) return;
		untrack(() => {
			const id = `${intent.id}:${intent.phase}`;
			if (roundsSettled.has(id)) return;
			roundsSettled.add(id);
			if (confirmed) feedbackNote = '';
			void pending.refresh();
		});
	});

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
		const due = [...TICKET_ACTIONS.map(intentOf), feedbackIntent].filter(
			(intent): intent is CommandIntent =>
				intent !== undefined &&
				(intent.phase === 'confirmed' ||
					(intent.phase === 'rejected' &&
						intent.failure !== undefined &&
						refusalRereads(intent.command, classifyCommandFailure(intent.failure), intent.failure)))
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
		{#if header.pullRequest}
			<FeedbackRoundsBox
				availability={feedbackAvailability}
				pending={readable ? pending : null}
				bind:ticked={pending.ticked}
				bind:note={feedbackNote}
				phase={feedbackPhase ?? 'idle'}
				explanation={feedbackIntent?.explanation}
				{rounds}
				onstart={startRound}
				onrefresh={() => void pending.refresh()}
			/>
		{/if}
	</div>
{/if}
