<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import CancelExecutionDialog from './cancel-execution-dialog.svelte';
	import { EXPLANATIONS } from '$lib/factory/commands.svelte';
	import { ACTION_REASONS } from '$lib/factory/ticket-actions';
	import { problemInvalidState, ticketDetailActiveInWork } from '$lib/factory/fixtures';

	// An open dialog portals to <body>, outside the side-by-side `.dark` pane, and
	// two open copies would compete for the focus trap: every story pins one theme.
	const light = { theme: 'light' };
	const dark = { theme: 'dark' };

	const displayRef = ticketDetailActiveInWork.displayRef;
	const execution = ticketDetailActiveInWork.execution;
	const title = `Cancel execution ${execution} of ${displayRef}?`;
	const rejection = `${EXPLANATIONS.stale} ${problemInvalidState.detail}`;
	const body = () => within(document.body);

	const { Story } = defineMeta({
		title: 'Components/Factory/CancelExecutionDialog',
		component: CancelExecutionDialog,
		args: { displayRef, execution, open: true, onconfirm: fn() },
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Confirms cancelling the current execution. `open` is controlled; Keep execution and Escape close it and call nothing. "Cancel execution" calls `onconfirm`. While the cancel `phase` is submitting or accepted the dialog stays open with its action disabled and `aria-busy`; a rejection keeps it open with the `explanation`. The parent closes it once the cancel is confirmed.'
				}
			}
		}
	});

	type Globals = { globals: Record<string, unknown> };

	const expectTheme = async (theme: unknown) => {
		await expect(document.querySelectorAll('[data-theme-pane]')).toHaveLength(1);
		await expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');
	};

	const expectDialog = async () => {
		const dialog = await body().findByRole('alertdialog', { name: title });
		await expect(dialog).toHaveAccessibleDescription(
			`Agents stop, open tasks and questions are cancelled, and execution ${execution} ends. The worktree, branch and pull request are kept.`
		);
		return dialog;
	};

	const openPlay = async ({ globals, args }: Globals & { args: { onconfirm: () => void } }) => {
		await expectTheme(globals.theme);
		const dialog = await expectDialog();
		const scope = within(dialog);
		await expect(scope.getByRole('button', { name: 'Keep execution' })).toBeEnabled();
		const action = scope.getByRole('button', { name: 'Cancel execution' });
		await expect(action).toBeEnabled();
		await expect(action.className).toContain('bg-destructive/10');
		await expect(action.className).not.toContain('bg-primary');
		await expect(args.onconfirm).not.toHaveBeenCalled();
	};

	const pendingPlay = async ({ globals, args }: Globals & { args: { onconfirm: () => void } }) => {
		await expectTheme(globals.theme);
		const dialog = await expectDialog();
		const action = within(dialog).getByRole('button', { name: /^(Sending|Cancelling)…$/ });
		await expect(action).toBeDisabled();
		await expect(action).toHaveAttribute('aria-busy', 'true');
		await userEvent.click(action, { pointerEventsCheck: 0 });
		await expect(args.onconfirm).not.toHaveBeenCalled();
		// It does not close itself while the cancel is pending.
		const still = body().getByRole('alertdialog', { name: title });
		await expect(still).toHaveAttribute('data-state', 'open');
		await waitFor(() => expect(still).toBeVisible());
	};

	const rejectedPlay = async ({ globals }: Globals) => {
		await expectTheme(globals.theme);
		const dialog = await expectDialog();
		const scope = within(dialog);
		await expect(scope.getByRole('alert')).toHaveTextContent(rejection);
		const action = scope.getByRole('button', { name: 'Cancel execution' });
		await expect(action).toBeEnabled();
		await expect(action).not.toHaveAttribute('aria-busy', 'true');
	};

	const readOnlyPlay = async ({ globals, args }: Globals & { args: { onconfirm: () => void } }) => {
		await expectTheme(globals.theme);
		const dialog = await expectDialog();
		const scope = within(dialog);
		const reason = scope.getByTestId('cancel-blocked');
		await expect(reason).toHaveTextContent(ACTION_REASONS.readOnly);
		const action = scope.getByRole('button', { name: 'Cancel execution' });
		await expect(action).toBeDisabled();
		await expect(action.getAttribute('aria-describedby')).toContain(reason.id);
		await userEvent.click(action, { pointerEventsCheck: 0 });
		await expect(args.onconfirm).not.toHaveBeenCalled();
		await expect(scope.getByRole('button', { name: 'Keep execution' })).toBeEnabled();
	};

	const dismissPlay =
		(how: 'keep' | 'escape') =>
		async ({ globals, args }: Globals & { args: { onconfirm: () => void } }) => {
			await expectTheme(globals.theme);
			const dialog = await expectDialog();
			if (how === 'keep') {
				await userEvent.click(within(dialog).getByRole('button', { name: 'Keep execution' }));
			} else {
				await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
				await userEvent.keyboard('{Escape}');
			}
			await waitFor(() => expect(body().queryByRole('alertdialog')).toBeNull());
			await expect(args.onconfirm).toHaveBeenCalledTimes(0);
		};
</script>

<Story name="Open light" globals={light} play={openPlay} />
<Story name="Open dark" globals={dark} play={openPlay} />

<Story name="Pending light" globals={light} args={{ phase: 'accepted' }} play={pendingPlay} />
<Story name="Pending dark" globals={dark} args={{ phase: 'submitting' }} play={pendingPlay} />

<Story
	name="Rejected light"
	globals={light}
	args={{ phase: 'rejected', explanation: rejection }}
	play={rejectedPlay}
/>
<Story
	name="Rejected dark"
	globals={dark}
	args={{ phase: 'rejected', explanation: rejection }}
	play={rejectedPlay}
/>

<Story
	name="Read-only light"
	globals={light}
	args={{
		phase: 'rejected',
		explanation: EXPLANATIONS.access,
		disabledReason: ACTION_REASONS.readOnly
	}}
	play={readOnlyPlay}
/>
<Story
	name="Read-only dark"
	globals={dark}
	args={{
		phase: 'rejected',
		explanation: EXPLANATIONS.access,
		disabledReason: ACTION_REASONS.readOnly
	}}
	play={readOnlyPlay}
/>

<Story name="Dismissed with Keep execution" globals={light} play={dismissPlay('keep')} />
<Story name="Dismissed with Escape" globals={dark} play={dismissPlay('escape')} />
