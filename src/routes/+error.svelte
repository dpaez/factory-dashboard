<script lang="ts">
	import { page } from '$app/state';

	import Separator from '$lib/components/ui/separator/separator.svelte';
</script>

<div class="not-prose flex flex-col gap-4 py-8">
	<p class="font-mono text-xs font-light tracking-widest text-muted-foreground uppercase">
		Error <span class="tabular-nums">{page.status}</span>
	</p>
	<h1 class="text-3xl font-light">The dashboard could not report factory state</h1>
	<Separator />
	<p class="max-w-3xl font-mono text-sm break-words text-destructive tabular-nums">
		{page.error?.message ?? 'Unknown error'}
	</p>
	<p class="max-w-3xl text-sm text-muted-foreground">
		Check <span class="font-mono">DB_URL</span> and the state of the factory database. The dashboard opens
		it read-only and never modifies factory state.
	</p>
</div>
