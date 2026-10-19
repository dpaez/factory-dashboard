<script lang="ts">
	import TasksTableStatusCell from '$lib/components/tasks-table-status-cell.svelte';
	import { summaryText } from '$lib/factory/format';
	import type { TaskView } from '$lib/factory/models';

	/**
	 * An execution's tasks in API order: status from the API `{status, stage}`,
	 * the blockers that are not done yet, and one line per stage summary.
	 */
	let { tasks }: { tasks: TaskView[] } = $props();
</script>

<div class="flex flex-col gap-3 font-mono text-xs font-light tabular-nums" data-testid="tasks">
	{#each tasks as task (task.id)}
		{@const open = task.blockedBy.filter((blocker) => blocker.open).map((blocker) => blocker.id)}
		<div class="flex flex-col gap-1" data-task={task.id}>
			<div class="flex items-center justify-between gap-2">
				<p class="tabular-nums">
					<span class="text-muted-foreground">{String(task.ordinal).padStart(2, '0')}.</span>
					{task.title}
				</p>
				<TasksTableStatusCell status={task.status} stage={task.stage} />
			</div>
			{#if open.length > 0}
				<p class="text-muted-foreground" data-testid="blocked-by">blocked by {open.join(', ')}</p>
			{/if}
			{#each task.summaries as summary (summary.stage)}
				<p class="text-muted-foreground" data-summary={summary.stage}>{summaryText(summary)}</p>
			{/each}
		</div>
	{:else}
		<p class="text-muted-foreground">No tasks yet.</p>
	{/each}
</div>
