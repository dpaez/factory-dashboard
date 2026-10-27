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
						'How the stats figures are measured: cohort inclusion, the merge-rate definition, zero vs Unavailable vs no runs, derived stage tokens, missing usage, token categories, the efficiency signals and no-returns definitions, export completeness, and the definitions version.'
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
		await expect(note('start-to-handoff')).toHaveTextContent('Not time to merge');
		await expect(note('p90')).toHaveTextContent('nearest-rank');
		await expect(note('p90')).toHaveTextContent('ceil(0.9 × n)');
		await expect(note('eligible-sample')).toHaveTextContent('the executions that reached handoff');
		await expect(note('waiting')).toHaveTextContent('waiting after handoff');
		await expect(note('stage-time')).toHaveTextContent('excluding waiting');
		await expect(note('stage-time')).toHaveTextContent('every visit and return');
		await expect(note('overhead')).toHaveTextContent('Overhead = stage time − agent time');
		await expect(note('executions')).toHaveTextContent('Rows are executions, not tickets');
		await expect(note('intervention')).toHaveTextContent(
			'question, limit pause, reply, manual retry, manual complete, or stop'
		);
		await expect(note('external-review-rounds')).toHaveTextContent('a comment with a body');
		await expect(note('external-review-rounds')).toHaveTextContent('geut/factory-skills#63');
		await expect(note('no-returns-to-work')).toHaveTextContent(
			'over executions that reached handoff'
		);
		await expect(note('export')).toHaveTextContent('Unavailable, never 0');
		await expect(note('waiting-share')).toHaveTextContent('not a mean of per-execution shares');
		await expect(note('blended-cost')).toHaveTextContent('Blended: run cost (USD)');
		await expect(note('rework')).toHaveTextContent('return-to-work and validation-correction');
		await expect(note('usage-coverage')).toHaveTextContent('not counted as 0');
		await expect(note('infrastructure-lost')).toHaveTextContent('overlaps with rework');
		await expect(note('infrastructure-lost')).toHaveTextContent('counted in both figures');
		await expect(note('definitions')).toHaveTextContent('Definitions: stats.v1');
	}}
/>
