<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import TicketActions, { ACTION_NOTES, type TicketActionsFeedback } from './ticket-actions.svelte';
	import { toTicketDetail } from '$lib/factory/adapters';
	import { EXPLANATIONS } from '$lib/factory/commands.svelte';
	import type { CommandAccess, CommandInput, CommandPhase } from '$lib/factory/commands';
	import type { components } from '$lib/factory/generated/factory-api';
	import { ACTION_REASONS, ticketActions, type TicketAction } from '$lib/factory/ticket-actions';
	import {
		executionList,
		problemInvalidState,
		runWorkRunning,
		runsTwoActive,
		ticketDetailActiveInWork,
		ticketDetailAgentQuestion,
		ticketDetailCancelled,
		ticketDetailComplete,
		ticketDetailFailed,
		ticketDetailManualApproval,
		ticketDetailMultiExecutionFirst,
		ticketDetailPaused,
		ticketDetailQueued,
		ticketDetailReadyForHandoff,
		ticketDetailResuming,
		ticketDetailTrackerWarnings
	} from '$lib/factory/fixtures';

	type Schemas = components['schemas'];

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	/** The ticket's only execution, its current one. */
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

	type Options = {
		runs?: Schemas['Run'][];
		executions?: Schemas['ExecutionList'];
		access?: CommandAccess;
		feedback?: TicketActionsFeedback;
		stopRun?: string | null;
	};

	/** Story args from a fixture, through the adapter and the selector. */
	const build = (detail: Schemas['TicketDetail'], options: Options = {}) => {
		const view = toTicketDetail({
			detail,
			executions: options.executions ?? onlyExecution(detail),
			runs: options.runs ?? []
		});
		const feedback = options.feedback ?? {};
		// Action names are the command names, the first part of a command target.
		const phaseFor = (target: string): CommandPhase =>
			feedback[target.split(':')[0] as TicketAction]?.phase ?? 'idle';
		return {
			state: ticketActions({
				detail: view,
				access: options.access ?? 'unknown',
				phaseFor,
				stopRun: options.stopRun
			}),
			ticket: view.header.key,
			displayRef: view.header.displayRef,
			execution: view.header.execution,
			feedback,
			oncommand: fn<(input: CommandInput) => void>(),
			onstoprunchange: fn<(run: string | null) => void>()
		};
	};

	type Expected = Partial<Record<TicketAction, 'enabled' | 'disabled'>>;
	const BAR_ACTIONS = ['stop', 'retry', 'cancel', 'complete', 'rerun'] as const;
	const LABELS: Record<(typeof BAR_ACTIONS)[number], string> = {
		stop: 'Stop agent',
		retry: 'Retry',
		cancel: 'Cancel execution',
		complete: 'Mark complete',
		rerun: 'Rerun'
	};

	const control = (pane: HTMLElement, action: (typeof BAR_ACTIONS)[number]) =>
		within(pane).getByRole('button', { name: LABELS[action] });

	/** Exactly these actions render, each enabled or disabled; the others are absent. */
	const expectActions = async (pane: HTMLElement, expected: Expected) => {
		for (const action of BAR_ACTIONS) {
			const row = pane.querySelector(`[data-action="${action}"]`);
			const state = expected[action];
			if (!state) {
				await expect(row).toBeNull();
				continue;
			}
			await expect(row).not.toBeNull();
			const button = control(pane, action);
			if (state === 'enabled') await expect(button).toBeEnabled();
			else await expect(button).toBeDisabled();
		}
	};

	/** A disabled action shows its reason as text the control is described by. */
	const expectReason = async (
		pane: HTMLElement,
		action: (typeof BAR_ACTIONS)[number],
		reason: string
	) => {
		const text = pane.querySelector<HTMLElement>(`[data-reason="${action}"]`)!;
		await expect(text).toBeVisible();
		await expect(text).toHaveTextContent(reason);
		await expect(control(pane, action).getAttribute('aria-describedby')).toContain(text.id);
	};

	const expectFailure = async (
		pane: HTMLElement,
		action: (typeof BAR_ACTIONS)[number],
		explanation: string
	) => {
		const text = pane.querySelector<HTMLElement>(`[data-failure="${action}"]`)!;
		await expect(text).toHaveTextContent(explanation);
		await expect(control(pane, action).getAttribute('aria-describedby')).toContain(text.id);
		await expect(control(pane, action)).toBeEnabled();
	};

	const rejected = {
		phase: 'rejected',
		explanation: `${EXPLANATIONS.stale} ${problemInvalidState.detail}`
	} as const;
	const submitting = { phase: 'submitting', explanation: EXPLANATIONS.submitting } as const;
	const accepted = { phase: 'accepted', explanation: EXPLANATIONS.accepted } as const;

	const active = build(ticketDetailActiveInWork, { runs: [runWorkRunning] });
	const paused = build(ticketDetailPaused);
	const failed = build(ticketDetailFailed);
	const handoff = build(ticketDetailReadyForHandoff);
	const complete = build(ticketDetailComplete);
	const multi = build(ticketDetailActiveInWork, { runs: runsTwoActive });

	const accessCommands = fn<(input: CommandInput) => void>();

	// Cancel goes through the dialog. An open dialog portals to <body>, outside the
	// side-by-side `.dark` pane, and two open copies would compete for the focus trap. So
	// each dialog state runs twice, as a light story and a dark story (story-level globals),
	// and `expectTheme` checks the theme it ran in.
	const lightTheme = { theme: 'light' };
	const darkTheme = { theme: 'dark' };
	type DialogContext = {
		args: Partial<ComponentProps<typeof TicketActions>>;
		canvasElement: HTMLElement;
		globals: Record<string, unknown>;
	};
	const expectTheme = async (theme: unknown) => {
		await expect(document.querySelectorAll('[data-theme-pane]')).toHaveLength(1);
		await expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');
	};
	const inTheme =
		(play: (context: DialogContext) => Promise<void>) => async (context: DialogContext) => {
			await expectTheme(context.globals.theme);
			// A story that starts closed waits for the previous story's dialog to release its
			// page lock; a story that starts open holds the lock itself.
			if (!context.args.cancelOpen && context.args.state)
				await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
			await play(context);
		};
	const cancelDismissedPlay = inTheme(async ({ args, canvasElement }) => {
		const body = within(document.body);
		await userEvent.click(control(firstPane(canvasElement), 'cancel'));
		await expect(args.oncommand).not.toHaveBeenCalled();
		let dialog = await body.findByRole('alertdialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Keep execution' }));
		await waitFor(() => expect(body.queryByRole('alertdialog')).toBeNull());
		// The closed dialog releases the page's pointer lock after its exit.
		await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));

		await userEvent.click(control(firstPane(canvasElement), 'cancel'));
		dialog = await body.findByRole('alertdialog');
		await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
		await userEvent.keyboard('{Escape}');
		await waitFor(() => expect(body.queryByRole('alertdialog')).toBeNull());
		await expect(args.oncommand).toHaveBeenCalledTimes(0);
	});
	const cancelConfirmedPlay = inTheme(async ({ args, canvasElement }) => {
		const body = within(document.body);
		await userEvent.click(control(firstPane(canvasElement), 'cancel'));
		const dialog = await body.findByRole('alertdialog', {
			name: `Cancel execution ${ticketDetailPaused.execution} of ${ticketDetailPaused.displayRef}?`
		});
		await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel execution' }));
		await expect(args.oncommand).toHaveBeenCalledOnce();
		await expect(args.oncommand).toHaveBeenCalledWith({
			command: 'cancel',
			ticket: ticketDetailPaused.key
		});
		// The dialog waits for the parent: it stays open until the cancel is confirmed.
		await expect(body.getByRole('alertdialog')).toHaveAttribute('data-state', 'open');
		await waitFor(() => expect(body.getByRole('alertdialog')).toBeVisible());
	});
	const cancelPendingPlay = inTheme(async ({ args }) => {
		const body = within(document.body);
		const dialog = await body.findByRole('alertdialog');
		const action = within(dialog).getByRole('button', { name: 'Cancelling…' });
		await expect(action).toBeDisabled();
		await expect(action).toHaveAttribute('aria-busy', 'true');
		await userEvent.click(action, { pointerEventsCheck: 0 });
		await expect(args.oncommand).not.toHaveBeenCalled();
		await expect(body.getByRole('alertdialog')).toHaveAttribute('data-state', 'open');
		await waitFor(() => expect(body.getByRole('alertdialog')).toBeVisible());
	});
	const cancelRefusedPlay = inTheme(async () => {
		accessCommands.mockClear();
		const body = within(document.body);
		const dialog = await body.findByRole('alertdialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel execution' }));
		await expect(accessCommands).toHaveBeenCalledOnce();
		await expect(accessCommands).toHaveBeenCalledWith({
			command: 'cancel',
			ticket: ticketDetailPaused.key
		});

		// The rejection keeps the dialog open; known read-only access disables its action.
		await waitFor(() =>
			expect(within(dialog).getByTestId('cancel-blocked')).toHaveTextContent(
				ACTION_REASONS.readOnly
			)
		);
		const action = within(dialog).getByRole('button', { name: 'Cancel execution' });
		await expect(action).toBeDisabled();
		await expect(within(dialog).getByTestId('cancel-explanation')).toHaveTextContent(
			EXPLANATIONS.access
		);
		await userEvent.click(action, { pointerEventsCheck: 0 });
		await expect(accessCommands).toHaveBeenCalledOnce();
		await expect(body.getByRole('alertdialog')).toHaveAttribute('data-state', 'open');
	});

	const { Story } = defineMeta({
		title: 'Components/Factory/TicketActions',
		component: TicketActions,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						"The current execution's action bar: Stop agent, Retry, Mark complete, Rerun and Cancel execution. It renders the availability from `ticketActions` and each action's `feedback` (phase and explanation), and emits typed command inputs through `oncommand`. Hidden actions are absent; a disabled one shows its reason. Stop names its run, and with several active runs asks for one through `onstoprunchange`. Cancel opens a confirmation and never sends directly. A past execution renders nothing."
				}
			}
		}
	});
