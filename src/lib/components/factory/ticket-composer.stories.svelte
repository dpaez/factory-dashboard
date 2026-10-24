<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import TicketComposer, {
		COMPOSER_COPY,
		type TicketComposerInput
	} from './ticket-composer.svelte';
	import type { CommandFailure, CommandPhase } from '$lib/factory/commands';
	import type { components } from '$lib/factory/generated/factory-api';
	import { START_FAILURES, startFailureMessage, type StartMode } from '$lib/factory/start';
	import { ACTION_REASONS } from '$lib/factory/ticket-actions';
	import {
		acceptedStart,
		problemInsufficientScope,
		problemInternalError,
		problemStartBriefValidation,
		problemStartConflict,
		problemStartRefValidation,
		problemTrackerUnavailable,
		problemUmbrellaIssue
	} from '$lib/factory/fixtures';

	type Problem = components['schemas']['Problem'];

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	const REF = 'dpaez/factory-dashboard#30';
	const ID = 'dark-mode-audit';
	const BRIEF = 'Audit every story in dark mode and list contrast failures.';

	/** A problem as the command endpoint relays it to the browser. */
	const failureOf = (problem: Problem, retryable = false): CommandFailure => ({
		type: problem.type,
		title: problem.title,
		...(problem.detail !== undefined && { detail: problem.detail }),
		...('errors' in problem && problem.errors && { fieldErrors: problem.errors }),
		retryable
	});

	/** Composer args for a failed start in `mode`, through the real failure mapping. */
	const failed = (
		mode: StartMode,
		problem: Problem | null,
		{ phase = 'rejected', retryable = false }: { phase?: CommandPhase; retryable?: boolean } = {}
	) => ({
		mode,
		phase,
		failure: startFailureMessage(
			{ phase, failure: problem ? failureOf(problem, retryable) : undefined },
			mode
		)
	});

	const refDraft = { mode: 'ref' as const, ref: REF };
	const briefDraft = { mode: 'brief' as const, id: ID, text: BRIEF };

	const tab = (pane: HTMLElement, name: string) => within(pane).getByRole('tab', { name });
	const refField = (pane: HTMLElement) =>
		within(pane).getByRole('textbox', { name: COMPOSER_COPY.refLabel });
	const idField = (pane: HTMLElement) =>
		within(pane).getByRole('textbox', { name: COMPOSER_COPY.idLabel });
	const textField = (pane: HTMLElement) =>
		within(pane).getByRole('textbox', { name: COMPOSER_COPY.textLabel });
	const submitButton = (pane: HTMLElement) => within(pane).getByTestId('composer-submit');

	/** The field is marked invalid and described by its message next to it. */
	const expectFieldError = async (pane: HTMLElement, field: HTMLElement, message: string) => {
		await expect(field).toHaveAttribute('aria-invalid', 'true');
		await expect(field).toHaveAccessibleDescription(expect.stringContaining(message));
		const error = pane.querySelector(`#${CSS.escape(field.id)}-error`);
		await expect(error).toHaveTextContent(message);
	};

	const submitFlow = fn<(input: TicketComposerInput) => void>();
	const rejectFlow = fn<(input: TicketComposerInput) => void>();
	const doubleFlow = fn<(input: TicketComposerInput) => void>();

	const { Story } = defineMeta({
		title: 'Components/Factory/TicketComposer',
		component: TicketComposer,
		args: {
			onsubmit: fn<(input: TicketComposerInput) => void>(),
			oncancel: fn(),
			onresend: fn()
		},
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Starts a ticket from an issue reference or a written brief. Two tabs, "Issue reference" and "Written brief"; "Start planning" (Beacon Yellow, Enter submits) sends exactly `{ref}` or `{id, text}`, trimmed, and never the inactive mode\'s draft. Presentational: the parent owns the start intent and passes its phase and `startFailureMessage`. Field failures sit next to their field; access, unconfirmed and other failures at the form, with Resend for unconfirmed. Drafts are never cleared on failure.'
				}
			}
		}
	});
</script>

