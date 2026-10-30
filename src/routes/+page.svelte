<script lang="ts">
	import type { PageProps } from './$types';

	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import AttentionStrip from '$lib/components/factory/attention-strip.svelte';
	import BacklogLane from '$lib/components/factory/backlog-lane.svelte';
	import BoardDrawer from '$lib/components/factory/board-drawer.svelte';
	import BoardSummary from '$lib/components/factory/board-summary.svelte';
	import FlowBoard from '$lib/components/factory/flow-board.svelte';
	import IssuePreview from '$lib/components/factory/issue-preview.svelte';
	import TicketCommands from '$lib/components/factory/ticket-commands.svelte';
	import TicketInspector from '$lib/components/factory/ticket-inspector.svelte';
	import type { BacklogCardModel } from '$lib/factory/backlog';
	import { BacklogState } from '$lib/factory/backlog-state.svelte';
	import type { StartState } from '$lib/components/factory/start-control.svelte';
	import type { CommandPhase } from '$lib/factory/commands';
	import { getCommandContext } from '$lib/factory/commands.svelte';
	import {
		startAvailability,
		startFailureMessage,
		startTargetFor,
		visibleBacklog
	} from '$lib/factory/start';
	import { runsKey, ticketKey } from '$lib/factory/events';
	import {
		inspectorHref,
		parseExecution,
		parseRun,
		parseTab,
		ticketPageHref,
		type InspectorState,
		type InspectorTab
	} from '$lib/factory/inspector';
	import { TicketInspectorState } from '$lib/factory/inspector-state.svelte';
	import { RunDetailState } from '$lib/factory/run-detail-state.svelte';
	import { getLiveContext, invalidates } from '$lib/factory/live.svelte';

	let { data }: PageProps = $props();
	let board = $derived(data.board);
	let attention = $derived(data.attention);

	const backlogState = new BacklogState();
	// The load streams the backlog; a rerun of the load seeds it again.
	$effect.pre(() => {
		backlogState.seed(data.backlog);
	});

	// Start goes through the layout's coordinator: one action is one intent.
	const coordinator = getCommandContext();
	const startIntentFor = (card: Pick<BacklogCardModel, 'displayRef'>) =>
		coordinator?.intentFor(startTargetFor(card));

	let boardCards = $derived(board.lanes.flatMap((lane) => lane.cards));
	let boardKeys = $derived(new Set(boardCards.map((card) => card.key)));
	// A backlog issue that is a board ticket, by id or by its accepted start's key, is
	// shown once: as the ticket. The backlog read may still list it (tracker cache).
	let backlogCards = $derived(
		visibleBacklog(backlogState.cards, {
			ticketIds: boardCards.map((card) => card.id),
			hiddenIds: backlogState.cards
				.filter((card) => {
					const ticket = startIntentFor(card)?.accepted?.ticket;
					return ticket !== undefined && boardKeys.has(ticket);
				})
				.map((card) => card.id)
		})
	);

	let summary = $derived({
		...board.summary,
		readyToStart:
			backlogState.readyToStart === null
				? null
				: backlogCards.filter((card) => card.availability.kind === 'ready').length,
		readyToStartComplete: backlogState.readyToStart === null || backlogState.complete
	});

	/** One issue's Start: availability, the phase of its start and a failure's message. */
	function startFor(card: BacklogCardModel): StartState | undefined {
		if (!coordinator) return undefined;
		const intent = startIntentFor(card);
		const phase: CommandPhase = intent?.phase ?? 'idle';
		const explanation =
			intent && (phase === 'rejected' || phase === 'unconfirmed')
				? startFailureMessage(intent, 'ref').message
				: null;
		return {
			start: startAvailability({ card, access: coordinator.access, phase }),
			phase,
			explanation
		};
	}

	function onstart(card: BacklogCardModel) {
		startedRefs[card.id] = card.displayRef;
		coordinator?.submit(
			{ command: 'start', ref: card.displayRef },
			{ label: `Start ${card.displayRef}` }
		);
	}

	/** An unconfirmed start is resent under the same intent id, never started again. */
	function onresend(card: BacklogCardModel) {
		const intent = startIntentFor(card);
		if (intent) coordinator?.retryDelivery(intent.id);
	}

	// The selection lives only in the URL; the server load never reads it.
	// `?issue=` and `?ticket=` share one region; an issue wins if both are present.
	let selectedIssueId = $derived(page.url.searchParams.get('issue'));
	let selectedKey = $derived(selectedIssueId === null ? page.url.searchParams.get('ticket') : null);
	let selectedIssue = $derived(
		selectedIssueId === null
			? null
			: (backlogState.cards.find((card) => card.id === selectedIssueId) ?? null)
	);

	// The ref each issue was started with, so the handoff finds its intent after a
	// backlog read no longer lists the issue.
	const startedRefs: Record<string, string> = $state({});
	let selectedStart = $derived.by(() => {
		if (selectedIssueId === null) return undefined;
		const ref = selectedIssue?.displayRef ?? startedRefs[selectedIssueId];
		return ref === undefined ? undefined : startIntentFor({ displayRef: ref });
	});

	let previewStart = $derived(selectedIssue ? startFor(selectedIssue) : undefined);

	// Handoff: once a read lists the selected issue's started ticket, or its start
	// is confirmed (an already finished ticket: the inspector's read confirms it),
	// the same region shows that ticket. Derived from intent state and the board, so
	// a selection moved elsewhere is left alone.
	let handedOff: string | null = null;
	$effect(() => {
		const intent = selectedStart;
		const ticket = intent?.accepted?.ticket;
		if (!intent || ticket === undefined || handedOff === intent.id) return;
		if (intent.phase !== 'confirmed' && !(intent.phase === 'accepted' && boardKeys.has(ticket))) {
			return;
		}
		handedOff = intent.id;
		goto(`?ticket=${encodeURIComponent(ticket)}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	});

	/** Select into the URL; the other selection parameter is dropped. */
	function select(param: 'ticket' | 'issue', value: string) {
		// Only the selection parameter survives: execution, tab and run are cleared.
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
	let selectedRun = $derived(parseRun(page.url.searchParams.get('run')));
	// Run detail, read lazily by the Inspector and cached per (execution, run).
	const runDetail = new RunDetailState();
	$effect(() => {
		if (selectedKey === null) inspector.clear();
		else if (executionParam.valid) void inspector.select(selectedKey, selectedExecution);
	});
	// The Inspector reads through its own endpoint, not the load: an event naming
	// the selected ticket rereads it quietly, and one naming its runs makes the
	// cached run detail stale. The backlog is reseeded by the load rerun above.
	const live = getLiveContext();
	$effect(() => {
		if (!live) return;
		return live.onInvalidate((invalidation) => {
			const key = selectedKey;
			if (key === null) return;
			if (invalidates(invalidation, runsKey(key))) runDetail.markStale();
			if (invalidates(invalidation, ticketKey(key))) void inspector.refresh();
		});
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
	const PREVIEW_HEADING = 'board-issue-heading';
	const BOARD_HEADING = 'flow-board-heading';
	const STAY = { keepFocus: true, noScroll: true } as const;
	const drawerOpen = $derived(selectedIssueId !== null || selectedKey !== null);

	function chooseTab(next: InspectorTab) {
		goto(inspectorHref(page.url, { tab: next }), STAY);
	}

	// Choosing a run pushes a history entry and keeps focus on the run's row.
	function chooseRun(id: string | null) {
		goto(inspectorHref(page.url, { run: id }), STAY);
	}

	// Another execution is another run list: its links drop the selected run.
	function hrefForExecution(execution: number) {
		return inspectorHref(page.url, {
			execution: execution === currentExecution ? null : execution,
			run: null
		});
	}

	async function close() {
		const key = selectedKey;
		await goto(
			inspectorHref(page.url, { ticket: null, execution: null, tab: null, run: null }),
			STAY
		);
		await tick();
		focusCard(
			key === null ? null : `[data-slot="ticket-card"][data-ticket-key="${CSS.escape(key)}"]`
		);
	}

	async function closeIssue() {
		const id = selectedIssueId;
		const search = new URLSearchParams(page.url.search);
		search.delete('issue');
		const query = search.toString();
		await goto(`${page.url.pathname}${query ? `?${query}` : ''}`, STAY);
		await tick();
		focusCard(
			id === null ? null : `[data-slot="backlog-card-button"][data-issue-id="${CSS.escape(id)}"]`
		);
	}

	function focusCard(selector: string | null) {
		const card = selector === null ? null : document.querySelector<HTMLElement>(selector);
		(card ?? document.getElementById(BOARD_HEADING))?.focus();
	}

	// Bring the selected card into view inside its own lane.
	$effect(() => {
		const key = selectedKey;
		const issueId = selectedIssueId;
		if (key === null && issueId === null) return;
		const selector =
			key !== null
				? `[data-slot="ticket-card"][data-ticket-key="${CSS.escape(key)}"]`
				: `[data-slot="backlog-card-button"][data-issue-id="${CSS.escape(issueId!)}"]`;
		let cancelled = false;
		void tick().then(() => {
			if (cancelled) return;
			document.querySelector(selector)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
		});
		return () => {
			cancelled = true;
		};
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

<main class="flex min-h-0 flex-1 flex-col gap-3">
	<section class="not-prose flex shrink-0 flex-col gap-2 md:gap-3">
		<div
			class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 md:items-end md:gap-x-8 md:gap-y-3"
		>
			<h2 id={BOARD_HEADING} tabindex="-1" class="text-xl font-light outline-none md:text-2xl">
				Flow board
			</h2>
			<BoardSummary {summary} />
		</div>
		<AttentionStrip
			attention={attention.ok ? attention.model : null}
			error={attention.ok ? null : attention.failure.title}
			{selectedKey}
			onselect={(key) => select('ticket', key)}
		/>
	</section>

	<section aria-label="Flow board lanes" class="relative min-h-0 flex-1 overflow-hidden">
		<div class="absolute inset-0 overflow-y-auto lg:overflow-hidden">
			<FlowBoard lanes={board.lanes} {selectedKey} onselect={(key) => select('ticket', key)}>
				{#snippet backlog()}
					<BacklogLane
						cards={backlogCards}
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
						startFor={coordinator ? startFor : undefined}
						{onstart}
						{onresend}
					/>
				{/snippet}
			</FlowBoard>
		</div>

		<BoardDrawer
			open={drawerOpen}
			labelledBy={selectedIssueId !== null ? PREVIEW_HEADING : INSPECTOR_HEADING}
			scrollKey={selectedIssueId ?? selectedKey ?? ''}
			onclose={selectedIssueId !== null ? closeIssue : close}
		>
			<div data-testid="selection" class="contents">
				{#if selectedIssueId !== null}
					<section aria-label="Selected issue" data-testid="selected-issue">
						<IssuePreview
							issue={selectedIssue}
							id={selectedIssueId}
							loading={backlogState.status === 'loading'}
							start={previewStart?.start}
							phase={previewStart?.phase}
							explanation={previewStart?.explanation}
							{onstart}
							{onresend}
							onclose={closeIssue}
							headingId={PREVIEW_HEADING}
						/>
					</section>
				{:else if selectedKey !== null}
					<section
						aria-label="Selected ticket"
						data-testid="selected-ticket"
						class="flex flex-col gap-3 p-4 md:px-6"
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
								run={selectedRun}
								onrunchange={chooseRun}
								{runDetail}
								{hrefForExecution}
								onclose={close}
								openHref={ticketPageHref(selectedKey, {
									execution: selectedExecution,
									tab,
									run: selectedRun
								})}
								onretry={() => inspector.retry()}
								headingId={INSPECTOR_HEADING}
							>
								{#snippet commands(detail)}
									<TicketCommands {detail} onreread={() => void inspector.refresh()} />
								{/snippet}
							</TicketInspector>
						</div>
					</section>
				{/if}
			</div>
		</BoardDrawer>
	</section>
</main>
