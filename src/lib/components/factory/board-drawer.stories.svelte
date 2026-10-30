<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent } from 'storybook/test';
	import BoardDrawer from './board-drawer.svelte';

	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	const { Story } = defineMeta({
		title: 'Components/Factory/BoardDrawer',
		component: BoardDrawer,
		args: { open: true, labelledBy: 'unused', scrollKey: 'one', onclose: fn() },
		parameters: {
			a11y: {
				test: 'error',
				// Side by side renders the drawer twice (light and dark), so its
				// complementary landmark repeats; a page shows one drawer.
				config: { rules: [{ id: 'landmark-unique', enabled: false }] }
			},
			docs: {
				description: {
					component:
						'Non-modal panel over the right side of the Flow board. The board stays usable. Escape closes it unless focus is in a text field or a dialog. Changing scrollKey returns the panel to the top.'
				}
			}
		}
	});
</script>

<Story
	name="Open"
	args={{ onclose: fn() }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const panel = pane.querySelector('[data-slot="board-drawer"]');
		const heading = pane.querySelector('h2');
		await expect(panel).not.toBeNull();
		await expect(heading).not.toBeNull();
		await expect(panel).toHaveAttribute('aria-labelledby', heading!.id);
		pane.querySelector<HTMLButtonElement>('button')!.focus();
		await userEvent.keyboard('{Escape}');
		await expect(args.onclose).toHaveBeenCalledTimes(1);
	}}
>
	{#snippet template(args)}
		{@const headingId = `drawer-heading-${Math.random().toString(36).slice(2, 8)}`}
		<div class="relative h-80 overflow-hidden bg-background">
			<BoardDrawer open labelledBy={headingId} scrollKey="one" onclose={args.onclose ?? (() => {})}>
				<h2 id={headingId} class="p-4 text-2xl font-light">Selected ticket</h2>
				<p class="px-4">The board stays usable beside this panel.</p>
				<button type="button" class="m-4">Mark</button>
			</BoardDrawer>
		</div>
	{/snippet}
</Story>

<Story
	name="Escape in a text field"
	args={{ onclose: fn() }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const field = pane.querySelector<HTMLTextAreaElement>('textarea')!;
		field.focus();
		await userEvent.keyboard('{Escape}');
		await expect(args.onclose).not.toHaveBeenCalled();
	}}
>
	{#snippet template(args)}
		{@const headingId = `drawer-reply-${Math.random().toString(36).slice(2, 8)}`}
		<div class="relative h-80 overflow-hidden bg-background">
			<BoardDrawer
				open
				labelledBy={headingId}
				scrollKey="reply"
				onclose={args.onclose ?? (() => {})}
			>
				<h2 id={headingId} class="p-4 text-2xl font-light">Reply</h2>
				<textarea aria-label="Reply" class="m-4 border border-border bg-background p-2"></textarea>
			</BoardDrawer>
		</div>
	{/snippet}
</Story>
