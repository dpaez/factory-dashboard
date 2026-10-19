<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import WorkCard from './work-card.svelte';

	const { Story } = defineMeta({
		title: 'Components/WorkCard',
		component: WorkCard,
		argTypes: {
			title: { control: 'text' },
			value: { control: 'number' }
		}
	});
</script>

<Story name="Plan stage" args={{ title: 'Plan', value: 3 }} />

<Story name="Empty stage" args={{ title: 'Review', value: 0 }} />

<Story name="All stages" asChild>
	<div class="flex flex-wrap gap-4">
		<WorkCard title="Plan" value={3} />
		<WorkCard title="Work" value={5} />
		<WorkCard title="QA" value={2} />
		<WorkCard title="Review" value={1} />
		<WorkCard title="Wrap-up" value={0} />
	</div>
</Story>