</script>

<script lang="ts">
	// The several-runs story: choosing a run feeds the selector again, as the placement will.
	let chosenRun = $state<string | null>(null);
	const multiState = $derived(
		build(ticketDetailActiveInWork, { runs: runsTwoActive, stopRun: chosenRun }).state
	);

	// The access-rejection story: the first cancel is refused for scope while the
	// dialog is open, and the coordinator then remembers read-only access.
	let accessKnown = $state<CommandAccess>('unknown');
	let accessFeedback = $state<TicketActionsFeedback>({});
	let accessOpen = $state(true);
	const accessArgs = $derived(
		build(ticketDetailPaused, { access: accessKnown, feedback: accessFeedback })
	);
	const refuseForScope = (input: CommandInput) => {
		accessCommands(input);
		accessFeedback = { cancel: { phase: 'submitting', explanation: EXPLANATIONS.submitting } };
		setTimeout(() => {
			accessKnown = 'read_only';
			accessFeedback = { cancel: { phase: 'rejected', explanation: EXPLANATIONS.access } };
		}, 0);
	};
</script>

<Story
	name="Queued"
	args={build(ticketDetailQueued)}
	play={async ({ canvasElement }) => {
		await expectActions(firstPane(canvasElement), { cancel: 'enabled' });
	}}
