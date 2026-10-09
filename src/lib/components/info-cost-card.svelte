<script lang="ts">
	type InfoCostCardProps = {
		title: string;
		value: number;
		tokensInputUsage: number;
		tokensOutputUsage: number;
		tokensCacheRead: number;
		tokensCacheWrite: number;
	};
	import * as Card from '$lib/components/ui/card/index.js';
	import { MoveUp as ArrowUpIcon, MoveDown as ArrowDownIcon } from '@lucide/svelte';

	let {
		title,
		value,
		tokensInputUsage,
		tokensOutputUsage,
		tokensCacheRead,
		tokensCacheWrite
	}: InfoCostCardProps = $props();
</script>

<Card.Root
	class="w-64 overflow-hidden font-mono text-ellipsis text-muted-foreground md:w-56 lg:w-64"
	size="sm"
>
	<Card.Header>
		<Card.Title class="text-sm font-light tracking-wide capitalize">{title}</Card.Title>
	</Card.Header>
	<Card.Content class="flex h-24 items-center justify-start ">
		<p class="text-4xl font-bold text-foreground tabular-nums lg:text-5xl">${value.toFixed(2)}</p>
	</Card.Content>
	<Card.Footer class="not-prose flex flex-col items-start gap-1">
		<h4 class="text-xs font-light">Tokens</h4>
		<div class=" grid grid-cols-2 gap-1">
			<span class="text-xs font-extralight tabular-nums"
				><ArrowUpIcon class="mr-1 inline-block size-4" /> {tokensInputUsage}</span
			>
			<span class="text-xs font-extralight tabular-nums"
				><ArrowDownIcon class="mr-1 inline-block size-4" /> {tokensOutputUsage}</span
			>
			<span class="text-xs font-extralight tabular-nums"
				><span class="mr-1 inline-block size-4 text-center font-bold">R</span>
				{tokensCacheRead}</span
			>
			<span class="text-xs font-extralight tabular-nums"
				><span class="mr-1 inline-block size-4 text-center font-bold">W</span>
				{tokensCacheWrite}</span
			>
		</div>
	</Card.Footer>
</Card.Root>
