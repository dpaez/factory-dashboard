<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button } from '$lib/components/ui/button';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import ReplyComposer, {
		REPLY_COPY,
		type ReplyAvailability,
		type ReplyQuestion
	} from './reply-composer.svelte';
	import { toTicketDetail } from '$lib/factory/adapters';
	import { EXPLANATIONS } from '$lib/factory/commands.svelte';
	import type { CommandAccess, CommandPhase } from '$lib/factory/commands';
	import type { components } from '$lib/factory/generated/factory-api';
	import { createReplyDrafts, replyDraftKey } from '$lib/factory/reply-drafts';
	import { ACTION_REASONS, ticketActions } from '$lib/factory/ticket-actions';
	import {
		problemInternalError,
		problemNotWaitingForReply,
		problemReplyValidationError,
		ticketDetailAgentQuestion,
		ticketDetailPolicyLimit
	} from '$lib/factory/fixtures';

	type Schemas = components['schemas'];

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	const onlyExecution = (detail: Schemas['TicketDetail']) =>
		({
			items: [
				{
					createdAt: detail.createdAt,
					current: true,
					finishedAt: detail.finishedAt,
					generation: detail.execution,
					stage: detail.stage,
					status: detail.status,
					statusReason: detail.statusReason
				}
			]
		}) satisfies Schemas['ExecutionList'];

	/** Composer args from a fixture: the open question and the selector's reply availability. */
	const build = (
		detail: Schemas['TicketDetail'],
		options: {
			access?: CommandAccess;
			phase?: CommandPhase;
			question?: Partial<ReplyQuestion>;
		} = {}
	) => {
		const view = toTicketDetail({ detail, executions: onlyExecution(detail), runs: [] });
		const state = ticketActions({
			detail: view,
			access: options.access ?? 'unknown',
			phaseFor: (target) => (target.startsWith('reply:') ? (options.phase ?? 'idle') : 'idle')
		});
		const open = view.attention.find((attention) => attention.status === 'open')!;
		return {
			question: {
				id: open.id,
				text: open.question,
				kind: open.kind,
				runId: open.runId,
				...options.question
			} satisfies ReplyQuestion,
			ticket: view.header.key,
			execution: view.header.execution,
			availability: state.actions.reply as ReplyAvailability,
			phase: options.phase ?? 'idle',
			value: '',
			onvaluechange: fn<(value: string) => void>(),
			onsubmit: fn<(answer: string) => void>()
		};
	};

	const question = build(ticketDetailAgentQuestion);
	const DRAFT = 'Cmd+Enter: plain Enter should add a new line.';
	const FORMATTED = '    if (event.metaKey) submit();\nPlain Enter adds a line.\n';
	const OPEN_QUESTION = ticketDetailAgentQuestion.attention[0]!;

	const field = (pane: HTMLElement) => within(pane).getByRole('textbox', { name: 'Your answer' });
	const send = (pane: HTMLElement) => within(pane).getByRole('button', { name: REPLY_COPY.submit });

	/** The question renders before the field, and the field is described by it. */
	const expectQuestionFirst = async (pane: HTMLElement) => {
		const text = within(pane).getByTestId('reply-question');
		await expect(text).toHaveTextContent(OPEN_QUESTION.question);
		await expect(
			text.compareDocumentPosition(field(pane)) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		await expect(field(pane).getAttribute('aria-describedby')).toContain(text.id);
	};

	const draftStoryKey = {
		ticket: ticketDetailAgentQuestion.key,
		execution: ticketDetailAgentQuestion.execution
	};
	const draftCommands = fn<(answer: string) => void>();
	const rejectCommands = fn<(answer: string) => void>();

	const { Story } = defineMeta({
		title: 'Components/Factory/ReplyComposer',
		component: ReplyComposer,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Answers one open attention question. The question renders first, then a required answer field and "Send reply & resume", the one primary action in view. Presentational: the parent owns the draft (kept per ticket, execution and question by `reply-drafts`), the reply availability from `ticketActions`, and the reply intent\'s phase and explanation. A blank answer never reaches `onsubmit`. A rejected or unconfirmed reply keeps the text editable with the explanation; a stale rejection or an answer from elsewhere explains the conflict and keeps the draft.'
				}
			}
		}
	});