/>

<Story
	name="Active, one run"
	args={active}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectActions(pane, { stop: 'enabled', cancel: 'enabled' });
		const note = pane.querySelector('[data-note="stop"]')!;
		await expect(note).toHaveTextContent(`#${runWorkRunning.sequence}`);
		await expect(note).toHaveTextContent(runWorkRunning.id);
		await expect(pane.querySelector('fieldset')).toBeNull();
		await userEvent.click(control(pane, 'stop'));
		await expect(args.oncommand).toHaveBeenCalledOnce();
		await expect(args.oncommand).toHaveBeenCalledWith({
			command: 'stop',
			run: runWorkRunning.id
		});
	}}
/>

<Story
	name="Waiting for user"
	args={build(ticketDetailAgentQuestion)}
	play={async ({ canvasElement }) => {
		// Reply lives in its own composer; the bar offers Cancel.
		await expectActions(firstPane(canvasElement), { cancel: 'enabled' });
	}}
/>

<Story
	name="Waiting in wrapup"
	args={build(ticketDetailManualApproval)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectActions(pane, { cancel: 'enabled', complete: 'disabled' });
		await expectReason(pane, 'complete', ACTION_REASONS.preparingHandoff);
	}}
/>

<Story
	name="Paused"
	args={paused}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectActions(pane, { retry: 'enabled', cancel: 'enabled' });
		await expect(pane.querySelector('[data-note="retry"]')).toHaveTextContent(ACTION_NOTES.retry);
		await expect(pane.querySelector('[data-note="retry"]')).toHaveTextContent(
			'It is not a new execution.'
		);
		await userEvent.click(control(pane, 'retry'));
		await expect(args.oncommand).toHaveBeenCalledOnce();
		await expect(args.oncommand).toHaveBeenCalledWith({
			command: 'retry',
			ticket: ticketDetailPaused.key
		});
	}}
/>

<Story
	name="Resuming"
	args={build(ticketDetailResuming)}
	play={async ({ canvasElement }) => {
		await expectActions(firstPane(canvasElement), { cancel: 'enabled' });
	}}
