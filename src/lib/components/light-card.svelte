<script lang="ts">
	import type { Snippet } from 'svelte';

	import * as Card from '$lib/components/ui/card/index.js';

	type lightCardProps = {
		title: string;
		content: string | Snippet;
	};
	let { title, content }: lightCardProps = $props();
</script>

<div>
	<Card.Root class="not-prose h-24 border-t border-t-primary bg-primary/20 shadow-none ring-0">
		<Card.Header>
			<Card.Title class="text-xs tracking-wide text-muted-foreground">
				{title}
			</Card.Title>
		</Card.Header>
		<Card.Content class="font-mono text-xs font-light tracking-tight tabular-nums">
			{#if typeof content === 'string'}
				{content}
			{:else}
				{@render content()}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
