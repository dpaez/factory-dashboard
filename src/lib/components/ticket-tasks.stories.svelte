<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TicketTasks from './ticket-tasks.svelte';
	import { toTasks } from '$lib/factory/adapters';
	import { tasksOfEveryStatus, ticketDetailActiveInQa } from '$lib/factory/fixtures';

	const { Story } = defineMeta({
		title: 'Components/TicketDetail/Tasks',
		component: TicketTasks,
		parameters: {
			docs: {
				description: {
					component:
						'Tasks of one execution: API task status, open blockers, and review/QA summaries. Loading and error states: N/A: the page loads the data.'
				}
			}
		}
	});
</script>

<Story name="QA ticket with summaries" args={{ tasks: toTasks(ticketDetailActiveInQa.tasks) }} />

<Story name="Every task status" args={{ tasks: toTasks(tasksOfEveryStatus) }} />

<Story name="No tasks" args={{ tasks: [] }} />
