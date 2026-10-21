<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { backlogLabels, filterByLabel, type BacklogCardModel } from '$lib/factory/backlog';
	import { formatTimestamp } from '$lib/factory/format';
	import { Button } from '$lib/components/ui/button';
	import BacklogCard from './backlog-card.svelte';
	import { CountFlash } from './count-flash.svelte';

	/**
	 * The Flow board's Backlog lane: open backlog issues as cards, a label
	 * filter, when the tracker was last asked, and Refresh. A failed read stays
	 * inside the lane: stale issues keep their timestamp and the lane offers
	 * Retry. Presentational only: the page owns fetching and passes callbacks.
	 */
	let {
		cards,
		labels = undefined,
		label = $bindable(null),
		fetchedAt = null,
		status,
		failure = null,
		refreshing = false,
		complete = true,
		selectedId = null,
		onselect,
		onfilter,
		onrefresh,
		onretry
	}: {
		/** Every loaded card; the lane applies the label filter itself. */
		cards: BacklogCardModel[];
		/** Filter options; defaults to the labels present on `cards`. */
		labels?: string[];
		/** The active label filter; null shows all labels. */
		label?: string | null;
		/** When the tracker was last asked. */
		fetchedAt?: string | null;
		status: 'loading' | 'ready' | 'failed';
		/** The reason the latest read failed. */
		failure?: string | null;
		refreshing?: boolean;
		/** False when the pager stopped before the end of the backlog. */
		complete?: boolean;
		selectedId?: string | null;
		onselect?: (id: string) => void;
		onfilter?: (label: string | null) => void;
		onrefresh?: () => void;
		onretry?: () => void;
	} = $props();

	const ALL = '';

	const options = $derived(labels ?? backlogLabels(cards));
	const visible = $derived(filterByLabel(cards, label));
	const filtered = $derived(label !== null);
	const count = $derived(visible.length);
	const flash = new CountFlash(() => count);
	const uid = $props.id();
	const headingId = `${uid}-heading`;
	const filterId = `${uid}-filter`;

	const showCards = $derived(status === 'ready' || (status === 'failed' && cards.length > 0));

	function choose(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		label = value === ALL ? null : value;
		onfilter?.(label);
	}
</script>

<div
	role="group"
	data-slot="backlog-lane"
	data-lane="backlog"
	data-status={status}
	aria-labelledby={headingId}
	aria-busy={status === 'loading' || refreshing}
	class="flex min-w-0 flex-col gap-2"
>
	<div class="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-border pb-1">
		<h2 id={headingId} class="flex items-baseline gap-2 text-xs font-medium text-foreground">
			<span>Backlog</span>
			{#if showCards}
				<span
					data-slot="lane-count"
					data-filtered={filtered ? 'true' : undefined}
					data-flash={flash.active ? 'on' : undefined}
					class={cn(
						'px-1 font-mono text-foreground/75 tabular-nums transition-colors duration-300',
						flash.active && 'bg-primary text-primary-foreground'
					)}
					>{#if filtered}{count} of {cards.length}<span class="sr-only">, filtered</span
						>{:else if !complete}at least {count}<span class="sr-only">, partial list</span
						>{:else}{count}{/if}</span
				>
				{#if filtered}
					<span aria-hidden="true" class="text-[0.625rem] font-normal text-foreground/75"
						>filtered</span
					>
				{/if}
			{/if}
		</h2>
		<Button
			variant="ghost"
			size="xs"
			data-slot="backlog-refresh"
			disabled={refreshing || status === 'loading'}
			onclick={() => onrefresh?.()}
		>
			{refreshing ? 'Refreshing…' : 'Refresh'}
		</Button>
	</div>

	{#if fetchedAt !== null && status !== 'loading'}
		<p
			data-slot="backlog-fetched-at"
			class="font-mono text-[0.625rem] text-foreground/75 tabular-nums"
		>
			Updated {formatTimestamp(fetchedAt)}
		</p>
	{/if}

	{#if status === 'failed'}
		<div role="alert" data-slot="backlog-failure" class="flex flex-col gap-2 bg-muted p-3 text-xs">
			<p class="text-foreground">
				<span class="font-medium">Backlog unavailable.</span>
				{failure ?? 'The tracker did not answer.'}
			</p>
			{#if cards.length > 0 && fetchedAt !== null}
				<p class="text-foreground/75">
					Showing issues from <span class="font-mono tabular-nums"
						>{formatTimestamp(fetchedAt)}</span
					>
				</p>
			{/if}
			<Button
				variant="outline"
				size="xs"
				class="self-start"
				data-slot="backlog-retry"
				disabled={refreshing}
				onclick={() => onretry?.()}
			>
				Retry
			</Button>
		</div>
	{/if}

	{#if showCards && cards.length > 0}
		<div class="flex min-w-0 flex-col gap-1">
			<label for={filterId} class="text-[0.625rem] text-foreground/75">Filter by label</label>
			<select
				id={filterId}
				data-slot="backlog-label-filter"
				value={label ?? ALL}
				onchange={choose}
				class="h-7 w-full min-w-0 border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
			>
				<option value={ALL}>All labels</option>
				{#each options as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
		</div>
	{/if}

	{#if status === 'loading'}
		<div class="flex flex-col gap-2">
			<span class="sr-only">Loading the backlog</span>
			{#each [0, 1, 2] as placeholder (placeholder)}
				<div
					data-slot="card-placeholder"
					class="h-24 animate-pulse bg-muted ring-1 ring-foreground/10 motion-reduce:animate-none"
				></div>
			{/each}
		</div>
	{:else if showCards}
		{#if cards.length === 0}
			<p class="p-3 text-xs text-foreground/75 ring-1 ring-foreground/10 ring-inset">
				Backlog clear.
			</p>
		{:else if count === 0}
			<p
				data-slot="backlog-no-match"
				class="p-3 text-xs text-foreground/75 ring-1 ring-foreground/10 ring-inset"
			>
				No issues with this label.
			</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each visible as card (card.id)}
					<li class="min-w-0">
						<BacklogCard {card} selected={card.id === selectedId} {onselect} />
					</li>
				{/each}
			</ul>
		{/if}
		{#if !complete}
			<p data-slot="backlog-partial" class="text-[0.625rem] text-foreground/75">
				Partial list: the backlog has more issues than the board reads. See the tracker for the
				rest.
			</p>
		{/if}
	{/if}
</div>
