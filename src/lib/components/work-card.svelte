<script lang="ts">
	import clsx from 'clsx';
	import * as Card from '$lib/components/ui/card/index.js';
	import { CountFlash } from '$lib/components/factory/count-flash.svelte';

	let { title, value }: { title: string; value: number } = $props();
	const flash = new CountFlash(() => value);
</script>

<Card.Root
	data-flash={flash.active ? 'on' : undefined}
	class={clsx(
		'w-32 overflow-hidden font-mono text-ellipsis text-muted-foreground transition-colors duration-300 md:w-48',
		flash.active ? 'bg-primary' : 'bg-muted'
	)}
	size="sm"
>
	<Card.Header>
		<Card.Title class="text-sm font-light tracking-wide capitalize">{title}</Card.Title>
	</Card.Header>
	<Card.Content class="flex h-16 items-center justify-start ">
		<p class="text-2xl font-bold text-foreground tabular-nums lg:text-4xl">{value}</p>
	</Card.Content>
</Card.Root>
