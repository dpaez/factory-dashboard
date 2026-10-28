<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
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

	/** Every badge in every theme pane. */
	const badges = (canvasElement: HTMLElement) => [
		...canvasElement.querySelectorAll<HTMLElement>('[data-slot="status-badge"]')
	];

	/** Each pane shows one badge with this label and tone. */
	const shows =
		(label: string, signal: Signal) =>
		async ({ canvasElement }: { canvasElement: HTMLElement }) => {
			const all = badges(canvasElement);
			await expect(all).toHaveLength(2);
			for (const badge of all) {
				await expect(badge).toHaveTextContent(label);
				await expect(badge).toHaveAttribute('data-signal', signal);
			}
		};

	/** Lightness of a computed colour: oklch L, else the relative luminance of rgb. */
	const lightness = (color: string) => {
		const ok = color.match(/^oklch\(([\d.]+)(%?)/);
		if (ok) return Number(ok[1]) / (ok[2] ? 100 : 1);
		const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number);
		return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	};

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
<Story name="Queued" args={executionStatusSignal('queued')} play={shows('Queued', 'wait')} />
<Story name="Active" args={executionStatusSignal('active')} play={shows('Active', 'run')} />
<Story
	name="Waiting for user"
	args={executionStatusSignal('waiting_for_user')}
	play={shows('Waiting for user', 'wait')}
/>
<Story name="Paused" args={executionStatusSignal('paused')} play={shows('Paused', 'standby')} />
<Story name="Resuming" args={executionStatusSignal('resuming')} play={shows('Resuming', 'run')} />
<Story
	name="Resume failed"
	args={executionStatusSignal('resume_failed')}
	play={shows('Resume failed', 'fault')}
/>
<Story name="Failed" args={executionStatusSignal('failed')} play={shows('Failed', 'fault')} />
<Story
	name="Ready for handoff"
	args={executionStatusSignal('ready_for_handoff')}
	play={shows('Ready for handoff', 'wait')}
/>
<Story name="Complete" args={executionStatusSignal('complete')} play={shows('Complete', 'clear')} />
<Story
	name="Cancelled"
	args={executionStatusSignal('cancelled')}
	play={shows('Cancelled', 'standby')}
/>

<!-- An unknown status keeps its raw value, toned Standby. -->
<Story
	name="Unknown value"
	args={executionStatusSignal('archived')}
	play={shows('archived', 'standby')}
/>

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
<Story
	name="Task matrix"
	asChild
	play={async ({ canvasElement }) => {
		const pane = canvasElement.querySelector<HTMLElement>('[data-theme-pane]') ?? canvasElement;
		const statuses = ['Pending', 'Active', 'Blocked', 'Done', 'Cancelled'];
		const stages = ['plan', 'work', 'QA', 'review', 'wrapup'];
		const expected = statuses.flatMap((s) => [s, ...stages.map((st) => `${s} · ${st}`)]);
		await expect(badges(pane).map((badge) => badge.textContent?.trim())).toEqual(expected);
	}}
>
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

<!-- DESIGN.md signal strip: each badge takes its colours from its theme's --signal-* tokens,
     with Two-Ink text (ink on run, wait and standby; paper white on fault and clear). -->
<Story
	name="All signals"
	asChild
	play={async ({ canvasElement }) => {
		const panes = [...canvasElement.querySelectorAll<HTMLElement>('[data-theme-pane]')];
		await expect(panes).toHaveLength(2);
		const backgrounds: string[] = [];
		for (const pane of panes) {
			const found = new Set<string>();
			for (const badge of badges(pane)) {
				const signal = badge.dataset.signal!;
				found.add(signal);
				// Resolve the token where the badge is, as the browser resolves the badge itself.
				const probe = document.createElement('span');
				probe.style.backgroundColor = `var(--signal-${signal})`;
				probe.style.color = `var(--signal-${signal}-foreground)`;
				badge.parentElement!.append(probe);
				const want = getComputedStyle(probe);
				const got = getComputedStyle(badge);
				await expect(got.backgroundColor).toBe(want.backgroundColor);
				await expect(got.color).toBe(want.color);
				probe.remove();
				const ink = lightness(got.color);
				if (['run', 'wait', 'standby'].includes(signal)) await expect(ink).toBeLessThan(0.3);
				else await expect(ink).toBeGreaterThan(0.9);
				if (signal === 'run') backgrounds.push(got.backgroundColor);
			}
			await expect(found).toEqual(new Set(signals));
		}
		// Light and dark tokens differ, so each pane used its own theme's token.
		await expect(new Set(backgrounds).size).toBe(2);
	}}
>
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
