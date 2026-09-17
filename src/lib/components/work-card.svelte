<script>
  import clsx from "clsx";
  import * as Card from "$lib/components/ui/card/index.js";

  let { title, value } = $props();
  let lastValue = $derived(value);
  
</script>

<Card.Root class={clsx("transition-colors duration-300 font-mono text-ellipsis overflow-hidden w-32 md:w-48  text-muted-foreground", value !== lastValue ? "bg-primary" : "bg-muted")} size="sm">
  <Card.Header>
    <Card.Title class="text-sm capitalize font-light tracking-wide">{title}</Card.Title>
  </Card.Header>
  <Card.Content class="flex justify-start items-center h-16 ">
    <p class="text-2xl lg:text-4xl font-bold text-foreground tabular-nums">{value}</p>
  </Card.Content>
</Card.Root>