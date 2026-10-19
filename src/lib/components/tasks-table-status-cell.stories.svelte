<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TasksTableStatusCell from './tasks-table-status-cell.svelte';
	import {
		taskActive,
		taskBlocked,
		taskCancelled,
		taskDone,
		taskPending,
		tasksOfEveryStatus
	} from '$lib/factory/fixtures';

	const statuses = ['pending', 'active', 'done', 'blocked', 'cancelled'];
	const stages = [null, 'plan', 'work', 'qa', 'review', 'wrapup'];
	const { Story } = defineMeta({
		title: 'Components/TasksTable/StatusCell',
		component: TasksTableStatusCell,
		argTypes: {
			status: { control: 'select', options: statuses },
			stage: { control: 'select', options: stages }
		},
		parameters: {
			// Strict for this file only: axe color-contrast fails the story in both theme panes.
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Task status cell (API status + stage); delegates to StatusBadge. Loading, empty and error states: N/A: pure component.'
				}
			}
		}
	});
</script>

<Story name="Done" args={{ status: taskDone.status, stage: taskDone.stage }} />
<Story name="Active review" args={{ status: taskActive.status, stage: taskActive.stage }} />
<Story name="Pending" args={{ status: taskPending.status, stage: taskPending.stage }} />
<Story name="Blocked QA" args={{ status: taskBlocked.status, stage: taskBlocked.stage }} />
<Story name="Cancelled work" args={{ status: taskCancelled.status, stage: taskCancelled.stage }} />
<Story name="Unknown value" args={{ status: 'archived', stage: null }} />

<Story name="Every fixture" asChild>
	<div class="flex flex-wrap items-center gap-2">
		{#each tasksOfEveryStatus as task (task.id)}
			<TasksTableStatusCell status={task.status} stage={task.stage} />
		{/each}
	</div>
</Story>
