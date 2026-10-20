<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import WorkCard from './work-card.svelte';

	const { Story } = defineMeta({
		title: 'Components/WorkCard',
		component: WorkCard,
		argTypes: {
			title: { control: 'text' },
			value: { control: 'number' }
		}
	});

	// Shared by both theme panes, so one click changes both counts.
	let count = $state(3);
</script>

<Story name="Plan stage" args={{ title: 'Plan', value: 3 }} />

<Story name="Empty stage" args={{ title: 'Review', value: 0 }} />

<Story name="All stages" asChild>
	<div class="flex flex-wrap gap-4">
		<WorkCard title="Plan" value={3} />
		<WorkCard title="Work" value={5} />
		<WorkCard title="QA" value={2} />
		<WorkCard title="Review" value={1} />
		<WorkCard title="Wrap-up" value={0} />
	</div>
</Story>

<Story
	name="Count change"
	asChild
	play={async ({ canvasElement }) => {
		const pane =
			(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
		const card = pane.querySelector('[data-slot="card"]')!;
		// No flash on first render.
		await expect(card).not.toHaveAttribute('data-flash');
		await userEvent.click(within(pane).getByRole('button', { name: 'Add a ticket' }));
		await waitFor(() => expect(card).toHaveAttribute('data-flash', 'on'));
		await waitFor(() => expect(card).not.toHaveAttribute('data-flash'));
	}}
>
	<div class="flex flex-col items-start gap-3">
		<WorkCard title="Work" value={count} />
		<button
			type="button"
			class="bg-muted px-2 py-1 text-xs text-foreground ring-1 ring-foreground/10"
			onclick={() => count++}>Add a ticket</button
		>
	</div>
</Story>
