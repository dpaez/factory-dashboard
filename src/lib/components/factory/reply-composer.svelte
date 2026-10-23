<script lang="ts" module>
	import type { ActionAvailability } from '$lib/factory/ticket-actions';

	/** The open attention question a reply answers. */
	export type ReplyQuestion = {
		/** The attention request's id. */
		id: string;
		text: string;
		/** `agent_question`, `policy_limit`, `manual_approval`, or a newer kind. */
		kind: string;
		/** The task the question came from, when known. */
		task?: string | null;
		/** The review round, when known. */
		round?: number | null;
		/** The run waiting for the answer, when one is. */
		runId?: string | null;
	};

	/** Reply availability from the selector; a hidden reply is not rendered. */
	export type ReplyAvailability = Exclude<ActionAvailability, { kind: 'hidden' }>;

	export const REPLY_COPY = {
		submit: 'Send reply & resume',
		sending: 'Sending…',
		waiting: 'Waiting for the factory…',
		recorded: 'Reply recorded.',
		blank: 'Write an answer before sending.',
		shortcut: 'Ctrl+Enter or ⌘+Enter sends.',
		answeredElsewhere:
			'This question is no longer open: it was answered or closed elsewhere. Your draft is kept here and was not sent.',
		stale:
			'The factory refused this reply because the ticket changed. Your draft is kept; check the current state before sending again.'
	} as const;

	const KIND_LABELS: Record<string, string> = {
		agent_question: 'Agent question',
		policy_limit: 'Policy limit',
		manual_approval: 'Manual approval'
	};

	export function questionKindLabel(kind: string): string {
		return KIND_LABELS[kind] ?? kind.replaceAll('_', ' ');
	}
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { CommandPhase } from '$lib/factory/commands';
	import type { CommandOutcome } from '$lib/factory/commands.svelte';

	/**
	 * Answers one open attention question. Presentational: the parent owns the
	 * draft (`value`, `onvaluechange`, kept per ticket, execution and question
	 * by `reply-drafts`), the availability from the selector, and the reply
	 * intent's phase and explanation. The question renders before the field.
	 *
	 * - A blank answer never reaches `onsubmit`: the button is disabled and a
	 *   keyboard submit shows an inline message.
	 * - Submitting and accepted lock the field and the button.
	 * - Rejected and unconfirmed unlock them with the text intact and show the
	 *   explanation; a validation error on `answer` marks the field.
	 * - A stale rejection, or the question no longer being open, explains the
	 *   conflict and keeps the draft where it is.
	 */
	let {
		question,
		ticket,
		execution,
		availability,
		phase = 'idle',
		outcome,
		explanation,
		fieldError,
		answeredElsewhere = false,
		value = $bindable(''),
		onvaluechange,
		onsubmit
	}: {
		question: ReplyQuestion;
		/** The ticket key the reply targets. */
		ticket: string;
		/** The execution the question belongs to. */
		execution: number;
		availability: ReplyAvailability;
		/** The reply intent's phase. */
		phase?: CommandPhase;
		/** Why a rejected reply was rejected. */
		outcome?: CommandOutcome;
		/** The reply intent's explanation. */
		explanation?: string;
		/** The validation message for `answer`. */
		fieldError?: string;
		/** The question is no longer open: it was answered or closed elsewhere. */
		answeredElsewhere?: boolean;
		/** The draft. */
		value?: string;
		/** The draft changed; save it per ticket, execution and question. */
		onvaluechange?: (value: string) => void;
		onsubmit: (answer: string) => void;
	} = $props();

	const uid = $props.id();
	const fieldId = `${uid}-answer`;

	let blankAttempt = $state(false);

	const blank = $derived(value.trim() === '');
	const pending = $derived(phase === 'submitting' || phase === 'accepted');
	const locked = $derived(
		pending || phase === 'confirmed' || availability.kind === 'disabled' || answeredElsewhere
	);
	const canSend = $derived(!locked && !blank);
	const failed = $derived(phase === 'rejected' || phase === 'unconfirmed');
	const conflict = $derived(
		answeredElsewhere ? 'answered' : phase === 'rejected' && outcome === 'stale' ? 'stale' : null
	);
	const invalid = $derived(phase === 'rejected' && !!fieldError);
	const context = $derived(
		[
			question.task ? `Task ${question.task}` : null,
			question.round != null ? `round ${question.round}` : null
		].filter(Boolean)
	);
	const submitLabel = $derived(
		phase === 'submitting'
			? REPLY_COPY.sending
			: phase === 'accepted'
				? REPLY_COPY.waiting
				: REPLY_COPY.submit
	);
	const describedBy = $derived(
		[
			`${uid}-question`,
			availability.kind === 'disabled' && `${uid}-reason`,
			conflict && `${uid}-conflict`,
			failed && explanation && `${uid}-explanation`,
			invalid && `${uid}-field-error`,
			blankAttempt && blank && `${uid}-blank`,
			`${uid}-shortcut`
		]
			.filter(Boolean)
			.join(' ')
	);

	function submit(event?: Event) {
		event?.preventDefault();
		if (locked) return;
		if (blank) {
			blankAttempt = true;
			return;
		}
		blankAttempt = false;
		// Trim only to check for a blank answer; the answer is sent as typed.
		onsubmit(value);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event);
	}

	const NOTICE = 'border-l-2 bg-card px-2 py-1 font-mono';
