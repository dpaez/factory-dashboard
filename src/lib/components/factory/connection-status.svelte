<script lang="ts">
	import type { Component } from 'svelte';
	import { KeyRound, Loader, Radio, RefreshCw, Unplug } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import StatusBadge from './status-badge.svelte';
	import { connectionStateSignal } from '$lib/factory/status';
	import { formatTimestamp, UNAVAILABLE } from '$lib/factory/format';
	import type { ConnectionState } from '$lib/factory/live';

	/**
	 * The header's view of the factory event stream (DESIGN.md → Signal strip).
	 * Presentational: the live controller owns the state. Authentication failed
	 * and Disconnected differ in label, icon and explanation, not colour alone.
	 */
	let {
		state,
		lastRefreshAt,
		onretry
	}: {
		state: ConnectionState;
		/** ISO time the last refetch settled; null when there has been none. */
		lastRefreshAt: string | null;
		/** Restarts the stream; no Retry control without it. */
		onretry?: () => void;
	} = $props();

	const icons: Record<ConnectionState, Component> = {
		connecting: Loader,
		live: Radio,
		reconnecting: RefreshCw,
		disconnected: Unplug,
		auth_failed: KeyRound
	};

	const explanations: Partial<Record<ConnectionState, string>> = {
		disconnected: 'The event stream stopped. Data may be out of date.',
		auth_failed: "The factory refused the dashboard's token."
	};

	const signal = $derived(connectionStateSignal(state));
	const Icon = $derived(icons[state]);
	const explanation = $derived(explanations[state]);
	const refreshed = $derived(lastRefreshAt == null ? UNAVAILABLE : formatTimestamp(lastRefreshAt));
	const canRetry = $derived(
		onretry != null && (state === 'disconnected' || state === 'auth_failed')
	);
</script>

<div
	data-slot="connection-status"
	data-state={state}
	class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground"
>
	<div data-slot="connection-state" aria-live="polite" class="flex items-center gap-2">
		<Icon class="size-3.5 shrink-0" aria-hidden="true" />
		<StatusBadge {...signal} />
		{#if explanation}
			<span data-slot="connection-explanation">{explanation}</span>
		{/if}
	</div>
	{#if state !== 'live'}
		<span data-slot="last-refresh" class="flex items-center gap-1">
			<span>Last refresh</span>
			{#if lastRefreshAt != null && refreshed !== UNAVAILABLE}
				<time datetime={lastRefreshAt} class="font-mono tabular-nums">{refreshed}</time>
			{:else}
				<span>Unavailable</span>
			{/if}
		</span>
	{/if}
	{#if canRetry}
		<Button variant="outline" size="sm" onclick={onretry}>Retry</Button>
	{/if}
</div>
