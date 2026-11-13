<script lang="ts" module>
	import type {
		FeedbackCandidate,
		PendingFeedback,
		PendingFeedbackFailure
	} from '$lib/factory/feedback';
	import type { PendingFeedbackStatus } from '$lib/factory/pending-feedback-state.svelte';

	/** The pending list as the box shows it; the owner reads it (`PendingFeedbackState`). */
	export type FeedbackRoundsPending = {
		status: PendingFeedbackStatus;
		candidates: FeedbackCandidate[];
		skipped: PendingFeedback['skipped'];
		truncated: boolean;
		failure: PendingFeedbackFailure | null;
		/** A read is in flight. */
		reading: boolean;
	};
</script>

<script lang="ts">
	import { ExternalLink } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import TasksTableStatusCell from '$lib/components/tasks-table-status-cell.svelte';
	import type { EarlierRoundView } from '$lib/factory/models';
	import type { CommandPhase } from '$lib/factory/commands';
	import {
		FEEDBACK_COPY,
		FEEDBACK_KIND_LABELS,
		FEEDBACK_PAGE_SIZE,
		feedbackItemKindLabel,
		feedbackPage,
		pickedFeedback,
		skippedLine,
		startLabel,
		type FeedbackChoice
	} from '$lib/factory/feedback-rounds';
	import type { ActionAvailability } from '$lib/factory/ticket-actions';

	/**
	 * The Inspector's Feedback rounds box, in place of the action bar's
	 * Feedback round. Presentational: the owner (`ticket-commands.svelte`)
	 * reads the pending list, decides whether a round can start and sends it.
	 *
	 * - `pending` null: the list is not read (no round can start here); only
	 *   the reason shows.
	 * - The list shows `FEEDBACK_PAGE_SIZE` comments per page and keeps the
	 *   height of one page. Ticks (`ticked`, bound) cover every page; select
	 *   all and select none apply to every page.
	 * - Starting emits `onstart` with `pickedFeedback`'s choice: no `only`
	 *   when every comment is ticked, the ticked refs otherwise, and the note
	 *   when one is typed. Nothing ticked and no note starts nothing.
	 * - A refused round shows `explanation` as given; ticks and the note stay.
	 * - `rounds`: the execution's earlier rounds (`F<n>`), in round order, each
	 *   with its items (no checkbox; the note has no ref and no link). With
	 *   rounds and no pending list the box is read-only: no start control.
	 * - Each comment's ref links to its `url` on GitHub, in a new tab; the
	 *   checkbox alone controls the selection. A null `url` shows the ref as
	 *   plain text, never as an empty link.
	 */
	const uid = $props.id();

	let {
		availability,
		pending,
		ticked = $bindable([]),
		note = $bindable(''),
		phase = 'idle',
		explanation,
		rounds = [],
		onstart,
		onrefresh
	}: {
		/** Whether a round can start, and why not. */
		availability: Exclude<ActionAvailability, { kind: 'hidden' }>;
		/** The pending list; null when it is not read. */
		pending: FeedbackRoundsPending | null;
		/** The ticked comments' refs. */
		ticked?: string[];
		/** The round's optional note. */
		note?: string;
		/** The latest round's phase, from the coordinator. */
		phase?: CommandPhase;
		/** The latest round's explanation, shown when it was refused or unconfirmed. */
		explanation?: string;
		/** The execution's earlier feedback rounds, in round order. */
		rounds?: EarlierRoundView[];
		onstart: (choice: FeedbackChoice) => void;
		/** Read the pending list again (Refresh and Retry). */
		onrefresh: () => void;
	} = $props();

	let page = $state(0);
	const candidates = $derived(pending?.status === 'ready' ? pending.candidates : []);
	const shown = $derived(feedbackPage(candidates, page));
	const tickedSet = $derived(new Set(ticked));
	const tickedCount = $derived(candidates.filter((c) => tickedSet.has(c.ref)).length);
	const choice = $derived(pickedFeedback({ candidates, ticked, note }));
	const ready = $derived(pending?.status === 'ready');
	const canEdit = $derived(availability.kind === 'enabled' && ready);
	const canStart = $derived(canEdit && choice !== null);
	const reason = $derived(availability.kind === 'disabled' ? availability.reason : null);
	const failure = $derived(
		(phase === 'rejected' || phase === 'unconfirmed') && explanation ? explanation : null
	);
	// Earlier rounds only: nothing to pick from, so no start control.
	const readOnly = $derived(pending === null && rounds.length > 0);
	const extra = $derived(pending ? skippedLine(pending.skipped, pending.truncated) : null);
	const describedBy = $derived(
		[
			`${uid}-note`,
			reason && `${uid}-reason`,
			ready && candidates.length > 0 && choice === null && `${uid}-tick`,
			failure && `${uid}-failure`
		]
			.filter(Boolean)
			.join(' ')
	);

	// A different list starts on its first page.
	$effect.pre(() => {
		void candidates;
		page = 0;
	});

	function toggle(ref: string, on: boolean) {
		const rest = ticked.filter((item) => item !== ref);
		ticked = on ? [...rest, ref] : rest;
	}

	function start() {
		if (!canStart || choice === null) return;
		onstart(choice);
	}

	const NOTE = 'text-foreground/75';
	const REASON = 'font-mono text-foreground/75';
	const FAILURE = 'border-l-2 border-l-signal-fault bg-card px-2 py-1 font-mono';
	// One page's height: FEEDBACK_PAGE_SIZE rows of h-14 (3.5rem).
	const PAGE_HEIGHT = `${FEEDBACK_PAGE_SIZE * 3.5}rem`;
