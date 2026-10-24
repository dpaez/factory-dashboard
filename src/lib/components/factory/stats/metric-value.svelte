<script lang="ts">
	import {
		formatCost,
		formatCount,
		formatPercent,
		formatSpan,
		UNAVAILABLE
	} from '$lib/factory/format';
	import type { Metric } from '$lib/factory/stats';

	/**
	 * One figure in mono tabular digits. An Unavailable figure reads "—" with
	 * accessible "Unavailable" text, never 0.
	 */
	let {
		metric,
		percent = false,
		fractional = false
	}: {
		metric: Metric;
		/** Show a ratio as a percent. */
		percent?: boolean;
		/** A count that can be fractional, such as a median (1.5): up to two decimals, not rounded to whole. */
		fractional?: boolean;
	} = $props();

	function format(value: number, unit: Metric['unit']): string {
		if (percent) return formatPercent(value);
		switch (unit) {
			case 'USD':
				return formatCost(value);
			case 'ms':
				return formatSpan(value);
			case 'ratio':
				return (Math.round(value * 100) / 100).toLocaleString('en-US');
			default:
				return fractional
					? (Math.round(value * 100) / 100).toLocaleString('en-US')
					: formatCount(Math.round(value));
		}
	}
</script>

<span class="font-mono tabular-nums" data-availability={metric.availability}
	>{#if metric.value === null}{UNAVAILABLE}{' '}<span class="sr-only">Unavailable</span
		>{:else}{format(metric.value, metric.unit)}{/if}</span
>