/>

<Story
	name="Resume failed"
	args={build(ticketDetailTrackerWarnings)}
	play={async ({ canvasElement }) => {
		await expectActions(firstPane(canvasElement), { retry: 'enabled', cancel: 'enabled' });
	}}
/>

<Story
	name="Failed"
	args={failed}
	play={async ({ canvasElement }) => {
		await expectActions(firstPane(canvasElement), {
			retry: 'enabled',
			cancel: 'enabled',
			rerun: 'enabled'
		});
	}}
/>

<Story
	name="Ready for handoff"
	args={handoff}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectActions(pane, { complete: 'enabled', cancel: 'enabled' });
		await expect(pane.querySelector('[data-note="complete"]')).toHaveTextContent(
			'It does not merge the pull request.'
		);
		await userEvent.click(control(pane, 'complete'));
		await expect(args.oncommand).toHaveBeenCalledOnce();
		await expect(args.oncommand).toHaveBeenCalledWith({
			command: 'complete',
			ticket: ticketDetailReadyForHandoff.key
		});
	}}
/>

<Story
	name="Complete"
	args={complete}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectActions(pane, { rerun: 'enabled' });
		await expect(pane.querySelector('[data-note="rerun"]')).toHaveTextContent(
			ACTION_NOTES.rerun(ticketDetailComplete.execution + 1)
		);
		await expect(pane.querySelector('[data-note="rerun"]')).toHaveTextContent(
			'Starts a new execution'
		);
		await userEvent.click(control(pane, 'rerun'));
		await expect(args.oncommand).toHaveBeenCalledOnce();
		await expect(args.oncommand).toHaveBeenCalledWith({
			command: 'rerun',
			ticket: ticketDetailComplete.key
		});
	}}
/>

<Story
	name="Cancelled"
	args={build(ticketDetailCancelled)}
	play={async ({ canvasElement }) => {
		await expectActions(firstPane(canvasElement), { rerun: 'enabled' });
	}}
/>

<Story
	name="Past execution"
	args={build(ticketDetailMultiExecutionFirst, { executions: executionList })}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('[data-slot="ticket-actions"]')).toBeNull();
		await expect(within(canvasElement).queryAllByRole('button')).toEqual([]);
	}}
/>

<Story
	name="Several active runs"
	args={multi}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const stop = control(pane, 'stop');
		await expect(stop).toBeDisabled();
		await expectReason(pane, 'stop', ACTION_REASONS.chooseRun);
		const radios = within(pane).getAllByRole('radio');
		await expect(radios).toHaveLength(runsTwoActive.length);
		for (const radio of radios) await expect(radio).not.toBeChecked();
		await expect(args.oncommand).not.toHaveBeenCalled();

		const target = runsTwoActive[1]!;
		await userEvent.click(within(pane).getByRole('radio', { name: new RegExp(target.id) }));
		await waitFor(() => expect(control(pane, 'stop')).toBeEnabled());
		await expect(pane.querySelector('[data-reason="stop"]')).toBeNull();
		await expect(pane.querySelector('[data-note="stop"]')).toHaveTextContent(target.id);
		await userEvent.click(control(pane, 'stop'));
		await expect(args.oncommand).toHaveBeenCalledOnce();
		await expect(args.oncommand).toHaveBeenCalledWith({
			command: 'stop',
			run: target.id
		});
	}}
>
	{#snippet template(args)}
		<TicketActions {...args} state={multiState} onstoprunchange={(run) => (chosenRun = run)} />
	{/snippet}
</Story>

<Story
	name="Read-only"
	args={build(ticketDetailPaused, { runs: [runWorkRunning], access: 'read_only' })}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const explanation = pane.querySelectorAll('[data-testid="access-explanation"]');
		await expect(explanation).toHaveLength(1);
		await expect(explanation[0]).toBeVisible();
		await expect(explanation[0]).toHaveTextContent(ACTION_REASONS.readOnly);
		await expectActions(pane, { stop: 'disabled', retry: 'disabled', cancel: 'disabled' });
		for (const button of within(pane).getAllByRole('button')) {
			await expect(button).toBeDisabled();
			await expect(button.getAttribute('aria-describedby')).toContain(explanation[0]!.id);
		}
		await expect(pane.querySelectorAll('[data-reason]')).toHaveLength(0);
		await expect(args.oncommand).not.toHaveBeenCalled();
	}}
/>

<!-- Pending: the action is disabled with its pending label. -->

