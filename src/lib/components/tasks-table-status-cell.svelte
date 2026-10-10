<script lang="ts">
	import clsx from 'clsx';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	// Types only — erased at runtime, so nothing from `$lib/server` reaches the
	// client bundle. The vocabulary lives in one place: the read module types.
	import type { TaskStatus as ControllerTaskStatus } from '$lib/server/types';

	/**
	 * The v2 task status vocabulary (`tasks.status`, state schema 2) plus
	 * `unknown` for a session whose task is missing. The legacy `in_progress`
	 * value is gone; `working` replaced it.
	 */
	export type TaskStatus = ControllerTaskStatus | 'unknown';

	let { status }: { status: TaskStatus } = $props();

	// Every value in the vocabulary gets a deliberate class; nothing falls
	// through to an unstyled badge. Grouping mirrors the execution-status cell:
	// run = working; wait = ready_for_review/reviewing; clear = done;
	// fault = blocked; muted = pending/cancelled/unknown.
	const statusClasses = $derived(
		clsx({
			'bg-gray-400 text-white': status === 'pending',
			'bg-green-500 text-white': status === 'working',
			'bg-yellow-500 text-white': status === 'ready_for_review',
			'bg-amber-500 text-white': status === 'reviewing',
			'bg-blue-500 text-white': status === 'done',
			'bg-rose-500 text-white': status === 'blocked',
			'bg-gray-500 text-white': status === 'cancelled' || status === 'unknown'
		})
	);

	const statusLabels: Record<TaskStatus, string> = {
		pending: 'Pending',
		working: 'Working',
		ready_for_review: 'Ready for review',
		reviewing: 'Reviewing',
		done: 'Done',
		blocked: 'Blocked',
		cancelled: 'Cancelled',
		unknown: 'Unknown'
	};
</script>

<Badge variant="secondary" class={clsx('text-xs font-medium lg:p-2 lg:text-sm', statusClasses)}
	>{statusLabels[status]}</Badge
>
