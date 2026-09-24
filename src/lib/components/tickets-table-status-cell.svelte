<script lang="ts">
  import clsx from "clsx";
  import Badge from "$lib/components/ui/badge/badge.svelte";
  import type { TicketStatus } from "./tickets-table-columns.ts";
  let { status }: { status: TicketStatus | 'unknown' } = $props();

  const statusClasses = $derived(clsx({
    "bg-green-500 text-white": status === "active",
    "bg-amber-500 text-white": status === "waiting_for_user",
    "bg-red-500 text-white": status === "blocked" || status === "failed",
    "bg-blue-500 text-white": status === "complete",
    "bg-gray-500 text-white": status === "unknown",
  }));
</script>

<Badge variant="secondary" class={clsx("text-xs lg:text-sm font-medium capitalize lg:p-2", statusClasses)}>{status.replaceAll("_", " ")}</Badge>
