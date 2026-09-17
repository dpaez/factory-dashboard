<script lang="ts">
  import clsx from "clsx";
  import Badge from "$lib/components/ui/badge/badge.svelte";
  import type { StatusType } from "./tickets-table-columns.ts";
  let { status }: { status: StatusType } = $props();
  
  const statusClasses = clsx({
    "bg-green-500 text-white": status === "active",
    "bg-red-500 text-white": status === "blocked",
    "bg-purple-500 text-white": status === "reviewing",
    "bg-yellow-500 text-white": status === "ready_for_review",
    "bg-blue-500 text-white": status === "done" || status === "complete",
  });
</script>

<Badge variant="secondary" class={clsx("text-xs lg:text-sm font-medium capitalize lg:p-2", statusClasses)}>{status}</Badge>