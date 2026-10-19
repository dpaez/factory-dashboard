<script lang="ts">
	import type { Snippet } from 'svelte';

	type Theme = 'light' | 'dark' | 'side-by-side';

	let { theme = 'light', children }: { theme?: Theme; children: Snippet } = $props();

	// Mirror ModeWatcher: the `.dark` class and `color-scheme` live on <html>.
	// Side by side keeps <html> light and scopes the dark pane with a `.dark`
	// wrapper, which layout.css supports (`.dark { --tokens }` and
	// `@custom-variant dark (&:is(.dark *))`).
	$effect(() => {
		const html = document.documentElement;
		const dark = theme === 'dark';
		html.classList.toggle('dark', dark);
		html.style.colorScheme = dark ? 'dark' : 'light';
	});
</script>

{#if theme === 'side-by-side'}
	<div class="not-prose grid min-h-screen grid-cols-1 gap-px bg-border md:grid-cols-2">
		<div data-theme-pane="light" class="bg-background p-6 text-foreground">
			{@render children()}
		</div>
		<div data-theme-pane="dark" class="dark" style="color-scheme: dark">
			<div class="h-full bg-background p-6 text-foreground">
				{@render children()}
			</div>
		</div>
	</div>
{:else}
	<div data-theme-pane={theme} class="not-prose min-h-screen bg-background p-6 text-foreground">
		{@render children()}
	</div>
{/if}
