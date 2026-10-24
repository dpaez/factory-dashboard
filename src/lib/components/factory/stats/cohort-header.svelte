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

<div data-slot="cohort-header" class="not-prose flex flex-col gap-2 text-xs/relaxed">
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<h2 class="text-base font-light">Cohort</h2>
		{#if cohort.mismatch}
			<span data-testid="cohort-mismatch">
				<StatusBadge signal="wait" label="Reads disagree" />
				<span class="ml-1 text-foreground/75"
					>The panels came from different factories or definitions and may not compare.</span
				>
			</span>
		{/if}
	</div>
	<p class="font-mono text-foreground tabular-nums" data-testid="cohort-window">
		Cohort: tickets started {cohort.window.fromLabel} – before {cohort.window.toLabel}
	</p>
	<dl
		class="grid grid-cols-1 gap-x-6 gap-y-1 font-mono text-foreground/75 tabular-nums sm:grid-cols-[auto_1fr]"
	>
		<dt>Observed</dt>
		<dd class="text-foreground" data-testid="cohort-observed">
			{formatTimestamp(cohort.observedAt)}
		</dd>
		<dt>Factory</dt>
		<dd class="text-foreground" data-testid="cohort-factory">
			{#if cohort.factoryId === null}{UNAVAILABLE}
				<span>Unavailable</span>{:else}{cohort.factoryId}{/if}
		</dd>
		<dt>Factory versions</dt>
		<dd class="text-foreground" data-testid="cohort-versions">
			{#if versions === ''}{UNAVAILABLE} <span>Unavailable</span>{:else}{versions}{/if}
		</dd>
		<dt>Definitions</dt>
		<dd class="text-foreground" data-testid="cohort-definitions">
			{#if cohort.definitions === null}{UNAVAILABLE}
				<span>Unavailable</span>{:else}{cohort.definitions}{/if}
		</dd>
	</dl>
</div>
