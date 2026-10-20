<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import TaskProgress from './task-progress.svelte';
	import {
		ticketActiveInPlan,
		ticketActiveInWork,
		ticketReadyForHandoff
	} from '$lib/factory/fixtures';

	const { Story } = defineMeta({
		title: 'Components/Factory/TaskProgress',
		component: TaskProgress,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Approved tasks over planned tasks. Without a denominator there is no bar: "Planning tasks" in plan, "No tasks" elsewhere.'
				}
			}
		}
	});
</script>

<Story
	name="In progress"
	args={{ progress: ticketActiveInWork.progress, stage: ticketActiveInWork.stage }}
	play={async ({ canvasElement }) => {
		await expect(canvasElement).toHaveTextContent('2/5 approved');
		await expect(canvasElement.querySelector('[data-slot="progress"]')).not.toBeNull();
	}}
/>

<Story
	name="All approved"
	args={{ progress: ticketReadyForHandoff.progress, stage: ticketReadyForHandoff.stage }}
/>

<Story
	name="Planning tasks"
	args={{ progress: ticketActiveInPlan.progress, stage: ticketActiveInPlan.stage }}
	play={async ({ canvasElement }) => {
		await expect(canvasElement).toHaveTextContent('Planning tasks');
		await expect(canvasElement).not.toHaveTextContent('0/0');
		await expect(canvasElement.querySelector('[data-slot="progress"]')).toBeNull();
	}}
/>

<Story name="No tasks outside plan" args={{ progress: { done: 0, total: 0 }, stage: 'work' }} />