<Story
	name="Stop pending"
	args={build(ticketDetailActiveInWork, { runs: [runWorkRunning], feedback: { stop: accepted } })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(control(pane, 'stop')).toBeDisabled();
		await expectReason(pane, 'stop', 'Stop requested');
	}}
/>

<Story
	name="Retry pending"
	args={build(ticketDetailPaused, { feedback: { retry: submitting } })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(control(pane, 'retry')).toBeDisabled();
		await expectReason(pane, 'retry', 'Sending…');
	}}
/>

<Story
	name="Cancel pending"
	args={build(ticketDetailPaused, { feedback: { cancel: submitting } })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(control(pane, 'cancel')).toBeDisabled();
		await expectReason(pane, 'cancel', 'Sending…');
	}}
/>

<Story
	name="Mark complete pending"
	args={build(ticketDetailReadyForHandoff, { feedback: { complete: accepted } })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(control(pane, 'complete')).toBeDisabled();
		await expectReason(pane, 'complete', ACTION_REASONS.accepted);
	}}
/>

<Story
	name="Rerun pending"
	args={build(ticketDetailComplete, { feedback: { rerun: submitting } })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(control(pane, 'rerun')).toBeDisabled();
		await expectReason(pane, 'rerun', 'Sending…');
	}}
/>

<!-- Rejected: the explanation shows, and the action stays usable for a new attempt. -->

<Story
	name="Stop rejected"
	args={build(ticketDetailActiveInWork, { runs: [runWorkRunning], feedback: { stop: rejected } })}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expectFailure(pane, 'stop', rejected.explanation);
		await userEvent.click(control(pane, 'stop'));
		await expect(args.oncommand).toHaveBeenCalledOnce();
	}}
/>

<Story
	name="Retry rejected"
	args={build(ticketDetailPaused, { feedback: { retry: rejected } })}
	play={async ({ canvasElement }) => {
		await expectFailure(firstPane(canvasElement), 'retry', rejected.explanation);
	}}
/>

<Story
	name="Cancel rejected"
	args={build(ticketDetailPaused, { feedback: { cancel: rejected } })}
	play={async ({ canvasElement }) => {
		await expectFailure(firstPane(canvasElement), 'cancel', rejected.explanation);
	}}
/>

<Story
	name="Mark complete rejected"
	args={build(ticketDetailReadyForHandoff, { feedback: { complete: rejected } })}
	play={async ({ canvasElement }) => {
		await expectFailure(firstPane(canvasElement), 'complete', rejected.explanation);
	}}
/>

<Story
	name="Rerun rejected"
	args={build(ticketDetailComplete, { feedback: { rerun: rejected } })}
	play={async ({ canvasElement }) => {
		await expectFailure(firstPane(canvasElement), 'rerun', rejected.explanation);
	}}
/>

<!-- Cancel goes through the dialog: each state as a light and a dark story (see cancelDismissedPlay). -->

<Story
	name="Cancel dismissed, light"
	globals={lightTheme}
	args={paused}
	play={cancelDismissedPlay}
/>

<Story
	name="Cancel confirmed, light"
	globals={lightTheme}
	args={paused}
	play={cancelConfirmedPlay}
/>

<Story
	name="Cancel pending in dialog, light"
	globals={lightTheme}
	args={{
		...build(ticketDetailPaused, { feedback: { cancel: accepted } }),
		cancelOpen: true
	}}
	play={cancelPendingPlay}
/>

<Story
	name="Cancel refused for access while open, light"
	globals={lightTheme}
	play={cancelRefusedPlay}
>
	{#snippet template()}
		<TicketActions {...accessArgs} oncommand={refuseForScope} bind:cancelOpen={accessOpen} />
	{/snippet}
</Story>

<Story name="Cancel dismissed, dark" globals={darkTheme} args={paused} play={cancelDismissedPlay} />

<Story name="Cancel confirmed, dark" globals={darkTheme} args={paused} play={cancelConfirmedPlay} />

<Story
	name="Cancel pending in dialog, dark"
	globals={darkTheme}
	args={{
		...build(ticketDetailPaused, { feedback: { cancel: accepted } }),
		cancelOpen: true
	}}
	play={cancelPendingPlay}
/>

<Story
	name="Cancel refused for access while open, dark"
	globals={darkTheme}
	play={cancelRefusedPlay}
>
	{#snippet template()}
		<TicketActions {...accessArgs} oncommand={refuseForScope} bind:cancelOpen={accessOpen} />
	{/snippet}
</Story>
