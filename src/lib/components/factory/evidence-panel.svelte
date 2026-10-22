<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table/index.js';
	import StatusBadge from '$lib/components/factory/status-badge.svelte';
	import {
		formatCost,
		formatCount,
		formatDuration,
		stageLabel,
		UNAVAILABLE
	} from '$lib/factory/format';
	import type { RunDetailViewState } from '$lib/factory/run-detail-state.svelte';
	import { runPurposeLabel } from '$lib/factory/run-purpose';
	import {
		checkStatusSignal,
		findingSeveritySignal,
		reviewVerdictSignal,
		validationStatusSignal
	} from '$lib/factory/status';
	import { cn } from '$lib/utils.js';

	/**
	 * One run's evidence: its identity, the latest validation report with each
	 * check, and the review with its findings. Paths (locations, evidence, the
	 * session file) are text, never links. A failed read stays inside the panel,
	 * with Retry when it can help.
	 */
	let {
		state: view,
		onretry,
		caption
	}: {
		state: RunDetailViewState;
		/** Retries a failed read; no Retry control without it. */
		onretry?: () => void;
		/** Shown above the run identity, such as "Latest run". */
		caption?: string;
	} = $props();

	const uid = $props.id();
	const headingId = `${uid}-run`;
	const dash = (value: string | number | null) =>
		value === null || value === '' ? UNAVAILABLE : String(value);
</script>

<article
	aria-labelledby={headingId}
	aria-busy={view.kind === 'loading' ? 'true' : undefined}
	data-slot="evidence-panel"
	data-state={view.kind}
	class="not-prose flex min-w-0 flex-col gap-4 text-xs/relaxed text-foreground"
