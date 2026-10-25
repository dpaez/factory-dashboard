<script lang="ts">
	import { page } from '$app/state';

	import Separator from '$lib/components/ui/separator/separator.svelte';

	type Copy = { heading: string; explanation: string | null };

	const kind = $derived(page.error?.kind);

	const copy = $derived.by((): Copy => {
		if (kind === 'configuration') {
			return {
				heading: 'The dashboard cannot reach the factory with its configuration',
				explanation: null
			};
		}
		if (kind === 'not_found' || page.status === 404) {
			if (page.error?.message === 'No such execution in this ticket') {
				return {
					heading: 'No such execution in this ticket',
					explanation:
						'The ticket has no execution that started at this time. The current execution is not shown in its place.'
				};
			}
			return {
				heading:
					page.error?.message === 'No such execution' ? 'No such execution' : 'No such ticket',
				explanation: 'Check the ticket key, or the execution number in the address.'
			};
		}
		if (kind === 'invalid') {
			return {
				heading: 'The request is not valid',
				explanation: 'Check the address. An execution number must be a positive whole number.'
			};
		}
		return {
			heading: 'The factory server is unreachable or answered unexpectedly',
			explanation:
				'The dashboard reads factory state only from the factory server. Check that it is running, then reload.'
		};
	});

	const detail = $derived(page.error?.detail);
</script>

<div class="not-prose flex flex-col gap-4 py-8">
	<p class="font-mono text-xs font-light tracking-widest text-muted-foreground uppercase">
		Error <span class="tabular-nums">{page.status}</span>
	</p>
	<h1 class="text-3xl font-light">{copy.heading}</h1>
	<Separator />
	{#if kind === 'configuration'}
		<p class="max-w-3xl text-sm text-muted-foreground">
			Check <span class="font-mono">FACTORY_API_URL</span> and
			<span class="font-mono">FACTORY_API_TOKEN</span>. The token needs the
			<span class="font-mono">read</span> and <span class="font-mono">act</span> scopes.
		</p>
	{:else}
		{#if kind === undefined && page.error?.message}
			<p class="max-w-3xl font-mono text-sm break-words text-destructive tabular-nums">
				{page.error.message}
			</p>
		{/if}
		{#if copy.explanation}
			<p class="max-w-3xl text-sm text-muted-foreground">{copy.explanation}</p>
		{/if}
	{/if}
	{#if detail}
		<p class="max-w-3xl font-mono text-sm break-words text-destructive tabular-nums">{detail}</p>
	{/if}
</div>
