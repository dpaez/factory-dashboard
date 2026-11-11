<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
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

<!-- The first render shows the step as is: no fill animating up from the start. -->
<Story
	name="Middle step"
	args={{ currentStep: 3 }}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('[role="progressbar"]')).toHaveAttribute(
			'aria-valuenow',
			'60'
		);
	}}
/>

<Story name="Last step" args={{ currentStep: 5 }} />
