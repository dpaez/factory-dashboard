<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TicketExecutions from './ticket-executions.svelte';
	import { toExecutions } from '$lib/factory/adapters';
	import { executionList, ticketMultiExecution } from '$lib/factory/fixtures';

	const ticketKey = ticketMultiExecution.key;

	const { Story } = defineMeta({
		title: 'Components/TicketDetail/Executions',
		component: TicketExecutions,
		parameters: {
			docs: {
				description: {
					component:
						'Executions of a ticket, oldest first, with the current marker and links to each read-only view. Loading and error states: N/A: the page loads the data.'
				}
			}
		}
	});
</script>

<Story
	name="Current execution shown"
	args={{ ticketKey, executions: toExecutions(executionList, 2) }}
/>

<Story
	name="Past execution shown"
	args={{ ticketKey, executions: toExecutions(executionList, 1) }}
/>

<Story name="No executions" args={{ ticketKey, executions: [] }} />
