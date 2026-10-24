<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { PanelFailure } from './panel-state';

	/**
	 * The loading skeleton or the safe failure every stats panel shares. A
	 * failure shows its title only: no upstream URL, Problem detail, or body.
	 */
	let {
		state: view,
		onretry
	}: {
		state: { kind: 'loading' } | ({ kind: 'error' } & PanelFailure);
		/** Retries the failed read; no Retry control without it or when not retryable. */
		onretry?: () => void;
	} = $props();
</script>

{#if view.kind === 'loading'}
	<div aria-hidden="true" class="flex flex-col gap-2" data-slot="stats-skeleton">
		<div class="h-4 w-48 animate-pulse bg-muted motion-reduce:animate-none"></div>
		<div class="h-4 w-72 animate-pulse bg-muted motion-reduce:animate-none"></div>
		<div class="h-4 w-32 animate-pulse bg-muted motion-reduce:animate-none"></div>
	</div>
	<p class="sr-only">Loading…</p>
{:else}
	<div class="flex flex-col gap-2" data-slot="stats-panel-error" role="status">
		<p class="text-sm font-light" data-testid="panel-error-title">{view.title}</p>
		<p class="font-mono text-foreground/75">
			This panel could not be read. Other panels are unaffected.
		</p>
		{#if view.retryable && onretry}
			<div>
				<Button variant="secondary" onclick={onretry}>Retry</Button>
			</div>
		{/if}
	</div>
{/if}
