<script lang="ts">
	import type { PageProps } from './$types';

	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import AttentionStrip from '$lib/components/factory/attention-strip.svelte';
	import BacklogLane from '$lib/components/factory/backlog-lane.svelte';
	import BoardSummary from '$lib/components/factory/board-summary.svelte';
	import FlowBoard from '$lib/components/factory/flow-board.svelte';
	import IssuePreview from '$lib/components/factory/issue-preview.svelte';
	import TicketInspector from '$lib/components/factory/ticket-inspector.svelte';
	import { BacklogState } from '$lib/factory/backlog-state.svelte';
	import {
		inspectorHref,
		parseExecution,
		parseTab,
		ticketPageHref,
		type InspectorState,
		type InspectorTab
	} from '$lib/factory/inspector';
	import { TicketInspectorState } from '$lib/factory/inspector-state.svelte';

	let { data }: PageProps = $props();
	let board = $derived(data.board);
	let attention = $derived(data.attention);

	const backlogState = new BacklogState();
	// The load streams the backlog; a rerun of the load seeds it again.
	$effect.pre(() => {
		backlogState.seed(data.backlog);
	});

	let summary = $derived({
		...board.summary,
		readyToStart: backlogState.readyToStart,
		readyToStartComplete: backlogState.readyToStart === null || backlogState.complete
	});

	// The selection lives only in the URL; the server load never reads it.
	// `?issue=` and `?ticket=` share one region; an issue wins if both are present.
	let selectedIssueId = $derived(page.url.searchParams.get('issue'));
	let selectedKey = $derived(selectedIssueId === null ? page.url.searchParams.get('ticket') : null);
	let selectedIssue = $derived(
		selectedIssueId === null
			? null
			: (backlogState.cards.find((card) => card.id === selectedIssueId) ?? null)
	);

	/** Select into the URL; the other selection parameter is dropped. */
	function select(param: 'ticket' | 'issue', value: string) {
		goto(`?${param}=${encodeURIComponent(value)}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: false
		});
	}

	// The Inspector reads its ticket through the endpoint, keyed by the URL's
	// ticket and execution. It never reads the lanes: a ticket that leaves them
	// keeps its open Inspector.
	const inspector = new TicketInspectorState();
	let executionParam = $derived(parseExecution(page.url.searchParams.get('execution')));
	let selectedExecution = $derived(executionParam.valid ? executionParam.execution : undefined);
	let tab = $derived(parseTab(page.url.searchParams.get('tab')));
	$effect(() => {
		if (selectedKey === null) inspector.clear();
		else if (executionParam.valid) void inspector.select(selectedKey, selectedExecution);
	});
	let inspectorView: InspectorState = $derived(
		executionParam.valid
			? inspector.view
			: { kind: 'error', title: 'Invalid execution', retryable: false }
	);
	let currentExecution = $derived(
		inspectorView.kind === 'loaded'
			? inspectorView.detail.executions.find((execution) => execution.current)?.generation
			: undefined
	);

	const INSPECTOR_HEADING = 'board-inspector-heading';
	const BOARD_HEADING = 'flow-board-heading';
	const STAY = { keepFocus: true, noScroll: true } as const;

	function chooseTab(next: InspectorTab) {
		goto(inspectorHref(page.url, { tab: next }), STAY);
	}

	function hrefForExecution(execution: number) {
		return inspectorHref(page.url, {
			execution: execution === currentExecution ? null : execution
		});
	}

	async function close() {
		const key = selectedKey;
		await goto(inspectorHref(page.url, { ticket: null, execution: null, tab: null }), STAY);
		await tick();
		const card =
			key === null
				? null
				: document.querySelector<HTMLElement>(
						`[data-slot="ticket-card"][data-ticket-key="${CSS.escape(key)}"]`
					);
		(card ?? document.getElementById(BOARD_HEADING))?.focus();
	}

	// Opening a ticket brings the Inspector heading into view only when any of it
	// is offscreen; focus stays where it was (the card). The check waits for the
	// read to settle, so it measures the heading the operator will read.
	let region: HTMLElement | undefined = $state();
	let openedKey: string | null | undefined = undefined;
	$effect(() => {
		const key = selectedKey;
		// A page loaded with ?ticket= starts where the browser put it.
		if (openedKey === undefined) openedKey = key;
		if (key === null || key === openedKey) {
			openedKey = key;
			return;
		}
		// Wait for the region to mount and the read to settle before taking the key.
		if (!region || inspectorView.kind === 'loading') return;
		const heading = document.getElementById(INSPECTOR_HEADING);
		if (!heading) return;
		openedKey = key;
		const box = heading.getBoundingClientRect();
		if (box.top < 0 || box.bottom > window.innerHeight) {
			heading.scrollIntoView({ block: 'center' });
		}
	});

	// An execution link replaces the header it lives in, so its focus would fall
	// to the body: give it to the Inspector's heading once the read settles.
	let focusHeading = $state(false);
	function onInspectorClick(event: MouseEvent) {
		const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
		if (link && link.closest('[data-execution], [data-testid="past-execution"]')) {
			focusHeading = true;
		}
	}
	$effect(() => {
		if (!focusHeading || inspectorView.kind === 'loading') return;
		focusHeading = false;
		const active = document.activeElement;
		if (active === null || active === document.body) {
			document.getElementById(INSPECTOR_HEADING)?.focus({ preventScroll: true });
		}
	});
</script>

<main class="flex flex-col gap-6">
	<section class="not-prose mt-2 flex flex-col gap-3">
		<h2 id={BOARD_HEADING} tabindex="-1" class="text-4xl font-light outline-none">Flow board</h2>
		<BoardSummary {summary} />
		<AttentionStrip
			attention={attention.ok ? attention.model : null}
			error={attention.ok ? null : attention.failure.title}
			{selectedKey}
			onselect={(key) => select('ticket', key)}
		/>
	</section>

	<section aria-label="Flow board lanes">
		<FlowBoard lanes={board.lanes} {selectedKey} onselect={(key) => select('ticket', key)}>
			{#snippet backlog()}
				<BacklogLane
					cards={backlogState.cards}
					bind:label={backlogState.label}
					fetchedAt={backlogState.fetchedAt}
					status={backlogState.status}
					failure={backlogState.reason}
					refreshing={backlogState.refreshing}
					complete={backlogState.complete}
					selectedId={selectedIssueId}
					onselect={(id) => select('issue', id)}
					onrefresh={() => backlogState.refresh()}
					onretry={() => backlogState.retry()}
				/>
			{/snippet}
		</FlowBoard>
	</section>

	<!-- One region below the board: the Issue preview for ?issue=, the ticket for ?ticket=. -->
	<div data-testid="selection" class="contents">
		{#if selectedIssueId !== null}
			<section aria-label="Selected issue" data-testid="selected-issue">
				<IssuePreview
					issue={selectedIssue}
					id={selectedIssueId}
					loading={backlogState.status === 'loading'}
				/>
			</section>
		{:else if selectedKey !== null}
			<section
				bind:this={region}
				aria-label="Selected ticket"
				data-testid="selected-ticket"
				class="flex scroll-mt-4 flex-col gap-3 bg-card p-4 md:px-8"
			>
				<!-- Execution links stay on the board: keep the scroll and focus. -->
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
					class="contents"
					onclick={onInspectorClick}
				>
					<TicketInspector
						state={inspectorView}
						{tab}
						ontabchange={chooseTab}
						{hrefForExecution}
						onclose={close}
						openHref={ticketPageHref(selectedKey, { execution: selectedExecution, tab })}
						onretry={() => inspector.retry()}
						headingId={INSPECTOR_HEADING}
					/>
				</div>
			</section>
		{/if}
	</div>
</main>
