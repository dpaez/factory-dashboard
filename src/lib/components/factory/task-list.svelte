<script lang="ts">
	import TasksTableStatusCell from '$lib/components/tasks-table-status-cell.svelte';
	import { summaryText } from '$lib/factory/format';
	import type { Stage, TaskBlocker, TaskView } from '$lib/factory/models';

	/**
	 * An execution's tasks in API order: ordinal, title and the status · stage
	 * badge, the blockers as in-page links that move focus to the blocking
	 * task's row (open ones apart from done ones), and one line per review and
	 * QA summary. With no tasks it shows the planning state at stage `plan`.
	 */
	let { tasks, stage }: { tasks: TaskView[]; stage: Stage } = $props();

	const uid = $props.id();
	const rowId = (id: string) => `${uid}-task-${id}`;
	const ids = $derived(new Set(tasks.map((task) => task.id)));

	function focusTask(id: string) {
		document.getElementById(rowId(id))?.focus();
	}

	const BLOCKER =
		'font-mono tabular-nums underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/30';
</script>

{#snippet blocker(item: TaskBlocker)}
	{#if ids.has(item.id)}
		<button
			type="button"
			class="{BLOCKER} {item.open ? 'text-foreground' : 'text-foreground/75 decoration-dotted'}"
			data-blocker={item.id}
			data-open={item.open}
			title="Go to task {item.id}"
			onclick={() => focusTask(item.id)}>{item.id}</button
		>
	{:else}
		<span class="font-mono tabular-nums" data-blocker={item.id} data-open={item.open}
			>{item.id}</span
		>
	{/if}
{/snippet}

<ol class="flex flex-col gap-3 font-mono text-xs font-light tabular-nums" data-testid="tasks">
	{#each tasks as task (task.id)}
		{@const open = task.blockedBy.filter((item) => item.open)}
		{@const done = task.blockedBy.filter((item) => !item.open)}
		<li
			id={rowId(task.id)}
			tabindex="-1"
			class="flex flex-col gap-1 outline-none focus:ring-2 focus:ring-ring/30 focus-visible:ring-2 focus-visible:ring-ring/30"
			data-task={task.id}
		>
			<div class="flex items-center justify-between gap-2">
				<p class="tabular-nums">
					<span class="text-foreground/75">{String(task.ordinal).padStart(2, '0')}.</span>
					{task.title}
				</p>
				<TasksTableStatusCell status={task.status} stage={task.stage} />
			</div>
			{#if open.length > 0}
				<p class="text-foreground" data-testid="blocked-by">
					blocked by {#each open as item, index (item.id)}{#if index > 0},
						{/if}{@render blocker(item)}{/each}
				</p>
			{/if}
			{#if done.length > 0}
				<p class="text-foreground/75" data-testid="blocked-by-done">
					after {#each done as item, index (item.id)}{#if index > 0},
						{/if}{@render blocker(item)}{/each} (done)
				</p>
			{/if}
			{#each task.summaries as summary (summary.stage)}
				<p class="text-foreground/75" data-summary={summary.stage}>{summaryText(summary)}</p>
			{/each}
		</li>
	{:else}
		<li class="text-foreground/75" data-testid="tasks-empty">
			{stage === 'plan'
				? 'Planning — tasks appear when the plan is ready.'
				: 'No tasks recorded for this execution.'}
		</li>
	{/each}
</ol>
