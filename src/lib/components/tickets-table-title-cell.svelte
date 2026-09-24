<script lang="ts">
  import Badge from "$lib/components/ui/badge/badge.svelte";
  let { type, title }: { type: string | null; title: string | null } = $props();
</script>

<span class="inline-flex items-center gap-2">
  {#if type}
    <Badge variant="outline" class="text-[8px] md:text-xs">{type}</Badge>
  {/if}
  {title ?? "—"}
</span>
