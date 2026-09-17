<script lang="ts">
  let { cost }: { cost: number } = $props();
</script>

<span class="inline-flex items-center gap-2">
  <span class="text-sm font-medium tabular-nums">$ {cost.toFixed(2)} USD</span>
</span>