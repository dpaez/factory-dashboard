<script>
  import * as Card from "$lib/components/ui/card/index.js";

  let { title, value, subtitle } = $props();
  
</script>

<Card.Root class="font-mono text-ellipsis overflow-hidden w-72 md:w-56 lg:w-64 text-muted-foreground" size="sm">
  <Card.Header>
    <Card.Title class="text-sm capitalize font-light tracking-wide">{title}</Card.Title>
  </Card.Header>
  <Card.Content class="flex justify-start items-center h-24 ">
    <p class="text-4xl lg:text-5xl font-bold bg-transparent text-foreground tabular-nums">{value}</p>
  </Card.Content>
  <Card.Footer class="items-start text-xs font-extralight tabular-nums">
    {subtitle}
  </Card.Footer>
</Card.Root>