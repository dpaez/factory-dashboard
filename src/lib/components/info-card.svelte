<script>
	import * as Card from '$lib/components/ui/card/index.js';

	let { title, value, subtitle } = $props();
</script>

<Card.Root
	class="w-64 overflow-hidden font-mono text-ellipsis text-muted-foreground md:w-56 lg:w-64"
	size="sm"
>
	<Card.Header>
		<Card.Title class="text-sm font-light tracking-wide capitalize">{title}</Card.Title>
	</Card.Header>
	<Card.Content class="flex h-24 items-center justify-start ">
		<p class="bg-transparent text-4xl font-bold text-foreground tabular-nums lg:text-5xl">
			{value}
		</p>
	</Card.Content>
	<Card.Footer class="items-start text-xs font-extralight tabular-nums">
		{subtitle}
	</Card.Footer>
</Card.Root>