</script>

<script lang="ts">
	// Remount: each mount reads the draft back from sessionStorage, as after a reload.
	let mounted = $state(true);
	let questionId = $state(OPEN_QUESTION.id);
	const draftTarget = $derived({ ...draftStoryKey, question: questionId });

	// Rejected round trip: the parent answers the first send with a validation rejection.
	let rejectPhase = $state<CommandPhase>('idle');
	let rejectValue = $state('');
	const rejectSend = (answer: string) => {
		rejectCommands(answer);
		rejectPhase = 'submitting';
		setTimeout(() => (rejectPhase = 'rejected'), 0);
	};
</script>

<Story
	name="Question shown"
	args={question}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectQuestionFirst(pane);
		await expect(within(pane).getByTestId('reply-question')).toHaveTextContent('Agent question');
		await expect(within(pane).getByTestId('reply-question')).toHaveTextContent(
			OPEN_QUESTION.runId!
		);
		await expect(field(pane)).toBeEnabled();
		await expect(field(pane)).toBeRequired();
	}}
/>

<Story
	name="With task context"
	args={build(ticketDetailAgentQuestion, { question: { task: '03', round: 2 } })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByTestId('reply-context')).toHaveTextContent('Task 03 · round 2');
		await expectQuestionFirst(pane);
	}}
/>

<Story
	name="Empty"
	args={question}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(send(pane)).toBeDisabled();
		await userEvent.type(field(pane), '   ');
		await expect(send(pane)).toBeDisabled();
		// A keyboard submit with only whitespace is blocked with an inline message.
		await userEvent.keyboard('{Control>}{Enter}{/Control}');
		const message = await within(pane).findByTestId('reply-blank');
		await expect(message).toHaveTextContent(REPLY_COPY.blank);
		await expect(field(pane)).toHaveAttribute('aria-invalid', 'true');
		await expect(field(pane).getAttribute('aria-describedby')).toContain(message.id);
		await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
		await expect(args.onsubmit).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Draft present"
	args={{ ...question, value: DRAFT }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(field(pane)).toHaveValue(DRAFT);
		await expect(send(pane)).toBeEnabled();
		await userEvent.click(send(pane));
		await expect(args.onsubmit).toHaveBeenCalledOnce();
		await expect(args.onsubmit).toHaveBeenCalledWith(DRAFT);
	}}
/>

<Story
	name="Answer sent as typed"
	args={{ ...question, value: FORMATTED }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(field(pane)).toHaveValue(FORMATTED);
		await userEvent.click(send(pane));
		await expect(args.onsubmit).toHaveBeenCalledOnce();
		// Leading indentation and trailing whitespace are part of the answer.
		await expect(args.onsubmit).toHaveBeenCalledWith(FORMATTED);
	}}
/>

<Story
	name="Submitting"
	args={{
		...build(ticketDetailAgentQuestion, { phase: 'submitting' }),
		value: DRAFT,
		explanation: EXPLANATIONS.submitting
	}}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(field(pane)).toBeDisabled();
		await expect(field(pane)).toHaveValue(DRAFT);
		const button = within(pane).getByRole('button', { name: REPLY_COPY.sending });
		await expect(button).toBeDisabled();
		await expect(button).toHaveAttribute('aria-busy', 'true');
		await expect(within(pane).getByTestId('reply-pending')).toHaveTextContent(
			EXPLANATIONS.submitting
		);
		await userEvent.click(button, { pointerEventsCheck: 0 });
		await expect(args.onsubmit).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Accepted"
	args={{
		...build(ticketDetailAgentQuestion, { phase: 'accepted' }),
		value: DRAFT,
		explanation: EXPLANATIONS.accepted
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(field(pane)).toBeDisabled();
		await expect(within(pane).getByRole('button', { name: REPLY_COPY.waiting })).toBeDisabled();
	}}
/>

<Story
	name="Confirmed"
	args={{
		...build(ticketDetailAgentQuestion, { phase: 'confirmed' }),
		value: DRAFT,
		explanation: EXPLANATIONS.confirmed
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(field(pane)).toBeDisabled();
		await expect(send(pane)).toBeDisabled();
		await expect(within(pane).getByTestId('reply-confirmed')).toHaveTextContent(
			EXPLANATIONS.confirmed
		);
	}}
