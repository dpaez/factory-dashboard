<script lang="ts">
  type InfoCostCardProps = {
    title: string;
    value: number;
    tokensInputUsage: number;
    tokensOutputUsage: number;
    tokensCacheRead: number;
    tokensCacheWrite: number;
  };
  import * as Card from "$lib/components/ui/card/index.js";
  import { MoveUp as ArrowUpIcon, MoveDown as ArrowDownIcon } from '@lucide/svelte';

  let { title, value, tokensInputUsage, tokensOutputUsage, tokensCacheRead, tokensCacheWrite }: InfoCostCardProps = $props();
</script>

<Card.Root class="font-mono text-ellipsis overflow-hidden w-72 md:w-56 lg:w-64 text-muted-foreground" size="sm">
  <Card.Header>
    <Card.Title class="text-sm capitalize font-light tracking-wide">{title}</Card.Title>
  </Card.Header>
  <Card.Content class="flex justify-start items-center h-24 ">
    <p class="text-4xl lg:text-5xl font-bold bg-transparent text-foreground tabular-nums">{value.toFixed(2)}</p>
  </Card.Content>
  <Card.Footer class="not-prose items-start flex flex-col gap-1">
    <h4 class="text-xs font-light">Tokens</h4>
    <div class=" grid grid-cols-2 gap-1">
      <span class="text-xs font-extralight tabular-nums"><ArrowUpIcon class="size-4 inline-block mr-1" /> {tokensInputUsage}</span>
      <span class="text-xs font-extralight tabular-nums"><ArrowDownIcon class="size-4 inline-block mr-1" /> {tokensOutputUsage}</span>
      <span class="text-xs font-extralight tabular-nums"><span class="size-4 text-center font-bold inline-block mr-1">R</span> {tokensCacheRead}</span>
      <span class="text-xs font-extralight tabular-nums"><span class="size-4 text-center font-bold inline-block mr-1">W</span> {tokensCacheWrite}</span>
    </div>
  </Card.Footer>
</Card.Root>