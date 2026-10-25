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
		<li data-note="start-to-handoff">
			Start → handoff: {DEFINITIONS.startToHandoff} The median is the middle value (the mean of the two
			middles for an even sample).
		</li>
		<li data-note="p90">
			P90 is nearest-rank: the value at position ceil(0.9 × n) of the sorted durations, so it is
			always a real execution's duration.
		</li>
		<li data-note="eligible-sample">
			Every time figure (mean, median, P90, waiting before handoff, factory time, stage time and
			agent time) uses the same sample: the executions that reached handoff. Open, cancelled and
			unknown executions without a handoff are excluded and counted beside the headline. With no
			such executions the figures are Unavailable, never 0.
		</li>
		<li data-note="waiting">
			Waiting before handoff is start → handoff minus factory time, per execution. The factory's
			"all waiting" also counts waiting after handoff, so it is never added to start → handoff here.
		</li>
		<li data-note="stage-time">
			Stage time: {DEFINITIONS.stageTime} Factory time not covered by stage time is shown as unattributed;
			if stage time exceeds factory time it is flagged, not clamped.
		</li>
		<li data-note="overhead">
			Overhead = stage time − agent time, over executions with stage timings (its own sample). Agent
			time sums runs that can overlap, so it is not wall time.
		</li>
		<li data-note="executions">
			Rows are executions, not tickets: a rerun of a ticket is its own execution and its own row.
		</li>
		<li data-note="intervention">
			An intervention is a question, limit pause, reply, manual retry, manual complete, or stop.
			Needed a person: {DEFINITIONS.neededAPerson}
		</li>
		<li data-note="external-review-rounds">
			External review rounds: {DEFINITIONS.externalReviewRounds} A comment counts, so a round is not the
			same as changes requested. "External changes requested" is Unavailable until the factory records
			review disposition (geut/factory-skills#63).
		</li>
		<li data-note="definitions">
			Definitions: <span class="font-mono text-foreground">{definitions ?? 'Unavailable'}</span>.
		</li>
	</ul>
</details>
