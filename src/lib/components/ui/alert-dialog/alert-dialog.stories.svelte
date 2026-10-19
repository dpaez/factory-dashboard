<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import { ticketActiveInWork } from '$lib/factory/fixtures/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as AlertDialog from './index.js';

	// An open dialog portals to <body>, outside the side-by-side `.dark` pane, and
	// two open copies would compete for the focus trap. Open and interaction
	// stories therefore pin one theme each with story-level globals.
	const light = { theme: 'light' };
	const dark = { theme: 'dark' };

	// The local destructive variant's `text-destructive` on its 10-20% wash measures
	// 4.0:1 (light) and 4.48:1 (dark) at text-xs, below strict axe's 4.5:1. Same
	// token mix as the form primitives' field errors (task 01); button stays as is.
	const destructiveText = 'text-[color-mix(in_oklch,var(--destructive)_75%,var(--foreground))]';

	const ticketRef = ticketActiveInWork.displayRef;
	const body = () => within(document.body);

	const { Story } = defineMeta({
		title: 'UI/AlertDialog',
		component: AlertDialog.Root,
		parameters: {
			a11y: { test: 'error' }
		}
	});

	// Story-level globals win over the vitest plugin's side-by-side initialGlobals:
	// <html> carries `.dark` only for the dark variants, and findByRole finds a single dialog.
	const expectTheme = async (theme: unknown) => {
		await expect(document.querySelectorAll('[data-theme-pane]')).toHaveLength(1);
		await expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');
	};

	const expectOpenDialog = async () => {
		const dialog = await body().findByRole('alertdialog', { name: 'Cancel this execution?' });
		await expect(dialog).toHaveAccessibleDescription(
			`The factory stops ${ticketRef} and discards the work in progress.`
		);
		return dialog;
	};

	const openPlay = async ({ globals }: { globals: Record<string, unknown> }) => {
		await expectTheme(globals.theme);
		await expectOpenDialog();
	};

	const expectPending = async ({ globals }: { globals: Record<string, unknown> }) => {
		await expectTheme(globals.theme);
		const dialog = await expectOpenDialog();
		const scope = within(dialog);
		const action = scope.getByRole('button', { name: 'Cancelling…' });
		await expect(action).toBeDisabled();
		await expect(action).toHaveAttribute('aria-busy', 'true');
		await expect(action).toHaveAttribute('data-slot', 'alert-dialog-action');
		await expect(action.className).toContain('bg-destructive/10');
		await expect(action.className).not.toContain('bg-primary');

		const cancel = scope.getByRole('button', { name: 'Keep running' });
		await expect(cancel).toBeEnabled();
		cancel.focus();
		await expect(cancel).toHaveFocus();
	};

	const keyboardPlay = async ({
		canvasElement,
		globals
	}: {
		canvasElement: HTMLElement;
		globals: Record<string, unknown>;
	}) => {
		await expectTheme(globals.theme);
		const trigger = within(canvasElement).getByRole('button', { name: 'Cancel execution' });
		await expect(body().queryByRole('alertdialog')).toBeNull();

		trigger.focus();
		await userEvent.keyboard('{Enter}');
		const dialog = await expectOpenDialog();
		await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

		for (let i = 0; i < 4; i++) {
			await userEvent.tab();
			await expect(dialog.contains(document.activeElement)).toBe(true);
		}
		for (let i = 0; i < 4; i++) {
			await userEvent.tab({ shift: true });
			await expect(dialog.contains(document.activeElement)).toBe(true);
		}

		await userEvent.keyboard('{Escape}');
		await waitFor(() => expect(body().queryByRole('alertdialog')).toBeNull());
		await waitFor(() => expect(trigger).toHaveFocus());
	};
</script>

{#snippet dialog(open: boolean, pending: boolean)}
	<AlertDialog.Root {open}>
		<AlertDialog.Trigger class={buttonVariants({ variant: 'outline' })}>
			Cancel execution
		</AlertDialog.Trigger>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Cancel this execution?</AlertDialog.Title>
				<AlertDialog.Description>
					The factory stops {ticketRef} and discards the work in progress.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Keep running</AlertDialog.Cancel>
				<AlertDialog.Action
					variant="destructive"
					class={destructiveText}
					disabled={pending}
					aria-busy={pending}
				>
					{pending ? 'Cancelling…' : 'Cancel execution'}
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
{/snippet}

<Story
	name="Closed"
	play={async ({ canvasElement }) => {
		const triggers = within(canvasElement).getAllByRole('button', { name: 'Cancel execution' });
		for (const trigger of triggers) await expect(trigger).toBeVisible();
		await expect(body().queryByRole('alertdialog')).toBeNull();
	}}
>
	{#snippet template()}
		{@render dialog(false, false)}
	{/snippet}
</Story>

<Story name="Open light" globals={light} play={openPlay}>
	{#snippet template()}
		{@render dialog(true, false)}
	{/snippet}
</Story>

<Story name="Open dark" globals={dark} play={openPlay}>
	{#snippet template()}
		{@render dialog(true, false)}
	{/snippet}
</Story>

<Story name="Destructive pending light" globals={light} play={expectPending}>
	{#snippet template()}
		{@render dialog(true, true)}
	{/snippet}
</Story>

<Story name="Destructive pending dark" globals={dark} play={expectPending}>
	{#snippet template()}
		{@render dialog(true, true)}
	{/snippet}
</Story>

<Story name="Keyboard light" globals={light} play={keyboardPlay}>
	{#snippet template()}
		{@render dialog(false, false)}
	{/snippet}
</Story>

<Story name="Keyboard dark" globals={dark} play={keyboardPlay}>
	{#snippet template()}
		{@render dialog(false, false)}
	{/snippet}
</Story>
