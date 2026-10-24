<script lang="ts">
	import { DEFINITIONS, STATS_DEFINITIONS } from '$lib/factory/stats';

	/**
	 * How the figures on the page are measured. Denominators stay beside their
	 * metrics; these notes are the reference behind them.
	 */
	let { definitions = STATS_DEFINITIONS }: { definitions?: string | null } = $props();
</script>

<details
	data-slot="measurement-notes"
	class="not-prose bg-card p-4 text-xs/relaxed text-foreground ring-1 ring-foreground/10"
>
	<summary class="cursor-pointer text-sm font-light">Measurement notes</summary>
	<ul class="mt-3 flex list-disc flex-col gap-2 pl-5 text-foreground/75">
		<li data-note="cohort">
			The cohort is the tickets <em>started</em> in the window: at or after the start (inclusive), and
			before the end (exclusive). Every panel uses the same window.
		</li>
		<li data-note="merge-rate">Merge rate: {DEFINITIONS.mergeRate}</li>
		<li data-note="unavailable">
			Zero is a measurement. "—" means Unavailable: the factory does not supply the figure, or its
			denominator is zero. "No runs in this cohort" means the stage did not run at all, which is
			neither zero nor Unavailable.
		</li>
		<li data-note="stage-tokens">
			Stage token totals are derived: tokens per accepted output × accepted outputs, summed over
			model setups and rounded. A model setup with runs but no accepted outputs has unknown tokens,
			so its stage is partial and says how many runs it leaves out.
		</li>
		<li data-note="missing-usage">
			The factory counts a run with missing usage as 0 tokens, so totals may undercount; the stats
			cannot tell zero from missing.
		</li>
		<li data-note="categories">
			Token categories (input, cache read, cache write, output) are Unavailable until stats facts
			carry them (geut/factory-skills#62).
		</li>
		<li data-note="definitions">
			Definitions: <span class="font-mono text-foreground">{definitions ?? 'Unavailable'}</span>.
		</li>
	</ul>
</details>
