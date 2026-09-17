<script lang="ts">
  import Badge from "$lib/components/ui/badge/badge.svelte";
  let { type, title }: { type: string; title: string } = $props();
</script>

<span class="inline-flex items-center gap-2">
  <Badge variant="outline" class="text-[8px] md:text-xs">{type}</Badge>
  {title}
</span>