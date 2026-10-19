<script lang="ts">
	import StatusBadge from '$lib/components/factory/status-badge.svelte';
	import { taskStatusSignal } from '$lib/factory/status';
	import type { components } from '$lib/factory/generated/factory-api';

	type Task = components['schemas']['Task'];

	/** Unknown strings render as a Standby badge with the raw value, for API drift. */
	let { status, stage = null }: { status: Task['status'] | (string & {}); stage?: Task['stage'] } =
		$props();

	const badge = $derived(taskStatusSignal(status, stage));
</script>

<StatusBadge {...badge} />
