<script lang="ts">
	import StatusBadge from '$lib/components/factory/status-badge.svelte';
	import { formatTimestamp, UNAVAILABLE } from '$lib/factory/format';
	import type { Cohort } from '$lib/factory/stats';

	/**
	 * Which cohort every figure on the page describes: tickets started in the
	 * window (`from` inclusive, `to` exclusive, shown as "before"), when it was
	 * observed, and which factory and definitions measured it. The window shows
	 * even when every read failed; the factory facts then read Unavailable.
	 */
	let { cohort }: { cohort: Cohort } = $props();

	const versions = $derived(cohort.factoryVersions.join(', '));
</script>

<div data-slot="cohort-header" class="not-prose text-xs/relaxed">
	<p
		class="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-foreground/75 tabular-nums"
	>
		{#if cohort.mismatch}
			<span data-testid="cohort-mismatch" class="inline-flex items-baseline gap-1">
				<StatusBadge signal="wait" label="Reads disagree" />
				<span class="text-foreground/75"
					>The panels came from different factories or definitions and may not compare.</span
				>
			</span>
		{/if}
		<span class="text-foreground" data-testid="cohort-window">
			Cohort: tickets started {cohort.window.fromLabel} – before {cohort.window.toLabel}
		</span>
		<span aria-hidden="true">·</span>
		<span class="text-foreground" data-testid="cohort-factory">
			{#if cohort.factoryId === null}{UNAVAILABLE}
				<span>Unavailable</span>{:else}{cohort.factoryId}{/if}
		</span>
		<span aria-hidden="true">·</span>
		<span class="text-foreground" data-testid="cohort-versions">
			{#if versions === ''}{UNAVAILABLE} <span>Unavailable</span>{:else}{versions}{/if}
		</span>
		<span aria-hidden="true">·</span>
		<span class="text-foreground" data-testid="cohort-definitions">
			{#if cohort.definitions === null}{UNAVAILABLE}
				<span>Unavailable</span>{:else}{cohort.definitions}{/if}
		</span>
		<span aria-hidden="true">· observed</span>
		<span class="text-foreground" data-testid="cohort-observed">
			{formatTimestamp(cohort.observedAt)}
		</span>
	</p>
</div>
