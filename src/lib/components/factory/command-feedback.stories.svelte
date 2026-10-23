<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import CommandFeedback from './command-feedback.svelte';
	import { EXPLANATIONS, type CommandFeedbackItem } from '$lib/factory/commands.svelte';
	import {
		acceptedRetry,
		acceptedStart,
		acceptedStop,
		problemInvalidState,
		problemReplyValidationError
	} from '$lib/factory/fixtures';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const live = (pane: HTMLElement) => pane.querySelector<HTMLElement>('[aria-live="polite"]')!;
	const rows = (pane: HTMLElement) => [
		...pane.querySelectorAll<HTMLElement>('[data-slot="command-intent"]')
	];
	const button = (scope: HTMLElement, name: string) =>
		within(scope).queryByRole('button', { name });

	const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

	const sending: CommandFeedbackItem = {
		id: id(1),
		label: 'Retry',
		phase: 'submitting',
		context: { kind: 'ticket', value: acceptedRetry.ticket },
		explanation: EXPLANATIONS.submitting
	};
	const accepted: CommandFeedbackItem = {
		id: id(2),
		label: 'Start ticket',
		phase: 'accepted',
		context: { kind: 'ticket', value: acceptedStart.ticket },
		explanation: EXPLANATIONS.accepted
	};
	const confirmed: CommandFeedbackItem = {
		id: id(3),
		label: 'Retry',
		phase: 'confirmed',
		context: { kind: 'ticket', value: acceptedRetry.ticket },
		explanation: EXPLANATIONS.confirmed
	};
	const stale: CommandFeedbackItem = {
		id: id(4),
		label: 'Retry',
		phase: 'rejected',
		context: { kind: 'ticket', value: acceptedRetry.ticket },
		explanation: `${EXPLANATIONS.stale} ${problemInvalidState.detail}`
	};
	const access: CommandFeedbackItem = {
		id: id(5),
		label: 'Complete',
		phase: 'rejected',
		context: { kind: 'ticket', value: acceptedStart.ticket },
		// problemInsufficientScope's detail is not shown: the label says what is needed.
		explanation: EXPLANATIONS.access
	};
	const validation: CommandFeedbackItem = {
		id: id(6),
		label: 'Reply',
		phase: 'rejected',
		context: { kind: 'ticket', value: acceptedRetry.ticket },
		// The field errors (problemReplyValidationError) stay with the form.
		explanation: EXPLANATIONS.validation
	};
	const unconfirmed: CommandFeedbackItem = {
		id: id(7),
		label: 'Stop run',
		phase: 'unconfirmed',
		context: { kind: 'run', value: 'run_work_failed' },
		// An internal_error (problemInternalError) may have been applied.
		explanation: EXPLANATIONS.unconfirmed
	};
	const replyFieldMessage = problemReplyValidationError.errors[0]!.message;

	const { Story } = defineMeta({
		title: 'Components/Factory/CommandFeedback',
		component: CommandFeedback,
		args: { onretry: fn(), ondismiss: fn() },
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'The shell\'s command feedback, below the header. The latest transition is announced in one polite live region. Every unresolved command stays listed after the notice clears, with the ticket key or run id in mono, a signal chip (Sending, Accepted, Rejected, Unconfirmed) and an explanation. Accepted reads "Accepted, waiting for the factory", never done. Rejected rows offer Dismiss; Unconfirmed rows also offer Retry delivery, which resends the same intent. Validation field errors stay with their form. Empty: only the empty live region renders.'
				}
			}
		}
	});
</script>

<Story
	name="Empty"
	args={{ intents: [], notice: null }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
		await expect(live(pane)).toHaveTextContent('');
		await expect(live(pane)).toHaveAttribute('role', 'status');
		await expect(rows(pane)).toHaveLength(0);
		await expect(within(pane).queryByRole('button')).toBeNull();
	}}
/>

<Story
	name="Pending"
	args={{ intents: [sending], notice: `Retry: ${EXPLANATIONS.submitting}` }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(live(pane)).toHaveTextContent('Retry: Sending to the factory.');
		const [row] = rows(pane);
		await expect(row).toHaveAttribute('data-phase', 'submitting');
		await expect(row).toHaveTextContent('Retry');
		await expect(row!.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Sending');
		await expect(row!.querySelector('[data-slot="status-badge"]')).toHaveAttribute(
			'data-signal',
			'standby'
		);
		const key = row!.querySelector('[data-slot="command-context"]')!;
		await expect(key).toHaveTextContent(acceptedRetry.ticket);
		await expect(key).toHaveClass('font-mono', 'tabular-nums');
		await expect(button(pane, 'Retry delivery')).toBeNull();
		await expect(button(pane, 'Dismiss')).toBeNull();
	}}