<script lang="ts">
	// Submit flow: the parent moves the start through submitting to accepted.
	let flowPhase = $state<CommandPhase>('idle');
	let flowMode = $state<StartMode>('ref');
	let flowRef = $state('');
	let flowId = $state('');
	let flowText = $state('');
	const flowSubmit = (input: TicketComposerInput) => {
		submitFlow(input);
		flowPhase = 'submitting';
	};

	// Rejected round trip: the first send of a brief is answered with a conflict on the ID.
	let rejectPhase = $state<CommandPhase>('idle');
	let rejectMode = $state<StartMode>('brief');
	let rejectId = $state('');
	let rejectText = $state('');
	const rejectSend = (input: TicketComposerInput) => {
		rejectFlow(input);
		rejectPhase = 'submitting';
		setTimeout(() => (rejectPhase = 'rejected'), 0);
	};

	// Double submit: the parent stays submitting after the first send.
	let doublePhase = $state<CommandPhase>('idle');
	const doubleSend = (input: TicketComposerInput) => {
		doubleFlow(input);
		doublePhase = 'submitting';
	};
</script>

<Story
	name="Empty, issue mode"
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(tab(pane, COMPOSER_COPY.refTab)).toHaveAttribute('aria-selected', 'true');
		await expect(refField(pane)).toHaveValue('');
		await expect(refField(pane)).toHaveAccessibleDescription(
			expect.stringContaining('owner/repo#123')
		);
		await expect(submitButton(pane)).toHaveTextContent(COMPOSER_COPY.submit);
		await expect(submitButton(pane)).toHaveAttribute('type', 'submit');
		await expect(submitButton(pane)).toHaveClass('bg-primary');
		await userEvent.click(within(pane).getByRole('button', { name: COMPOSER_COPY.cancel }));
		await expect(args.oncancel).toHaveBeenCalledOnce();
		await expect(args.onsubmit).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Empty, brief mode"
	args={{ mode: 'brief' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(tab(pane, COMPOSER_COPY.briefTab)).toHaveAttribute('aria-selected', 'true');
		await expect(idField(pane)).toBeRequired();
		await expect(textField(pane)).toBeRequired();
		await expect(idField(pane)).toHaveValue('');
		await expect(textField(pane)).toHaveValue('');
	}}
/>

<Story
	name="Filled, issue mode sends only the reference"
	args={{ ...refDraft, ref: `  ${REF}  `, id: ID, text: BRIEF }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		// Enter in the field submits the form.
		await userEvent.type(refField(pane), '{Enter}');
		await expect(args.onsubmit).toHaveBeenCalledOnce();
		const [sent] = (args.onsubmit as ReturnType<typeof fn>).mock.calls[0]!;
		await expect(sent).toStrictEqual({ ref: REF });
	}}
/>

<Story
	name="Filled, brief mode sends only the ID and brief"
	args={{ ...briefDraft, id: ` ${ID} `, text: `${BRIEF}\n`, ref: REF }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await userEvent.click(submitButton(pane));
		await expect(args.onsubmit).toHaveBeenCalledOnce();
		const [sent] = (args.onsubmit as ReturnType<typeof fn>).mock.calls[0]!;
		await expect(sent).toStrictEqual({ id: ID, text: BRIEF });
	}}
/>

