<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import { Input } from '$lib/components/ui/input/index.js';
	import Label from './label.svelte';

	// Stories render twice (light and dark panes), so every id needs a suffix.
	let uid = 0;
	const nextId = (name: string) => `${name}-${++uid}`;

	const { Story } = defineMeta({
		title: 'UI/Label',
		component: Label,
		parameters: {
			a11y: { test: 'error' }
		}
	});
</script>

<Story
	name="Default"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const field = canvas.getAllByRole('textbox', { name: 'Operator name' })[0]!;
		await userEvent.click(canvas.getAllByText('Operator name')[0]!);
		await expect(field).toHaveFocus();
	}}
>
	{#snippet template()}
		{@const id = nextId('operator')}
		<div class="flex max-w-sm flex-col gap-2">
			<Label for={id}>Operator name</Label>
			<Input {id} placeholder="dpaez" />
		</div>
	{/snippet}
</Story>
