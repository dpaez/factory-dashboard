<script lang="ts">
	import StatusBadge from '$lib/components/factory/status-badge.svelte';
	import { executionStatusSignal } from '$lib/factory/status';
	import type { TicketStatus } from './tickets-table-columns.ts';

	/** Unknown strings render as a Standby badge with the raw value, for API drift. */
	let { status }: { status: TicketStatus | (string & {}) } = $props();

	const badge = $derived(executionStatusSignal(status));
</script>

<StatusBadge {...badge} />
