<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import MeasurementNotes from './measurement-notes.svelte';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	const { Story } = defineMeta({
		title: 'Components/Factory/Stats/MeasurementNotes',
		component: MeasurementNotes,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'How the stats figures are measured: cohort inclusion, the merge-rate definition, zero vs Unavailable vs no runs, derived stage tokens, missing usage, token categories, and the definitions version.'
				}
			}
		}
	});
</script>

<Story
	name="Default"
	args={{ definitions: 'stats.v1' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const details = pane.querySelector('[data-slot="measurement-notes"]') as HTMLDetailsElement;
		await expect(details.open).toBe(false);
		await userEvent.click(within(pane).getByText('Measurement notes'));
		await expect(details.open).toBe(true);
		const note = (name: string) => details.querySelector(`[data-note="${name}"]`);
		await expect(note('cohort')).toHaveTextContent('(inclusive)');
		await expect(note('cohort')).toHaveTextContent('(exclusive)');
		await expect(note('merge-rate')).toHaveTextContent(
			'Merged over merged, abandoned, and cancelled. Open and unknown outcomes are left out.'
		);
		await expect(note('unavailable')).toHaveTextContent('No runs in this cohort');
		await expect(note('stage-tokens')).toHaveTextContent(
			'tokens per accepted output × accepted outputs'
		);
		await expect(note('missing-usage')).toHaveTextContent('as 0 tokens');
		await expect(note('categories')).toHaveTextContent('geut/factory-skills#62');
		await expect(note('definitions')).toHaveTextContent('Definitions: stats.v1');
	}}
/>