>
	{#if view.kind === 'loading'}
		<h3 id={headingId} class="text-base font-light">Loading run…</h3>
		<div aria-hidden="true" class="flex flex-col gap-2" data-slot="evidence-skeleton">
			<div class="h-4 w-48 animate-pulse bg-muted"></div>
			<div class="h-4 w-72 animate-pulse bg-muted"></div>
			<div class="h-4 w-32 animate-pulse bg-muted"></div>
		</div>
	{:else if view.kind === 'not_found'}
		<h3 id={headingId} class="text-base font-light">No such run</h3>
		<p class="font-mono break-all text-foreground/75" data-testid="not-found-run">{view.id}</p>
	{:else if view.kind === 'error'}
		<h3 id={headingId} class="text-base font-light">{view.title}</h3>
		<p class="font-mono text-foreground/75">The run's evidence could not be read.</p>
		{#if view.retryable && onretry}
			<div>
				<Button variant="secondary" onclick={onretry}>Retry</Button>
			</div>
		{/if}
	{:else}
		{@const run = view.run}
		{@const purpose = runPurposeLabel(run.purpose)}
		<header class="flex flex-col gap-1">
			{#if caption}
				<p class="font-mono text-foreground/75" data-testid="evidence-caption">{caption}</p>
			{/if}
			<h3 id={headingId} class="text-base font-light">
				Run <span class="font-mono tabular-nums">#{run.sequence}</span> · {stageLabel(run.stage)}
				· {run.task === null ? 'Ticket' : `Task ${run.task}`}
			</h3>
			<p class="flex flex-wrap gap-x-3 gap-y-1 font-mono text-foreground/75 tabular-nums">
				<span
					data-testid="evidence-purpose"
					class={cn('text-foreground', !purpose.known && 'text-foreground/75 italic')}
					>{purpose.label}</span
				>
				<span>round {run.round}</span>
				<span data-testid="evidence-outcome">{dash(run.outcome)}</span>
				<span>{run.model} · {run.thinking}</span>
				<span data-testid="evidence-usage"
					>{#if run.usage}{formatCount(run.usage.tokensTotal)} tokens · {formatCost(
							run.costUsd
						)}{:else}Usage unavailable{/if}</span
				>
			</p>
			{#if run.sessionFile}
				<p class="font-mono break-all text-foreground/75" data-testid="evidence-session">
					Session {run.sessionFile}
				</p>
			{/if}
		</header>

		<section class="flex flex-col gap-2" data-testid="evidence-validation">
			<h4 class="text-sm font-light">Validation</h4>
			{#if run.validation === null}
				<p class="font-mono text-foreground/75">No validation recorded for this run.</p>
			{:else}
				{@const validation = run.validation}
				<p class="flex flex-wrap items-center gap-2">
					<StatusBadge {...validationStatusSignal(validation.status)} />
					<span class="font-mono tabular-nums">attempt {validation.attempt}</span>
					<span data-testid="validation-summary">{dash(validation.summary)}</span>
				</p>
				{#if validation.checks.length > 0}
					<!-- The checks table scrolls sideways in a narrow Inspector; keyboard users can focus it. -->
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div
						role="group"
						aria-label="Validation checks"
						tabindex="0"
						class="min-w-0 overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&>[data-slot=table-container]]:overflow-visible"
					>
						<Table.Root class="font-mono" data-testid="validation-checks">
							<Table.Header>
								<Table.Row>
									<Table.Head>Check</Table.Head>
									<Table.Head>Kind</Table.Head>
									<Table.Head>Status</Table.Head>
									<Table.Head>Command</Table.Head>
									<Table.Head class="text-end">Exit</Table.Head>
									<Table.Head class="text-end">Duration</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each validation.checks as check (check.name)}
									<Table.Row data-check={check.name}>
										<Table.Cell>{check.name}</Table.Cell>
										<Table.Cell class="text-foreground/75">{check.kind}</Table.Cell>
										<Table.Cell><StatusBadge {...checkStatusSignal(check.status)} /></Table.Cell>
										<Table.Cell data-testid="check-command">{dash(check.command)}</Table.Cell>
										<Table.Cell class="text-end tabular-nums" data-testid="check-exit"
											>{dash(check.exitCode)}</Table.Cell
										>
										<Table.Cell class="text-end tabular-nums" data-testid="check-duration"
											>{formatDuration(check.durationMs)}</Table.Cell
										>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>
				{:else}
					<p class="font-mono text-foreground/75">No checks recorded yet.</p>
				{/if}
			{/if}
		</section>

		<section class="flex flex-col gap-2" data-testid="evidence-review">
			<h4 class="text-sm font-light">Review</h4>
			{#if run.review === null}
				<p class="font-mono text-foreground/75">No review for this run.</p>
			{:else}
				{@const review = run.review}
				<p class="flex flex-wrap items-center gap-2">
					<StatusBadge {...reviewVerdictSignal(review.verdict)} />
					<span class="font-mono tabular-nums">round {review.round}</span>
					<span data-testid="review-summary">{dash(review.summary)}</span>
				</p>
				{#if review.findings.length === 0}
					<p class="font-mono text-foreground/75">No findings.</p>
				{:else}
					<ol class="flex flex-col gap-2">
						{#each review.findings as finding (finding.id)}
							<li
								data-finding={finding.id}
								class="flex flex-col gap-1 p-2 ring-1 ring-foreground/10"
							>
								<p class="flex flex-wrap items-center gap-2">
									<span class="font-mono tabular-nums">{finding.number}. {finding.id}</span>
									<span class="font-medium">{finding.title}</span>
									<StatusBadge {...findingSeveritySignal(finding.severity)} />
									<span class="font-mono" data-testid="finding-blocking"
										>{finding.blocking ? 'Blocking' : 'Non-blocking'}</span
									>
								</p>
								<p>{finding.finding}</p>
								<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
									<dt class="text-foreground/75">Evidence</dt>
									<dd class="font-mono break-all" data-testid="finding-evidence">
										{finding.evidence}
									</dd>
									<dt class="text-foreground/75">Location</dt>
									<dd class="font-mono break-all" data-testid="finding-location">
										{dash(finding.location)}
									</dd>
									<dt class="text-foreground/75">Suggestion</dt>
									<dd data-testid="finding-suggestion">{dash(finding.suggestion)}</dd>
								</dl>
							</li>
						{/each}
					</ol>
				{/if}
			{/if}
		</section>
	{/if}
</article>
