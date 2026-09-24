<script lang="ts">
	import type { Snippet } from 'svelte';

	import * as Card from "$lib/components/ui/card/index.js";

  type lightCardProps = {
    title: string;
    content: string | Snippet; 
  }
  let { title, content }: lightCardProps = $props();

</script>
<div>
  <Card.Root class="ring-0 bg-primary/20 h-24 shadow-none border-t border-t-primary not-prose">
    <Card.Header>
      <Card.Title class="text-xs text-muted-foreground tracking-wide">
        {title}
      </Card.Title>
    </Card.Header>
    <Card.Content class="text-xs font-light tracking-tight tabular-nums font-mono">
      {#if typeof content === 'string'}
        {content}
      {:else}
        {@render content()}
      {/if}
    </Card.Content>
  </Card.Root>
</div>