</script>

<!-- A comment's ref, as a link to it on GitHub (new tab); plain text without a link. -->
{#snippet refLink(ref: string, url: string | null)}
	{#if url}
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			class="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-foreground/75 underline-offset-2 hover:text-foreground hover:underline"
			aria-label="Open {ref} on GitHub"
			data-testid="ref"
		>
			{ref}
			<ExternalLink class="size-3" aria-hidden="true" />
		</a>
	{:else}
		<span class="ml-auto shrink-0 font-mono text-foreground/75" data-testid="ref">{ref}</span>
	{/if}
{/snippet}

<div
	role="group"
	data-slot="feedback-rounds"
	aria-labelledby="{uid}-heading"
	class="not-prose flex flex-col gap-3 border-t border-border pt-4 text-xs/relaxed text-foreground"
>
	<div class="flex items-center justify-between gap-2">
		<h3 id="{uid}-heading" class="text-xs font-medium">{FEEDBACK_COPY.heading}</h3>
		{#if pending}
			<Button
				variant="ghost"
				size="sm"
				class="rounded-none"
				disabled={pending.reading}
				onclick={onrefresh}
				data-testid="feedback-refresh"
			>
				Refresh
			</Button>
		{/if}
	</div>

	{#if pending}
		<div class="flex flex-col gap-2" data-testid="pending-feedback" data-status={pending.status}>
			{#if pending.status === 'loading' || pending.status === 'idle'}
				<p class={NOTE} role="status" style:min-height={PAGE_HEIGHT}>{FEEDBACK_COPY.loading}</p>
			{:else if pending.status === 'failed'}
				<div
					class="flex flex-col items-start gap-2"
					style:min-height={PAGE_HEIGHT}
					data-testid="pending-feedback-failure"
				>
					<p class={FAILURE} role="alert">
						{pending.failure?.detail ?? pending.failure?.title}
					</p>
					<Button
						variant="outline"
						size="sm"
						class="rounded-none"
						disabled={pending.reading}
						onclick={onrefresh}
					>
						Retry
					</Button>
				</div>
			{:else if candidates.length === 0}
				<p class={NOTE} data-testid="nothing-pending">{FEEDBACK_COPY.nothingPending}</p>
			{:else}
				<div class="flex items-center justify-between gap-2">
					<p class="font-mono text-foreground/75" data-testid="feedback-count">
						{tickedCount} of {candidates.length} ticked
					</p>
					<div class="flex gap-1">
						<Button
							variant="ghost"
							size="sm"
							class="rounded-none"
							disabled={!canEdit}
							onclick={() => (ticked = candidates.map((c) => c.ref))}
						>
							Select all
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="rounded-none"
							disabled={!canEdit}
							onclick={() => (ticked = [])}
						>
							Select none
						</Button>
					</div>
				</div>
				<ul
					class="flex flex-col"
					style:height={PAGE_HEIGHT}
					aria-label="Pending comments"
					data-testid="pending-feedback-list"
				>
					{#each shown.items as candidate (candidate.ref)}
						{@const id = `${uid}-${candidate.ref}`}
						<li
							class="flex h-14 items-start gap-2 overflow-hidden border-b border-border py-1"
							data-ref={candidate.ref}
						>
							<input
								{id}
								type="checkbox"
								class="mt-1"
								checked={tickedSet.has(candidate.ref)}
								disabled={!canEdit}
								aria-label="{FEEDBACK_KIND_LABELS[
									candidate.kind
								]} by {candidate.author}: {candidate.summary}"
								onchange={(event) => toggle(candidate.ref, event.currentTarget.checked)}
							/>
							<div class="flex min-w-0 flex-1 flex-col">
								<div class="flex min-w-0 items-center gap-2">
									<Badge variant="outline" data-kind={candidate.kind}>
										{FEEDBACK_KIND_LABELS[candidate.kind]}
									</Badge>
									<span class="font-medium">{candidate.author}</span>
									{#if candidate.kind === 'thread' && candidate.location}
										<span class="truncate font-mono text-foreground/75" data-testid="location"
											>{candidate.location}</span
										>
									{/if}
									{@render refLink(candidate.ref, candidate.url)}
								</div>
								<label for={id} class="truncate" data-testid="summary">{candidate.summary}</label>
							</div>
						</li>
					{/each}
				</ul>
				<div
					role="group"
					class="flex items-center justify-between gap-2"
					aria-label="Pending comments pages"
				>
					<Button
						variant="outline"
						size="sm"
						class="rounded-none"
						disabled={shown.page === 0}
						onclick={() => (page = shown.page - 1)}
					>
						Previous
					</Button>
					<p class="font-mono text-foreground/75 tabular-nums" data-testid="feedback-position">
						{shown.position}
					</p>
					<Button
						variant="outline"
						size="sm"
						class="rounded-none"
						disabled={shown.page >= shown.pages - 1}
						onclick={() => (page = shown.page + 1)}
					>
						Next
					</Button>
				</div>
			{/if}
			{#if ready && extra}
				<p class={NOTE} data-testid="feedback-skipped">{extra}</p>
			{/if}
		</div>

		<div class="flex flex-col gap-1">
			<Label for="{uid}-note-field">{FEEDBACK_COPY.noteLabel}</Label>
			<Textarea
				id="{uid}-note-field"
				name="note"
				rows={2}
				bind:value={note}
				disabled={!canEdit}
				class="rounded-none"
				data-testid="feedback-note"
			/>
		</div>
	{/if}

	{#if !readOnly}
		<div>
			<Button
				variant="outline"
				class="rounded-none"
				disabled={!canStart}
				aria-describedby={describedBy}
				onclick={start}
				data-testid="feedback-start"
			>
				{startLabel(ready ? candidates.length : null, tickedCount)}
			</Button>
		</div>
		<p id="{uid}-note" class={NOTE}>{FEEDBACK_COPY.note}</p>
	{/if}
	{#if reason}
		<p id="{uid}-reason" class={REASON} data-reason="feedback">{reason}</p>
	{/if}
	{#if ready && candidates.length > 0 && choice === null}
		<p id="{uid}-tick" class={REASON}>{FEEDBACK_COPY.tickOne}</p>
	{/if}
	{#if failure}
		<p id="{uid}-failure" class={FAILURE} role="status" data-failure="feedback">{failure}</p>
	{/if}

	{#if rounds.length > 0}
		<div
			role="group"
			class="flex flex-col gap-3"
			aria-labelledby="{uid}-earlier"
			data-testid="earlier-rounds"
		>
			<h4 id="{uid}-earlier" class="text-xs font-medium">{FEEDBACK_COPY.earlierRounds}</h4>
			{#each rounds as round (round.taskId)}
				<div
					role="group"
					class="flex flex-col gap-1"
					aria-labelledby="{uid}-round-{round.round}"
					data-round={round.round}
				>
					<div class="flex items-center justify-between gap-2">
						<h5 id="{uid}-round-{round.round}" class="font-mono tabular-nums">
							Feedback round {round.round}
						</h5>
						<TasksTableStatusCell status={round.status} stage={round.stage} />
					</div>
					<ul class="flex flex-col" aria-label="Feedback round {round.round} items">
						{#each round.items as item (item.id)}
							<li
								class="flex h-14 items-start gap-2 overflow-hidden border-b border-border py-1"
								data-item={item.id}
								data-kind={item.kind}
							>
								<span class="mt-0.5 shrink-0 font-mono text-foreground/75 tabular-nums"
									>{item.id}</span
								>
								<div class="flex min-w-0 flex-1 flex-col">
									<div class="flex min-w-0 items-center gap-2">
										<Badge variant="outline" data-kind={item.kind}>
											{feedbackItemKindLabel(item.kind)}
										</Badge>
										<span class="font-medium">{item.author}</span>
										{#if item.kind === 'thread' && item.location}
											<span class="truncate font-mono text-foreground/75" data-testid="location"
												>{item.location}</span
											>
										{/if}
										{#if item.ref}
											{@render refLink(item.ref, item.kind === 'note' ? null : item.url)}
										{/if}
									</div>
									<p class="truncate" data-testid="summary">{item.summary}</p>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
</div>
