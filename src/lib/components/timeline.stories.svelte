<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Timeline from './timeline.svelte';

	// The ticket detail page passes the stages in order and a 1-based current step.
	const steps = ['plan', 'work', 'review', 'wrapup', 'done'];

	const { Story } = defineMeta({
		title: 'Components/Timeline',
		component: Timeline,
		args: { steps, totalSteps: steps.length },
		argTypes: {
			currentStep: { control: { type: 'range', min: 0, max: steps.length, step: 1 } }
		}
	});
</script>

<Story name="Not started" args={{ currentStep: 0 }} />

<Story name="First step" args={{ currentStep: 1 }} />

<Story name="Middle step" args={{ currentStep: 3 }} />

<Story name="Last step" args={{ currentStep: 5 }} />
