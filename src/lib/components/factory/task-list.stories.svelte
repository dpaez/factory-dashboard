<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent } from 'storybook/test';
	import TaskList from './task-list.svelte';
	import { toTasks } from '$lib/factory/adapters';
	import type { components } from '$lib/factory/generated/factory-api';
	import { tasksOfEveryStatus, taskPending, ticketDetailActiveInQa } from '$lib/factory/fixtures';

	type Task = components['schemas']['Task'];

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	/** A task blocked by one not in this execution: shown as plain text. */
	const blockedByMissing = [
		...tasksOfEveryStatus,
		{
			...taskPending,
			id: '06',
			ordinal: 6,
			blockedBy: ['99'],
			title: 'Waits on a task from another plan'
		}
	] satisfies Task[];

	const { Story } = defineMeta({
		title: 'Components/Factory/TaskList',
		component: TaskList,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'The tasks of one execution: ordinal, title, the status · stage badge, blockers as in-page links that move focus to the blocking task (open blockers apart from done ones; one not in the list is plain text), and the review and QA summaries. With no tasks it shows the planning state at stage plan, else "No tasks recorded for this execution."'
				}
			}
		}
	});
</script>

<Story
	name="Every task status"
	args={{ tasks: toTasks(tasksOfEveryStatus), stage: 'work' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const badges = [...pane.querySelectorAll('[data-task] [data-slot="status-badge"]')];
		await expect(badges.map((badge) => badge.textContent?.trim())).toEqual([
			'Done',
			'Active · review',
			'Pending',
			'Blocked · QA',
			'Cancelled · work'
		]);
	}}
/>

<Story
	name="Blockers"
	args={{ tasks: toTasks(ticketDetailActiveInQa.tasks), stage: 'qa' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const row = (id: string) => pane.querySelector<HTMLElement>(`[data-task="${id}"]`)!;
		await expect(row('03').querySelector('[data-testid="blocked-by"]')).toHaveTextContent(
			'blocked by 02'
		);
		await expect(row('02').querySelector('[data-testid="blocked-by"]')).toBeNull();
		await expect(row('01').querySelector('[data-summary="review"]')).toHaveTextContent(
			'review round 2 · approve · findings 2 · blocking 0'
		);
		await expect(row('01').querySelector('[data-summary="qa"]')).toHaveTextContent(
			'QA round 1 · passed · tested 4 · gaps 1'
		);

		// An open blocker and a done one are styled apart.
		const open = row('03').querySelector<HTMLButtonElement>('[data-blocker="02"]')!;
		const done = row('03').querySelector<HTMLButtonElement>('[data-blocker="01"]')!;
		await expect(open).toHaveAttribute('data-open', 'true');
		await expect(done).toHaveAttribute('data-open', 'false');
		await expect(open.className).not.toBe(done.className);

		// Activating a blocker moves focus to that task's row.
		await userEvent.click(open);
		await expect(row('02')).toHaveFocus();
		done.focus();
		await userEvent.keyboard('{Enter}');
		await expect(row('01')).toHaveFocus();
	}}
/>

<Story
	name="Blocker not in this execution"
	args={{ tasks: toTasks(blockedByMissing), stage: 'work' }}
	play={async ({ canvasElement }) => {
		const missing = firstPane(canvasElement).querySelector('[data-task="06"] [data-blocker="99"]')!;
		await expect(missing.tagName).toBe('SPAN');
		await expect(missing).toHaveTextContent('99');
	}}
/>

<Story
	name="Planning"
	args={{ tasks: [], stage: 'plan' }}
	play={async ({ canvasElement }) => {
		await expect(firstPane(canvasElement)).toHaveTextContent(
			'Planning — tasks appear when the plan is ready.'
		);
	}}
/>

<Story
	name="No tasks after plan"
	args={{ tasks: [], stage: 'work' }}
	play={async ({ canvasElement }) => {
		await expect(firstPane(canvasElement)).toHaveTextContent(
			'No tasks recorded for this execution.'
		);
	}}
/>
