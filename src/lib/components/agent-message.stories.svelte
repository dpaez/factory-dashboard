<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import AgentMessage from './agent-message.svelte';
	import { runHistoryInfrastructureRetry } from '$lib/factory/fixtures';

	const longContent = [
		'Task 02 is ready for review. I added a story for every baseline component and covered each state the component already supports.',
		'The execution stays in the work stage until the reviewer approves. `pnpm test` runs every story in light and dark, and the existing server tests still pass.',
		'Two a11y findings are recorded in the plan for the next ticket: color contrast on the link variant and on the destructive badge in the light theme.'
	].join(' ');

	const { Story } = defineMeta({
		title: 'Components/AgentMessage',
		component: AgentMessage
	});
</script>

<Story
	name="With timestamp"
	args={{
		agentName: 'Last Message',
		content: 'Plan approved. Starting work on task 01.',
		createdAt: '2026-10-18 14:32:05'
	}}
/>

<Story name="Without timestamp" args={{ agentName: 'Last Message', content: 'No message yet' }} />

<Story
	name="Long content"
	args={{ agentName: 'Last Message', content: longContent, createdAt: '2026-10-18 16:04:51' }}
/>

<Story
	name="With label"
	args={{
		label: 'Latest activity',
		agentName: `work · run ${runHistoryInfrastructureRetry.sequence}`,
		content: runHistoryInfrastructureRetry.activity
	}}
	play={async ({ canvasElement }) => {
		const label = canvasElement.querySelector('[data-slot="agent-message-label"]');
		await expect(label).toHaveTextContent('Latest activity');
		await expect(canvasElement).toHaveTextContent('work · run 9');
	}}
/>
