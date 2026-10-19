<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import * as Tabs from './index.js';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		within(
			(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement
		);

	const { Story } = defineMeta({
		title: 'UI/Tabs',
		component: Tabs.Root,
		parameters: {
			a11y: { test: 'error' }
		}
	});
</script>

{#snippet inspectorTabs(disableEvidence: boolean)}
	<Tabs.Root value="tasks" class="max-w-md">
		<Tabs.List aria-label="Inspector sections">
			<Tabs.Trigger value="tasks">Tasks</Tabs.Trigger>
			<Tabs.Trigger value="activity">Activity</Tabs.Trigger>
			<Tabs.Trigger value="evidence" disabled={disableEvidence}>Evidence</Tabs.Trigger>
			<Tabs.Trigger value="usage">Usage</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="tasks">Two tasks are planned for this ticket.</Tabs.Content>
		<Tabs.Content value="activity">The work stage started for this execution.</Tabs.Content>
		<Tabs.Content value="evidence">The QA stage has not recorded evidence yet.</Tabs.Content>
		<Tabs.Content value="usage">This execution has used 12,400 tokens.</Tabs.Content>
	</Tabs.Root>
{/snippet}

<Story
	name="Default"
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const tasks = pane.getByRole('tab', { name: 'Tasks' });
		const activity = pane.getByRole('tab', { name: 'Activity' });

		await expect(tasks).toHaveAttribute('aria-selected', 'true');
		await expect(pane.getByRole('tabpanel')).toHaveTextContent('Two tasks are planned');

		tasks.focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect(activity).toHaveFocus();
		await expect(activity).toHaveAttribute('aria-selected', 'true');
		await waitFor(() =>
			expect(pane.getByRole('tabpanel')).toHaveTextContent('The work stage started')
		);

		await userEvent.keyboard('{ArrowLeft}');
		await expect(tasks).toHaveFocus();
		await expect(tasks).toHaveAttribute('aria-selected', 'true');
		await waitFor(() =>
			expect(pane.getByRole('tabpanel')).toHaveTextContent('Two tasks are planned')
		);
	}}
>
	{#snippet template()}
		{@render inspectorTabs(false)}
	{/snippet}
</Story>

<Story
	name="Focus"
	play={async ({ canvasElement }) => {
		const tasks = firstPane(canvasElement).getByRole('tab', { name: 'Tasks' });
		const before = getComputedStyle(tasks);
		const unfocused = { border: before.borderColor, shadow: before.boxShadow };

		await userEvent.tab();
		await expect(tasks).toHaveFocus();
		await expect(tasks.matches(':focus-visible')).toBe(true);
		await waitFor(() => {
			const after = getComputedStyle(tasks);
			expect(after.borderColor).not.toBe(unfocused.border);
			expect(after.boxShadow).not.toBe(unfocused.shadow);
		});
	}}
>
	{#snippet template()}
		{@render inspectorTabs(false)}
	{/snippet}
</Story>

<Story
	name="Disabled trigger"
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const activity = pane.getByRole('tab', { name: 'Activity' });
		const evidence = pane.getByRole('tab', { name: 'Evidence' });
		const usage = pane.getByRole('tab', { name: 'Usage' });

		await expect(evidence).toBeDisabled();

		activity.focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect(usage).toHaveFocus();
		await expect(usage).toHaveAttribute('aria-selected', 'true');
		await expect(evidence).toHaveAttribute('aria-selected', 'false');
		await waitFor(() =>
			expect(pane.getByRole('tabpanel')).toHaveTextContent('This execution has used')
		);

		await userEvent.keyboard('{ArrowLeft}');
		await expect(activity).toHaveFocus();
		await expect(activity).toHaveAttribute('aria-selected', 'true');
	}}
>
	{#snippet template()}
		{@render inspectorTabs(true)}
	{/snippet}
</Story>
