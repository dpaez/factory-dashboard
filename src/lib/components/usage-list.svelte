<script lang="ts">
  import * as Table from "$lib/components/ui/table/index.js";
  import TasksTableStatusCell, { type TaskStatus } from "$lib/components/tasks-table-status-cell.svelte";
  import { MoveUp as ArrowUpIcon, MoveDown as ArrowDownIcon } from "@lucide/svelte";

  type TaskUsage = {
    id: string;
    stage: string;
    task: string;
    model: string;
    usage: {
      input: number;
      output: number;
      cacheRead?: number;
      cacheWrite?: number;
    };
    status: TaskStatus;
  }
  const { tasks }: { tasks: TaskUsage[] } = $props();
</script>
 
<Table.Root class="font-mono text-sm!">
  <Table.Header>
    <Table.Row>
      <Table.Head class="w-[100px]">Stage</Table.Head>
      <Table.Head>Task</Table.Head>
      <Table.Head>Model</Table.Head>
      <Table.Head>Usage</Table.Head>
      <Table.Head class="text-end">Status</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body >
  {#each tasks as task (task.id)}
    <Table.Row >
    <Table.Cell class="font-medium">{task.stage}</Table.Cell>
    <Table.Cell>{task.task}</Table.Cell>
    <Table.Cell>{task.model}</Table.Cell>
    <Table.Cell class="flex items-center gap-1 tabular-nums">
      <ArrowUpIcon class='text-muted-foreground size-4' alt="Input tokens" /> {task.usage.input} 
      <ArrowDownIcon class='text-muted-foreground size-4' alt="Output tokens" /> {task.usage.output} 
      <span class="text-muted-foreground mr-1 font-mono" aria-label="Cache read tokens">R</span> {task.usage.cacheRead} 
      <span class="text-muted-foreground mr-1 font-mono" aria-label="Cache write tokens">W</span> {task.usage.cacheWrite}
    </Table.Cell>
    <Table.Cell class="text-end"><TasksTableStatusCell status={task.status} /></Table.Cell>
    </Table.Row>
  {/each}
  </Table.Body>
</Table.Root>