/>

<Story
	name="Rejected, validation"
	args={{
		...build(ticketDetailAgentQuestion, { phase: 'rejected' }),
		value: DRAFT,
		outcome: 'validation',
		explanation: EXPLANATIONS.validation,
		fieldError: problemReplyValidationError.errors[0]!.message
	}}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(field(pane)).toBeEnabled();
		await expect(field(pane)).toHaveValue(DRAFT);
		await expect(field(pane)).toHaveAttribute('aria-invalid', 'true');
		const error = within(pane).getByTestId('reply-field-error');
		await expect(error).toHaveTextContent(problemReplyValidationError.errors[0]!.message);
		await expect(field(pane).getAttribute('aria-describedby')).toContain(error.id);
		await expect(within(pane).getByTestId('reply-explanation')).toHaveTextContent(
			EXPLANATIONS.validation
		);
		await expect(send(pane)).toBeEnabled();
		await expect(args.onsubmit).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Rejected, other"
	args={{
		...build(ticketDetailAgentQuestion, { phase: 'rejected' }),
		value: DRAFT,
		outcome: 'other',
		explanation: problemInternalError.title
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(field(pane)).toBeEnabled();
		await expect(field(pane)).toHaveValue(DRAFT);
		await expect(within(pane).getByTestId('reply-explanation')).toHaveTextContent(
			problemInternalError.title
		);
		await expect(within(pane).queryByTestId('reply-conflict')).toBeNull();
	}}
/>

<Story
	name="Rejected reply stays editable"
	play={async ({ canvasElement }) => {
		rejectCommands.mockClear();
		const pane = firstPane(canvasElement);
		await userEvent.type(field(pane), 'Use Enter.');
		await userEvent.click(send(pane));
		await expect(rejectCommands).toHaveBeenCalledOnce();
		await expect(rejectCommands).toHaveBeenCalledWith('Use Enter.');

		await waitFor(() => expect(within(pane).getByTestId('reply-explanation')).toBeVisible());
		await expect(within(pane).getByTestId('reply-explanation')).toHaveTextContent(
			EXPLANATIONS.validation
		);
		await expect(field(pane)).toBeEnabled();
		await expect(field(pane)).toHaveValue('Use Enter.');
		await userEvent.type(field(pane), ' Cmd+Enter sends.');
		await expect(field(pane)).toHaveValue('Use Enter. Cmd+Enter sends.');
		await expect(send(pane)).toBeEnabled();
	}}
