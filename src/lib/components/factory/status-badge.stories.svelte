<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import StatusBadge from './status-badge.svelte';
	import {
		EXECUTION_STATUS_SIGNALS,
		TASK_STAGE_LABELS,
		TASK_STATUS_SIGNALS,
		executionStatusSignal,
		taskStatusSignal,
		type ExecutionStatus,
		type Signal,
		type TaskStage,
		type TaskStatus
	} from '$lib/factory/status';
	import {
		taskActive,
		taskBlocked,
		taskCancelled,
		taskDone,
		taskPending,
		ticketSummaries
	} from '$lib/factory/fixtures';

	const signals: Signal[] = ['run', 'wait', 'standby', 'fault', 'clear'];
	const executionStatuses = Object.keys(EXECUTION_STATUS_SIGNALS) as ExecutionStatus[];
	const taskStatuses = Object.keys(TASK_STATUS_SIGNALS) as TaskStatus[];
	const taskStages: (TaskStage | null)[] = [
		null,
		...(Object.keys(TASK_STAGE_LABELS) as TaskStage[])
	];

	const { Story } = defineMeta({
		title: 'Components/Factory/StatusBadge',
		component: StatusBadge,
		argTypes: {
			label: { control: 'text' },
			signal: { control: 'select', options: signals }
		},
		parameters: {
			// Strict for this file only: axe color-contrast fails the story in both theme panes.
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Signal pill for execution and task statuses. Loading, empty and error states: N/A: pure component. The unknown-value story covers unavailable input.'
				}
			}
		}
	});
</script>

<!-- One story per execution status. -->
<Story name="Queued" args={executionStatusSignal('queued')} />
<Story name="Active" args={executionStatusSignal('active')} />
<Story name="Waiting for user" args={executionStatusSignal('waiting_for_user')} />
<Story name="Paused" args={executionStatusSignal('paused')} />
<Story name="Resuming" args={executionStatusSignal('resuming')} />
<Story name="Resume failed" args={executionStatusSignal('resume_failed')} />
<Story name="Failed" args={executionStatusSignal('failed')} />
<Story name="Ready for handoff" args={executionStatusSignal('ready_for_handoff')} />
<Story name="Complete" args={executionStatusSignal('complete')} />
<Story name="Cancelled" args={executionStatusSignal('cancelled')} />

<Story name="Unknown value" args={executionStatusSignal('archived')} />

<!-- One story per task fixture (every task status); the matrix covers every stage. -->
<Story name="Task done" args={taskStatusSignal(taskDone.status, taskDone.stage)} />
<Story name="Task active review" args={taskStatusSignal(taskActive.status, taskActive.stage)} />
<Story name="Task pending" args={taskStatusSignal(taskPending.status, taskPending.stage)} />
<Story name="Task blocked QA" args={taskStatusSignal(taskBlocked.status, taskBlocked.stage)} />
<Story
	name="Task cancelled work"
	args={taskStatusSignal(taskCancelled.status, taskCancelled.stage)}
/>

<!-- Every task status × stage (including none); badge labels carry the stage. -->
<Story name="Task matrix" asChild>
	<div class="flex flex-col gap-2">
		{#each taskStatuses as status (status)}
			<div data-task-status={status} class="flex flex-wrap items-center gap-2">
				{#each taskStages as stage (stage)}
					<StatusBadge {...taskStatusSignal(status, stage)} />
				{/each}
			</div>
		{/each}
	</div>
</Story>

<Story name="All signals" asChild>
	<div class="flex flex-col gap-3">
		{#each signals as signal (signal)}
			<div class="flex flex-wrap items-center gap-2">
				<span class="w-16 font-mono text-xs text-foreground">{signal}</span>
				{#each executionStatuses.filter((s) => executionStatusSignal(s).signal === signal) as status (status)}
					<StatusBadge {...executionStatusSignal(status)} />
				{/each}
			</div>
		{/each}
		<div class="flex flex-wrap items-center gap-2">
			<span class="w-16 font-mono text-xs text-foreground">tickets</span>
			{#each ticketSummaries as ticket (ticket.id)}
				<StatusBadge {...executionStatusSignal(ticket.status)} />
			{/each}
		</div>
	</div>
</Story>
