<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import { Label } from '$lib/components/ui/label/index.js';
	import Input from './input.svelte';

	// Stories render twice (light and dark panes), so every id needs a suffix.
	let uid = 0;
	const nextId = (name: string) => `${name}-${++uid}`;

	const { Story } = defineMeta({
		title: 'UI/Input',
		component: Input,
		parameters: {
			a11y: { test: 'error' }
		}
	});
</script>

<Story
	name="Default"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const field = canvas.getAllByRole('textbox', { name: 'Ticket title' })[0]!;
		await userEvent.click(canvas.getAllByText('Ticket title')[0]!);
		await expect(field).toHaveFocus();
	}}
>
	{#snippet template()}
		{@const id = nextId('ticket-title')}
		<div class="flex max-w-sm flex-col gap-2">
			<Label for={id}>Ticket title</Label>
			<Input {id} placeholder="Add form primitives" />
		</div>
	{/snippet}
</Story>

<Story
	name="Focus"
	play={async ({ canvasElement }) => {
		const field = within(canvasElement).getAllByRole('textbox', { name: 'Ticket title' })[0]!;
		const before = getComputedStyle(field);
		const unfocused = { border: before.borderColor, shadow: before.boxShadow };

		await userEvent.tab();
		await expect(field).toHaveFocus();
		await expect(field.matches(':focus-visible')).toBe(true);
		await waitFor(() => {
			const after = getComputedStyle(field);
			expect(after.borderColor).not.toBe(unfocused.border);
			expect(after.boxShadow).not.toBe(unfocused.shadow);
		});
	}}
>
	{#snippet template()}
		{@const id = nextId('ticket-title-focus')}
		<div class="flex max-w-sm flex-col gap-2">
			<Label for={id}>Ticket title</Label>
			<Input {id} value="Add form primitives" />
		</div>
	{/snippet}
</Story>

<Story
	name="Disabled"
	play={async ({ canvasElement }) => {
		const fields = within(canvasElement).getAllByRole('textbox', { name: 'Ticket title' });
		for (const field of fields) await expect(field).toBeDisabled();

		await userEvent.tab();
		for (const field of fields) await expect(field).not.toHaveFocus();
	}}
>
	{#snippet template()}
		{@const id = nextId('ticket-title-disabled')}
		<div class="group flex max-w-sm flex-col gap-2" data-disabled="true">
			<Label for={id}>Ticket title</Label>
			<Input {id} value="Add form primitives" disabled />
		</div>
	{/snippet}
</Story>

<Story
	name="Invalid"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const field = canvas.getAllByRole('textbox', { name: 'Ticket title' })[0]!;
		const message = canvas.getAllByText('Ticket title cannot be empty')[0]!;

		await expect(field).toHaveAttribute('aria-invalid', 'true');
		await expect(message.id).not.toBe('');
		await expect(field.getAttribute('aria-describedby')).toBe(message.id);
		await expect(field).toHaveAccessibleDescription('Ticket title cannot be empty');
	}}
>
	{#snippet template()}
		{@const id = nextId('ticket-title-invalid')}
		<div class="flex max-w-sm flex-col gap-2">
			<Label for={id}>Ticket title</Label>
			<Input {id} value="" aria-invalid="true" aria-describedby={`${id}-message`} />
			<p
				id={`${id}-message`}
				class="text-xs/relaxed text-[color-mix(in_oklch,var(--destructive)_85%,var(--foreground))]"
			>
				Ticket title cannot be empty
			</p>
		</div>
	{/snippet}
</Story>