>
	{#snippet template()}
		<ReplyComposer
			{...question}
			phase={rejectPhase}
			outcome={rejectPhase === 'rejected' ? 'validation' : undefined}
			explanation={rejectPhase === 'rejected' ? EXPLANATIONS.validation : EXPLANATIONS.submitting}
			fieldError={rejectPhase === 'rejected'
				? problemReplyValidationError.errors[0]!.message
				: undefined}
			bind:value={rejectValue}
			onsubmit={rejectSend}
		/>
	{/snippet}
</Story>

<Story
	name="Stale"
	args={{
		...build(ticketDetailAgentQuestion, { phase: 'rejected' }),
		value: DRAFT,
		outcome: 'stale',
		explanation: `${EXPLANATIONS.stale} ${problemNotWaitingForReply.detail}`
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const conflict = within(pane).getByTestId('reply-conflict');
		await expect(conflict).toHaveAttribute('data-conflict', 'stale');
		await expect(conflict).toHaveTextContent(REPLY_COPY.stale);
		await expect(within(pane).getByTestId('reply-explanation')).toHaveTextContent(
			problemNotWaitingForReply.detail
		);
		await expect(field(pane)).toHaveValue(DRAFT);
		await expect(field(pane)).toBeEnabled();
	}}
/>

<Story
	name="Answered elsewhere"
	args={{ ...question, value: DRAFT, answeredElsewhere: true }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const conflict = within(pane).getByTestId('reply-conflict');
		await expect(conflict).toHaveAttribute('data-conflict', 'answered');
		await expect(conflict).toHaveTextContent(REPLY_COPY.answeredElsewhere);
		// The draft stays readable here, and nothing can send it.
		await expect(field(pane)).toHaveValue(DRAFT);
		await expect(field(pane)).toHaveAttribute('readonly');
		await expect(send(pane)).toBeDisabled();
		await userEvent.keyboard('{Control>}{Enter}{/Control}');
		await expect(args.onsubmit).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Unconfirmed"
	args={{
		...build(ticketDetailAgentQuestion, { phase: 'unconfirmed' }),
		value: DRAFT,
		explanation: EXPLANATIONS.unconfirmed
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(field(pane)).toBeEnabled();
		await expect(field(pane)).toHaveValue(DRAFT);
		await expect(within(pane).getByTestId('reply-explanation')).toHaveTextContent(
			EXPLANATIONS.unconfirmed
		);
	}}
/>

<Story
	name="No agent waiting"
	args={build(ticketDetailPolicyLimit)}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByTestId('reply-question')).toHaveTextContent('Policy limit');
		await expect(within(pane).getByTestId('reply-reason')).toHaveTextContent(
			ACTION_REASONS.noWaitingRun
		);
		await expect(field(pane)).toBeDisabled();
		await expect(send(pane)).toBeDisabled();
		await expect(args.onsubmit).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Read-only"
	args={{ ...build(ticketDetailAgentQuestion, { access: 'read_only' }), value: DRAFT }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const reason = within(pane).getByTestId('reply-reason');
		await expect(reason).toHaveTextContent(ACTION_REASONS.readOnly);
		await expect(field(pane)).toBeDisabled();
		await expect(field(pane).getAttribute('aria-describedby')).toContain(reason.id);
		await expect(send(pane)).toBeDisabled();
	}}
/>

<Story
	name="Draft restored after remount"
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const canvas = within(pane);
		const toggle = (name: string) => userEvent.click(canvas.getByRole('button', { name }));
		const target = { ...draftStoryKey, question: OPEN_QUESTION.id };
		sessionStorage.removeItem(replyDraftKey(target));
		sessionStorage.removeItem(replyDraftKey({ ...draftStoryKey, question: 'att_other' }));
		await toggle('Unmount composer');
		await toggle('Mount composer');
		await expect(field(pane)).toHaveValue('');

		await userEvent.type(field(pane), 'Kept across a remount.');
		await expect(sessionStorage.getItem(replyDraftKey(target))).toBe('Kept across a remount.');

		await toggle('Unmount composer');
		await expect(canvas.queryByRole('textbox')).toBeNull();
		await toggle('Mount composer');
		await expect(field(pane)).toHaveValue('Kept across a remount.');

		// Another question starts empty, and the first one's draft is not moved.
		await toggle('Show another question');
		await expect(field(pane)).toHaveValue('');
		await expect(sessionStorage.getItem(replyDraftKey(target))).toBe('Kept across a remount.');
		await toggle('Show the first question');
		await expect(field(pane)).toHaveValue('Kept across a remount.');
		await expect(draftCommands).not.toHaveBeenCalled();
	}}
>
	{#snippet template()}
		<div class="flex flex-col gap-4">
			<div class="flex gap-2">
				<Button variant="outline" class="rounded-none" onclick={() => (mounted = !mounted)}>
					{mounted ? 'Unmount composer' : 'Mount composer'}
				</Button>
				<Button
					variant="outline"
					class="rounded-none"
					onclick={() =>
						(questionId = questionId === OPEN_QUESTION.id ? 'att_other' : OPEN_QUESTION.id)}
				>
					{questionId === OPEN_QUESTION.id ? 'Show another question' : 'Show the first question'}
				</Button>
			</div>
			{#if mounted}
				{#key draftTarget.question}
					<ReplyComposer
						{...question}
						question={{ ...question.question, id: draftTarget.question }}
						value={createReplyDrafts().get(draftTarget)}
						onvaluechange={(value) => createReplyDrafts().set(draftTarget, value)}
						onsubmit={draftCommands}
					/>
				{/key}
			{/if}
		</div>
	{/snippet}
</Story>
