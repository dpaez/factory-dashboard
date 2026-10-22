<script lang="ts">
	import UsageList from '$lib/components/usage-list.svelte';
	import { formatCost, formatCount } from '$lib/factory/format';
	import type { RunView, Usage } from '$lib/factory/models';

	/**
	 * One execution's usage: its total cost, the token grid, and the per-run
	 * table. A missing usage or figure reads "—" (Unavailable), never 0 or
	 * $0.00. The runs list says when it is partial.
	 */
	let {
		execution,
		usage,
		runs,
		runsComplete = true
	}: {
		execution: number;
		/** Null when the factory has no usage for the execution. */
		usage: { [K in keyof Usage]?: Usage[K] | null } | null;
		runs: RunView[];
		/** False when the runs pager stopped before the last page. */
		runsComplete?: boolean;
	} = $props();

	const figures = $derived([
		{ label: 'Input', value: usage?.tokensInput },
		{ label: 'Output', value: usage?.tokensOutput },
		{ label: 'Cache read', value: usage?.tokensCacheRead },
		{ label: 'Cache write', value: usage?.tokensCacheWrite },
		{ label: 'Total', value: usage?.tokensTotal }
	]);

	const uid = $props.id();
	const headingId = `${uid}-usage`;
	const runsId = `${uid}-runs`;
</script>

<article
	aria-labelledby={headingId}
	data-slot="usage-panel"
	class="not-prose flex min-w-0 flex-col gap-4 text-xs/relaxed text-foreground"
>
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h3 id={headingId} class="text-base font-light">Usage</h3>
		<p class="font-mono tabular-nums" data-testid="usage-total">
			Execution {execution} total {formatCost(usage?.costUsd)}{#if usage?.costUsd == null}{' '}<span
					class="text-foreground/75">(Unavailable)</span
				>{/if}
		</p>
	</div>
	<dl
		class="grid grid-cols-2 gap-2 font-mono tabular-nums md:grid-cols-5"
		data-testid="usage-tokens"
	>
		{#each figures as figure (figure.label)}
			<div>
				<dt class="text-foreground/75">{figure.label}</dt>
				<dd>
					{formatCount(figure.value)}{#if figure.value == null}{' '}<span class="sr-only"
							>Unavailable</span
						>{/if}
				</dd>
			</div>
		{/each}
	</dl>

	<h4 id={runsId} class="text-sm font-light">Runs</h4>
	{#if !runsComplete}
		<p class="font-mono text-foreground/75" data-testid="runs-partial">
			Showing the first {runs.length} runs. The list is partial.
		</p>
	{/if}
	{#if runs.length > 0}
		<!-- The runs table scrolls sideways in a narrow Inspector; keyboard users can focus it to scroll. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			role="group"
			aria-labelledby={runsId}
			tabindex="0"
			class="min-w-0 overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&>[data-slot=table-container]]:overflow-visible"
		>
			<UsageList {runs} />
		</div>
	{:else}
		<p class="font-mono text-foreground/75">No runs yet.</p>
	{/if}
</article>
