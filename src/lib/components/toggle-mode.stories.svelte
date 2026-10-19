<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { ModeWatcher } from 'mode-watcher';
	import { expect, waitFor, within } from 'storybook/test';
	import ToggleMode from './toggle-mode.svelte';

	// `toggleMode` only reaches <html> while a <ModeWatcher /> is mounted, as in
	// the app layout. The story mounts one whose default matches the theme the
	// decorator applied (side by side keeps <html> light), and clears the stored
	// preference so an earlier click does not leak into the next render.
	const MODE_KEY = 'mode-watcher-mode';

	const { Story } = defineMeta({
		title: 'Components/ToggleMode',
		component: ToggleMode,
		beforeEach: () => {
			localStorage.removeItem(MODE_KEY);
			return () => localStorage.removeItem(MODE_KEY);
		}
	});
</script>

<Story name="Default">
	{#snippet template(_args, context)}
		<ModeWatcher
			track={false}
			disableHeadScriptInjection
			defaultMode={context.globals.theme === 'dark' ? 'dark' : 'light'}
		/>
		<ToggleMode />
	{/snippet}
</Story>

<Story
	name="Click toggles the theme"
	play={async ({ canvasElement }) => {
		const html = document.documentElement;
		const button = within(canvasElement).getAllByRole('button', { name: 'Toggle theme' })[0]!;
		const startedDark = html.classList.contains('dark');

		await button.click();
		await waitFor(() => expect(html.classList.contains('dark')).toBe(!startedDark));

		await button.click();
		await waitFor(() => expect(html.classList.contains('dark')).toBe(startedDark));
	}}
>
	{#snippet template(_args, context)}
		<ModeWatcher
			track={false}
			disableHeadScriptInjection
			defaultMode={context.globals.theme === 'dark' ? 'dark' : 'light'}
		/>
		<ToggleMode />
	{/snippet}
</Story>