/>

<Story
	name="Accepted awaiting"
	args={{ intents: [accepted], notice: `Start ticket: ${EXPLANATIONS.accepted}` }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(live(pane)).toHaveTextContent('Start ticket: Accepted, waiting for the factory.');
		const [row] = rows(pane);
		await expect(row).toHaveAttribute('data-phase', 'accepted');
		await expect(row).toHaveTextContent('Accepted, waiting for the factory');
		await expect(row!.querySelector('[data-slot="status-badge"]')).toHaveAttribute(
			'data-signal',
			'run'
		);
		await expect(pane).not.toHaveTextContent(/done|success|complete/i);
		await expect(within(pane).queryByRole('button')).toBeNull();
	}}
/>

<Story
	name="Confirmed"
	args={{ intents: [confirmed], notice: `Retry: ${EXPLANATIONS.confirmed}` }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(live(pane)).toHaveTextContent('Retry: The factory recorded it.');
		await expect(rows(pane)).toHaveLength(0);
		await expect(within(pane).queryByRole('button')).toBeNull();
	}}
/>

<Story
	name="Rejected"
	args={{ intents: [stale, access, validation], notice: `Reply: ${EXPLANATIONS.validation}` }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(live(pane)).toHaveTextContent('Reply: Fix the highlighted fields.');
		const [staleRow, accessRow, validationRow] = rows(pane);
		for (const row of [staleRow!, accessRow!, validationRow!]) {
			await expect(row).toHaveAttribute('data-phase', 'rejected');
			await expect(row.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Rejected');
			await expect(row.querySelector('[data-slot="status-badge"]')).toHaveAttribute(
				'data-signal',
				'fault'
			);
			await expect(button(row, 'Dismiss')).not.toBeNull();
			await expect(button(row, 'Retry delivery')).toBeNull();
		}
		await expect(staleRow).toHaveTextContent('The ticket changed; its current state is shown.');
		await expect(staleRow).toHaveTextContent(problemInvalidState.detail);
		await expect(accessRow).toHaveTextContent('Action access required');
		await expect(validationRow).toHaveTextContent('Fix the highlighted fields');
		await expect(validationRow).not.toHaveTextContent(replyFieldMessage);
	}}
/>

<Story
	name="Rejected dismiss"
	args={{ intents: [stale], notice: null }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		// The notice cleared; the unresolved row stays listed.
		await expect(live(pane)).toHaveTextContent('');
		await expect(rows(pane)).toHaveLength(1);
		await userEvent.click(button(pane, 'Dismiss')!);
		await expect(args.ondismiss).toHaveBeenCalledWith(stale.id);
	}}
/>

<Story
	name="Unconfirmed"
	args={{ intents: [unconfirmed], notice: `Stop run: ${EXPLANATIONS.unconfirmed}` }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(live(pane)).toHaveTextContent(`Stop run: ${EXPLANATIONS.unconfirmed}`);
		const [row] = rows(pane);
		await expect(row).toHaveAttribute('data-phase', 'unconfirmed');
		await expect(row!.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Unconfirmed');
		await expect(row).toHaveTextContent(
			"The factory's answer was lost; the command may have been applied."
		);
		const key = row!.querySelector('[data-slot="command-context"]')!;
		await expect(key).toHaveTextContent('run_work_failed');
		await expect(key).toHaveClass('font-mono', 'tabular-nums');
		await expect(button(row!, 'Dismiss')).not.toBeNull();
		await userEvent.click(button(row!, 'Retry delivery')!);
		await expect(args.onretry).toHaveBeenCalledWith(unconfirmed.id);
	}}
/>

<Story
	name="Mixed"
	args={{
		intents: [
			sending,
			accepted,
			confirmed,
			stale,
			{
				...unconfirmed,
				context: { kind: 'ticket', value: acceptedStop.ticket },
				id: id(8)
			}
		],
		notice: null
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(live(pane)).toHaveTextContent('');
		await expect(rows(pane).map((row) => row.dataset.phase)).toEqual([
			'submitting',
			'accepted',
			'rejected',
			'unconfirmed'
		]);
		await expect(within(pane).getAllByRole('button', { name: 'Retry delivery' })).toHaveLength(1);
		await expect(within(pane).getAllByRole('button', { name: 'Dismiss' })).toHaveLength(2);
	}}
/>
