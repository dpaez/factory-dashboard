<script lang="ts">
	import clsx from 'clsx';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import type { TicketStatus } from './tickets-table-columns.ts';
	let { status }: { status: TicketStatus | 'unknown' } = $props();

	// Every one of the ten v2 execution statuses has a deliberate class;
	// nothing falls through to an unstyled badge. Grouping follows the task:
	// run = active/resuming; wait = waiting_for_user/queued/ready_for_handoff;
	// standby = paused; fault = failed/resume_failed; clear = complete;
	// muted = cancelled (and the defensive `unknown`).
	const statusClasses = $derived(
		clsx({
			'bg-green-500 text-white': status === 'active' || status === 'resuming',
			'bg-amber-500 text-white':
				status === 'waiting_for_user' || status === 'queued' || status === 'ready_for_handoff',
			'bg-gray-400 text-white': status === 'paused',
			'bg-red-500 text-white': status === 'failed' || status === 'resume_failed',
			'bg-blue-500 text-white': status === 'complete',
			'bg-gray-500 text-white': status === 'cancelled' || status === 'unknown'
		})
	);

	const statusLabels: Record<TicketStatus | 'unknown', string> = {
		queued: 'Queued',
		active: 'Active',
		waiting_for_user: 'Waiting for user',
		paused: 'Paused',
		resuming: 'Resuming',
		resume_failed: 'Resume failed',
		failed: 'Failed',
		ready_for_handoff: 'Ready for handoff',
		complete: 'Complete',
		cancelled: 'Cancelled',
		unknown: 'Unknown'
	};
</script>

<Badge variant="secondary" class={clsx('text-xs font-medium lg:p-2 lg:text-sm', statusClasses)}
	>{statusLabels[status]}</Badge
>
