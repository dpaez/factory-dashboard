<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TicketsTable from './tickets-table.svelte';
	import { columns } from './tickets-table-columns';
	import { toTicketRow } from '$lib/factory/adapters';
	import {
		ticketActiveInQa,
		ticketActiveInWork,
		ticketLongValues,
		ticketSummaries,
		ticketWaitingForAgentQuestion
	} from '$lib/factory/fixtures';

	// Overview rows carry each open ticket's cost; /tickets rows carry none.
	const withCost = [
		toTicketRow(ticketActiveInWork, 3.42),
		toTicketRow(ticketActiveInQa, 0.37),
		toTicketRow(ticketWaitingForAgentQuestion, 0)
	];
	const allTickets = ticketSummaries.map((ticket) => toTicketRow(ticket));

	const { Story } = defineMeta({
		title: 'Components/TicketsTable/Table',
		component: TicketsTable,
		parameters: {
			docs: {
				description: {
					component:
						'Tickets table. Each row links to /tickets/<encoded ticket key> from its display reference. A null cost renders "—".'
				}
			}
		}
	});
</script>

<Story name="Overview rows with cost" args={{ data: withCost, columns }} />

<Story name="All tickets, cost unavailable" args={{ data: allTickets, columns }} />

<Story name="Empty" args={{ data: [], columns }} />

<Story
	name="Long values"
	args={{ data: [toTicketRow(ticketLongValues, 1843.7), toTicketRow(ticketActiveInWork)], columns }}
/>
