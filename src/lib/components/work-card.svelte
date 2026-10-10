<script>
	import clsx from 'clsx';
	import * as Card from '$lib/components/ui/card/index.js';

	let { title, value } = $props();
	let lastValue = $derived(value);
</script>

<Card.Root
	class={clsx(
		'w-32 overflow-hidden font-mono text-ellipsis text-muted-foreground transition-colors duration-300  md:w-48',
		value !== lastValue ? 'bg-primary' : 'bg-muted'
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