</script>

<form
	data-slot="reply-composer"
	data-phase={phase}
	class="not-prose flex flex-col gap-3 text-xs/relaxed text-foreground"
	novalidate
	onsubmit={submit}
>
	<div
		id="{uid}-question"
		data-testid="reply-question"
		class="flex flex-col gap-1 border-l-2 border-l-signal-wait bg-card p-3"
	>
		<p class="text-[0.625rem] font-medium text-foreground/75">
			{questionKindLabel(question.kind)}{#if context.length > 0}<span
					class="font-mono tabular-nums"
					data-testid="reply-context"
				>
					· {context.join(' · ')}</span
				>{/if}
		</p>
		<p class="whitespace-pre-wrap">{question.text}</p>
		{#if question.runId}
			<p class="font-mono break-all text-foreground/75 tabular-nums">
				Waiting run {question.runId}
			</p>
		{/if}
	</div>

	{#if availability.kind === 'disabled'}
		<p id="{uid}-reason" class="{NOTICE} border-l-signal-standby" data-testid="reply-reason">
			{availability.reason}
		</p>
	{/if}

	<div class="flex flex-col gap-2">
		<Label for={fieldId}>Your answer</Label>
		<Textarea
			id={fieldId}
			name="answer"
			required
			bind:value
			readonly={answeredElsewhere}
			disabled={pending || phase === 'confirmed' || availability.kind === 'disabled'}
			aria-invalid={invalid || (blankAttempt && blank) ? 'true' : undefined}
			aria-describedby={describedBy}
			data-reply-key="reply:{ticket}:{execution}:{question.id}"
			class="rounded-none"
			oninput={(event) => {
				const next = event.currentTarget.value;
				if (next.trim() !== '') blankAttempt = false;
				onvaluechange?.(next);
			}}
			{onkeydown}
		/>
		{#if invalid}
			<p id="{uid}-field-error" class="font-mono" data-testid="reply-field-error">
				{fieldError}
			</p>
		{/if}
		{#if blankAttempt && blank}
			<p id="{uid}-blank" class="font-mono" role="alert" data-testid="reply-blank">
				{REPLY_COPY.blank}
			</p>
		{/if}
		<p id="{uid}-shortcut" class="text-foreground/75">{REPLY_COPY.shortcut}</p>
	</div>

	{#if conflict}
		<p
			id="{uid}-conflict"
			class="{NOTICE} border-l-signal-wait"
			role="status"
			data-testid="reply-conflict"
			data-conflict={conflict}
		>
			{conflict === 'answered' ? REPLY_COPY.answeredElsewhere : REPLY_COPY.stale}
		</p>
	{/if}
	{#if failed && explanation}
		<p
			id="{uid}-explanation"
			class="{NOTICE} border-l-signal-fault"
			role="alert"
			data-testid="reply-explanation"
		>
			{explanation}
		</p>
	{:else if pending && explanation}
		<p class="font-mono text-foreground/75" role="status" data-testid="reply-pending">
			{explanation}
		</p>
	{:else if phase === 'confirmed'}
		<p class="{NOTICE} border-l-signal-clear" role="status" data-testid="reply-confirmed">
			{explanation ?? REPLY_COPY.recorded}
		</p>
	{/if}

	<div>
		<Button
			type="submit"
			class="rounded-none"
			disabled={!canSend}
			aria-busy={pending ? 'true' : undefined}
		>
			{submitLabel}
		</Button>
	</div>
</form>
