<script lang="ts">
	import { cn } from '$lib/utils.js';
	import StatusBadge from '$lib/components/factory/status-badge.svelte';
	import { formatCost, formatCount, formatTimestamp, stageLabel, words } from '$lib/factory/format';
	import type { RunView } from '$lib/factory/models';
	import { groupRuns } from '$lib/factory/run-groups';
	import { runPurposeLabel } from '$lib/factory/run-purpose';
	import {
		reviewVerdictSignal,
		runStatusSignal,
		validationStatusSignal
	} from '$lib/factory/status';

	/**
	 * One execution's runs, grouped by task then stage, oldest first. Each run
	 * is a button: choosing it calls `onselect(id)`; it never navigates. A run
	 * that ended without `subagent_done` names how it ended, so a run lost to
	 * infrastructure reads as lost. Missing usage reads "Usage unavailable".
	 */
	let {
		runs,
		runsComplete = true,
		selected = null,
		onselect
	}: {
		runs: RunView[];
		/** False when the runs pager stopped before the last page. */
		runsComplete?: boolean;
		/** The selected run id, or null. */
		selected?: string | null;
		onselect: (id: string) => void;
	} = $props();

	const groups = $derived(groupRuns(runs));

	/** Ends that are not infrastructure losses: the agent finished or asked a person. */
	const AGENT_ENDS: readonly string[] = ['subagent_done', 'caller_ping'];

	function endText(kind: string | null): string | null {
		if (kind === null || kind === 'subagent_done') return null;
		return AGENT_ENDS.includes(kind) ? `Ended by ${words(kind)}` : `Lost: ${words(kind)}`;
	}
</script>

<div data-slot="run-timeline" class="not-prose flex min-w-0 flex-col gap-4 text-xs/relaxed">
	{#if !runsComplete}
		<p class="font-mono text-foreground/75" data-testid="runs-partial">
			Showing {runs.length} runs. Earlier or later runs are not shown.
		</p>
	{/if}
	{#if runs.length === 0}
		<p class="font-mono text-foreground/75" data-testid="runs-empty">
			No runs yet for this execution.
		</p>
	{:else}
		{#each groups as group (group.task ?? '')}
			<section class="flex flex-col gap-3" data-run-group={group.task ?? 'ticket'}>
				<h4 class="text-sm font-light">
					{#if group.task === null}{group.label}{:else}Task <span class="font-mono tabular-nums"
							>{group.label}</span
						>{/if}
				</h4>
				{#each group.stages as stage (stage.stage)}
					<div class="flex flex-col gap-1" data-run-stage={stage.stage}>
						<h5 class="font-mono text-foreground/75">
							{group.label} · {stageLabel(stage.stage)}
						</h5>
						<ul class="flex flex-col gap-1">
							{#each stage.runs as run (run.id)}
								{@const purpose = runPurposeLabel(run.purpose)}
								{@const ended = endText(run.terminalKind)}
								{@const isSelected = run.id === selected}
								<li>
									<button
										type="button"
										data-run={run.id}
										data-selected={isSelected ? 'true' : undefined}
										aria-pressed={isSelected}
										onclick={() => onselect(run.id)}
										class={cn(
											'flex w-full flex-col gap-1 p-2 text-left ring-1 ring-foreground/10 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30',
											isSelected && 'bg-muted ring-2 ring-foreground/40'
										)}
									>
										<span class="flex flex-wrap items-center gap-2">
											<span
												class="font-mono text-foreground/75 tabular-nums"
												data-testid="run-sequence">#{run.sequence}</span
											>
											<span
												data-testid="run-purpose"
												data-known={purpose.known ? 'true' : 'false'}
												class={cn(
													'font-medium',
													!purpose.known && 'font-mono font-normal text-foreground/75 italic'
												)}>{purpose.label}</span
											>
											<span
												class="font-mono text-foreground/75 tabular-nums"
												data-testid="run-round">round {run.round}</span
											>
											<StatusBadge {...runStatusSignal(run.status)} />
											{#if ended}
												<span class="font-mono text-foreground" data-testid="run-terminal-kind"
													>{ended}</span
												>
											{/if}
										</span>
										<span class="flex flex-wrap items-center gap-2">
											<span class="font-mono" data-testid="run-outcome"
												>{run.outcome === '' ? '—' : run.outcome}</span
											>
											{#if run.validationStatus !== null}
												<span class="flex items-center gap-1" data-testid="run-validation">
													<span class="text-foreground/75">validation</span>
													<StatusBadge {...validationStatusSignal(run.validationStatus)} />
												</span>
											{/if}
											{#if run.review !== null}
												<span class="flex items-center gap-1" data-testid="run-review">
													<span class="text-foreground/75">review</span>
													<StatusBadge {...reviewVerdictSignal(run.review.verdict)} />
													<span class="font-mono tabular-nums"
														>findings {run.review.findings.total} · blocking {run.review.findings
															.blocking}</span
													>
												</span>
											{/if}
										</span>
										<span
											class="flex flex-wrap gap-x-3 gap-y-1 font-mono text-foreground/75 tabular-nums"
										>
											<span data-testid="run-model">{run.model} · {run.thinking}</span>
											<span data-testid="run-times"
												>{formatTimestamp(run.startedAt)} → {formatTimestamp(run.endedAt)}</span
											>
											<span data-testid="run-usage"
												>{#if run.usage}{formatCount(run.usage.tokensTotal)} tokens · {formatCost(
														run.costUsd
													)}{:else}Usage unavailable{/if}</span
											>
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</section>
		{/each}
	{/if}
</div>
