<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import {
		formatCount,
		formatSpan,
		formatTimestamp,
		UNAVAILABLE,
		words
	} from '$lib/factory/format';
	import type { Contributors, ContributorRow } from '$lib/factory/stats-tickets';
	import type { PanelState } from './panel-state';
	import StatsPanelState from './stats-panel-state.svelte';

	/**
	 * The exact executions behind the selected figure. Rows are executions, not
	 * tickets: a rerun is its own row. "Open execution" goes to that execution
	 * through the stats resolver. A null model means nothing is selected yet.
	 */
	let {
		state: view,
		complete = true,
		onretry
	}: {
		state: PanelState<Contributors | null>;
		/** False when the ticket facts stopped early: the population may be missing rows. */
		complete?: boolean;
		onretry?: () => void;
	} = $props();

	const uid = $props.id();
	const headingId = `${uid}-contributors`;

	function value(row: ContributorRow): string {
		if (row.value === null) return UNAVAILABLE;
		return row.unit === 'ms' ? formatSpan(row.value) : formatCount(row.value);
	}
</script>

<article
	aria-labelledby={headingId}
	data-slot="contributing-tickets"
	data-state={view.kind}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	class="not-prose flex min-w-0 flex-col gap-2 text-xs/relaxed"
>
	<h2 id={headingId} class="text-base font-light">Contributing executions</h2>
	{#if view.kind !== 'ready'}
		<StatsPanelState state={view} {onretry} />
	{:else if view.model === null}
		<p class="font-mono text-foreground/75" data-testid="contributors-prompt">
			Select a figure in Time to handoff or Tickets quality to list its executions.
		</p>
	{:else}
		{@const model = view.model}
		<div class="flex flex-col gap-1" data-testid="contributors-population">
			<p class="text-sm font-light" data-measure={model.measure}>{model.label}</p>
			<p class="text-foreground/75">{model.definition}</p>
			<p class="font-mono text-foreground/75 tabular-nums">
				Rows are executions, not tickets: a rerun is its own row. {formatCount(model.rows.length)}
				{model.rows.length === 1 ? 'execution' : 'executions'}{#if !complete}{' '}· partial: ticket
					facts incomplete{/if}.
			</p>
		</div>
		{#if model.rows.length === 0}
			<p class="font-mono text-foreground/75" data-testid="contributors-empty">
				No executions in this population
			</p>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				role="group"
				aria-labelledby={headingId}
				tabindex="0"
				class="min-w-0 overflow-x-auto ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&>[data-slot=table-container]]:overflow-visible"
			>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Execution</Table.Head>
							<Table.Head>Outcome</Table.Head>
							<Table.Head>Started</Table.Head>
							<Table.Head class="text-right">{model.label}</Table.Head>
							<Table.Head>Why</Table.Head>
							<Table.Head><span class="sr-only">Link</span></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each model.rows as row (`${row.key}@${row.startedAt}`)}
							<Table.Row data-key={row.key} data-started-at={row.startedAt}>
								<Table.Head scope="row" class="font-mono font-normal">{row.displayRef}</Table.Head>
								<Table.Cell class="font-mono">{words(row.outcome)}</Table.Cell>
								<Table.Cell class="font-mono tabular-nums"
									>{formatTimestamp(row.startedAt)}</Table.Cell
								>
								<Table.Cell class="text-right font-mono tabular-nums" data-column="value"
									>{value(row)}{#if row.value === null}{' '}<span class="sr-only">Unavailable</span
										>{/if}</Table.Cell
								>
								<Table.Cell class="text-foreground/75">{row.reason}</Table.Cell>
								<Table.Cell>
									<a
										href={row.href}
										class="underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
										data-testid="open-execution"
										>Open execution<span class="sr-only"
											>: {row.displayRef} started {formatTimestamp(row.startedAt)}</span
										></a
									>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	{/if}
</article>
