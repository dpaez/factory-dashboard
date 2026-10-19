<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TicketsTableStatusCell from './tickets-table-status-cell.svelte';
	import type { TicketStatus } from './tickets-table-columns.ts';

	const statuses: (TicketStatus | 'unknown')[] = [
		'queued',
		'active',
		'waiting_for_user',
		'paused',
		'resuming',
		'resume_failed',
		'failed',
		'ready_for_handoff',
		'complete',
		'cancelled',
		'unknown'
	];

	const { Story } = defineMeta({
		title: 'Components/TicketsTable/StatusCell',
		component: TicketsTableStatusCell,
		argTypes: { status: { control: 'select', options: statuses } }
	});
</script>

<Story name="Queued" args={{ status: 'queued' }} />
<Story name="Active" args={{ status: 'active' }} />
<Story name="Waiting for user" args={{ status: 'waiting_for_user' }} />
<Story name="Paused" args={{ status: 'paused' }} />
<Story name="Resuming" args={{ status: 'resuming' }} />
<Story name="Resume failed" args={{ status: 'resume_failed' }} />
<Story name="Failed" args={{ status: 'failed' }} />
<Story name="Ready for handoff" args={{ status: 'ready_for_handoff' }} />
<Story name="Complete" args={{ status: 'complete' }} />
<Story name="Cancelled" args={{ status: 'cancelled' }} />
<Story name="Unknown" args={{ status: 'unknown' }} />

<Story name="All statuses" asChild>
	<div class="flex flex-wrap items-center gap-2">
		{#each statuses as status (status)}
			<TicketsTableStatusCell {status} />
		{/each}
	</div>
</Story>