<Story
	name="Client validation"
	args={{ mode: 'brief', id: '   ', ref: REF }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await userEvent.click(submitButton(pane));
		await expectFieldError(pane, idField(pane), COMPOSER_COPY.requiredId);
		await expectFieldError(pane, textField(pane), COMPOSER_COPY.requiredText);
		// The issue reference of the other tab is never sent in its place.
		await expect(args.onsubmit).not.toHaveBeenCalled();
		await userEvent.type(idField(pane), ID);
		await expect(idField(pane)).not.toHaveAttribute('aria-invalid');
		await expect(textField(pane)).toHaveAttribute('aria-invalid', 'true');
		await expect(args.onsubmit).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Server validation, reference"
	args={{ ...refDraft, ...failed('ref', problemStartRefValidation) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectFieldError(pane, refField(pane), problemStartRefValidation.errors[0]!.message);
		await expect(refField(pane)).toHaveValue(REF);
		await expect(submitButton(pane)).toBeEnabled();
	}}
/>

<Story
	name="Server validation, ID and brief"
	args={{ ...briefDraft, ...failed('brief', problemStartBriefValidation) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const [idError, textError] = problemStartBriefValidation.errors;
		await expectFieldError(pane, idField(pane), idError!.message);
		await expectFieldError(pane, textField(pane), textError!.message);
		await expect(idField(pane)).toHaveValue(ID);
		await expect(textField(pane)).toHaveValue(BRIEF);
	}}
/>

<Story
	name="Umbrella issue"
	args={{ ...refDraft, ...failed('ref', problemUmbrellaIssue) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectFieldError(pane, refField(pane), START_FAILURES.umbrella);
		await expect(refField(pane)).toHaveValue(REF);
	}}
/>

<Story
	name="Tracker unavailable"
	args={{ ...refDraft, ...failed('ref', problemTrackerUnavailable, { retryable: true }) }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectFieldError(pane, refField(pane), START_FAILURES.tracker);
		// Retryable: Start planning sends the same reference again.
		await userEvent.click(submitButton(pane));
		await expect(args.onsubmit).toHaveBeenCalledWith({ ref: REF });
	}}
/>

<Story
	name="Conflict, reference"
	args={{ ...refDraft, ...failed('ref', problemStartConflict) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectFieldError(pane, refField(pane), START_FAILURES.conflictRef);
	}}
/>

<Story
	name="Conflict, ID"
	args={{ ...briefDraft, ...failed('brief', problemStartConflict) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectFieldError(pane, idField(pane), START_FAILURES.conflictId);
		await expect(textField(pane)).not.toHaveAttribute('aria-invalid');
		await expect(textField(pane)).toHaveValue(BRIEF);
	}}
/>

<Story
	name="Other failure"
	args={{ ...refDraft, ...failed('ref', problemInsufficientScope) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByTestId('composer-form-error')).toHaveTextContent(
			START_FAILURES.readOnly
		);
		await expect(refField(pane)).not.toHaveAttribute('aria-invalid');
		await expect(refField(pane)).toHaveValue(REF);
	}}
/>

<Story
	name="Submitting"
	args={{ ...briefDraft, phase: 'submitting' }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const button = within(pane).getByRole('button', { name: COMPOSER_COPY.submitting });
		await expect(button).toBeDisabled();
		await expect(button).toHaveAttribute('aria-busy', 'true');
		await expect(tab(pane, COMPOSER_COPY.refTab)).toBeDisabled();
		await userEvent.click(button, { pointerEventsCheck: 0 });
		await userEvent.type(idField(pane), '{Enter}');
		await expect(args.onsubmit).not.toHaveBeenCalled();
		await expect(idField(pane)).toHaveValue(ID);
	}}
/>

<Story
	name="Accepted"
	args={{ ...refDraft, phase: 'accepted' }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByTestId('composer-accepted')).toHaveTextContent(
			COMPOSER_COPY.accepted
		);
		await expect(submitButton(pane)).toBeDisabled();
		await expect(tab(pane, COMPOSER_COPY.briefTab)).toBeDisabled();
		await userEvent.type(refField(pane), '{Enter}');
		await expect(args.onsubmit).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Unconfirmed"
	args={{ ...briefDraft, ...failed('brief', problemInternalError, { phase: 'unconfirmed' }) }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByTestId('composer-form-error')).toHaveTextContent(
			START_FAILURES.unconfirmed
		);
		await expect(within(pane).queryByTestId('composer-submit')).toBeNull();
		await userEvent.click(within(pane).getByRole('button', { name: COMPOSER_COPY.resend }));
		await expect(args.onresend).toHaveBeenCalledOnce();
		// Enter does not start a new intent: the start is resent, never sent again.
		await userEvent.type(idField(pane), '{Enter}');
		await expect(args.onsubmit).not.toHaveBeenCalled();
		await expect(textField(pane)).toHaveValue(BRIEF);
	}}
