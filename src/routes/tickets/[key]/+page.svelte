<script lang="ts">
	import type { PageProps } from './$types';

	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import TicketInspector from '$lib/components/factory/ticket-inspector.svelte';
	import {
		parseTab,
		ticketPageHref,
		type InspectorState,
		type InspectorTab
	} from '$lib/factory/inspector';

	// The load reads `?execution` only; the tab is presentation and lives in the URL.
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
	const shownExecution = $derived(header.current ? null : header.execution);

	function chooseTab(next: InspectorTab) {
		goto(ticketPageHref(header.key, { execution: shownExecution, tab: next }), {
			keepFocus: true,
			noScroll: true,
			replaceState: false
		});
	}

	function hrefForExecution(execution: number) {
		return ticketPageHref(header.key, {
			execution: execution === currentExecution ? null : execution,
			tab
		});
	}
</script>

<main class="flex flex-col gap-6 pb-8">
	<section class="mt-2 bg-card p-4 md:px-8">
		<TicketInspector state={view} {tab} ontabchange={chooseTab} {hrefForExecution} />
	</section>
</main>
