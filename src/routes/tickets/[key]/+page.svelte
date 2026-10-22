<script lang="ts">
	import type { PageProps } from './$types';

	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import TicketInspector from '$lib/components/factory/ticket-inspector.svelte';
	import {
		parseRun,
		parseTab,
		ticketPageHref,
		type InspectorState,
		type InspectorTab
	} from '$lib/factory/inspector';
	import { RunDetailState } from '$lib/factory/run-detail-state.svelte';

	// The load reads `?execution` only; the tab and the run are presentation and live in the URL.
	const { data }: PageProps = $props();
	const detail = $derived(data.detail);
	const header = $derived(detail.header);
	const view: InspectorState = $derived({
		kind: 'loaded',
		detail,
		runsComplete: data.runsComplete
	});
	const tab = $derived(parseTab(page.url.searchParams.get('tab')));
	const currentExecution = $derived(
		detail.executions.find((execution) => execution.current)?.generation
	);
	const run = $derived(parseRun(page.url.searchParams.get('run')));
	const shownExecution = $derived(header.current ? null : header.execution);
	// Run detail, read lazily by the Inspector and cached per (execution, run).
	const runDetail = new RunDetailState();
	const STAY = { keepFocus: true, noScroll: true, replaceState: false } as const;

	function chooseTab(next: InspectorTab) {
		goto(ticketPageHref(header.key, { execution: shownExecution, tab: next, run }), STAY);
	}

	// Choosing a run pushes a history entry and keeps focus on the run's row.
	function chooseRun(id: string | null) {
		goto(ticketPageHref(header.key, { execution: shownExecution, tab, run: id }), STAY);
	}

	// Another execution is another run list: its links drop the selected run.
	function hrefForExecution(execution: number) {
		return ticketPageHref(header.key, {
			execution: execution === currentExecution ? null : execution,
			tab
		});
	}
</script>

<main class="flex flex-col gap-6 pb-8">
	<section class="mt-2 bg-card p-4 md:px-8">
		<TicketInspector
			state={view}
			{tab}
			ontabchange={chooseTab}
			{run}
			onrunchange={chooseRun}
			{runDetail}
			{hrefForExecution}
		/>
	</section>
</main>