/>

<Story
	name="Read only"
	args={{ ...refDraft, access: 'read_only' }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const reason = within(pane).getByTestId('composer-reason');
		await expect(reason).toHaveTextContent(ACTION_REASONS.readOnly);
		await expect(submitButton(pane)).toBeDisabled();
		await expect(submitButton(pane)).toHaveAccessibleDescription(ACTION_REASONS.readOnly);
		await userEvent.type(refField(pane), '{Enter}');
		await expect(args.onsubmit).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Submit flow"
	play={async ({ canvasElement }) => {
		submitFlow.mockClear();
		const pane = firstPane(canvasElement);
		await userEvent.type(refField(pane), REF);
		await userEvent.click(tab(pane, COMPOSER_COPY.briefTab));
		await userEvent.type(idField(pane), ID);
		await userEvent.type(textField(pane), BRIEF);
		await userEvent.click(tab(pane, COMPOSER_COPY.refTab));
		// Each mode keeps its draft across tab switches.
		await expect(refField(pane)).toHaveValue(REF);
		await userEvent.click(tab(pane, COMPOSER_COPY.briefTab));
		await expect(idField(pane)).toHaveValue(ID);
		await expect(textField(pane)).toHaveValue(BRIEF);

		await userEvent.type(idField(pane), '{Enter}');
		await expect(submitFlow).toHaveBeenCalledOnce();
		await expect(submitFlow.mock.calls[0]![0]).toStrictEqual({ id: ID, text: BRIEF });
		await waitFor(() =>
			expect(within(pane).getByRole('button', { name: COMPOSER_COPY.submitting })).toBeVisible()
		);
	}}
>
	{#snippet template()}
		<div class="flex flex-col gap-2">
			<TicketComposer
				bind:mode={flowMode}
				bind:ref={flowRef}
				bind:id={flowId}
				bind:text={flowText}
				phase={flowPhase}
				onsubmit={flowSubmit}
			/>
			{#if flowPhase === 'accepted'}
				<p class="font-mono tabular-nums">{acceptedStart.ticket}</p>
			{/if}
		</div>
	{/snippet}
</Story>

<Story
	name="Double submit while submitting"
	play={async ({ canvasElement }) => {
		doubleFlow.mockClear();
		const pane = firstPane(canvasElement);
		await userEvent.type(refField(pane), REF);
		await userEvent.dblClick(submitButton(pane), { pointerEventsCheck: 0 });
		await userEvent.type(refField(pane), '{Enter}{Enter}');
		await userEvent.click(submitButton(pane), { pointerEventsCheck: 0 });
		await expect(doubleFlow).toHaveBeenCalledOnce();
		await expect(doubleFlow).toHaveBeenCalledWith({ ref: REF });
	}}
>
	{#snippet template()}
		<TicketComposer phase={doublePhase} onsubmit={doubleSend} />
	{/snippet}
</Story>

<Story
	name="Brief kept after a rejection"
	play={async ({ canvasElement }) => {
		rejectFlow.mockClear();
		const pane = firstPane(canvasElement);
		await userEvent.type(idField(pane), ID);
		await userEvent.type(textField(pane), BRIEF);
		await userEvent.click(submitButton(pane));
		await expect(rejectFlow).toHaveBeenCalledOnce();
		await waitFor(() => expect(idField(pane)).toHaveAttribute('aria-invalid', 'true'));
		await expectFieldError(pane, idField(pane), START_FAILURES.conflictId);
		await expect(idField(pane)).toHaveValue(ID);
		await expect(textField(pane)).toHaveValue(BRIEF);
		await expect(submitButton(pane)).toBeEnabled();
	}}
>
	{#snippet template()}
		<TicketComposer
			bind:mode={rejectMode}
			bind:id={rejectId}
			bind:text={rejectText}
			phase={rejectPhase}
			failure={rejectPhase === 'rejected'
				? startFailureMessage(
						{ phase: 'rejected', failure: failureOf(problemStartConflict) },
						'brief'
					)
				: null}
			onsubmit={rejectSend}
		/>
	{/snippet}
</Story>
