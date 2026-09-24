<script lang="ts">
  import clsx from "clsx";
  import Badge from "$lib/components/ui/badge/badge.svelte";
  export type TaskStatus = 'pending' | 'in_progress' | 'ready_for_review' | 'done' | 'blocked' | 'unknown';
  let { status }: { status: TaskStatus } = $props();

  const statusClasses = $derived(clsx({
    "bg-emerald-500 text-white": status === "pending",
    "bg-amber-500 text-white": status === "in_progress",
    "bg-rose-500 text-white": status === "blocked",
    "bg-yellow-500 text-white": status === "ready_for_review",
    "bg-blue-500 text-white": status === "done",
    "bg-gray-500 text-white": status === "unknown",
  }));
</script>

<Badge variant="secondary" class={clsx("text-xs lg:text-sm font-medium capitalize lg:p-2", statusClasses)}>{status.replaceAll("_", " ")}</Badge>
