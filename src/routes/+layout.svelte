<script lang="ts">
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';

	import favicon from '$lib/assets/favicon.svg';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ToggleMode from '$lib/components/toggle-mode.svelte';
	import { Factory as FactoryIcon } from '@lucide/svelte';
	import { LayoutList as LayoutListIcon } from '@lucide/svelte';
	import { ChartColumn as ChartColumnIcon } from '@lucide/svelte';
	import { Plus as PlusIcon } from '@lucide/svelte';
	import { navigating, page } from '$app/state';

	import Logo from '$lib/components/logo.svelte';
	import { cn } from '$lib/utils.js';
	import ConnectionStatus from '$lib/components/factory/connection-status.svelte';
	import CommandFeedback from '$lib/components/factory/command-feedback.svelte';
	import { LiveController, setLiveContext } from '$lib/factory/live.svelte';
	import {
		CommandCoordinator,
		setCommandContext,
		toCommandFeedbackItem
	} from '$lib/factory/commands.svelte';

	let { children, data } = $props();

	// One stream for the whole session: it survives navigation, and never runs during SSR.
	// An invalidation started during a navigation would cancel it (SvelteKit lets
	// the later one win), so a refetch waits for the operator's navigation first.
	// A navigation started during a refetch wins, and loads fresh data anyway.
	async function invalidateAfterNavigation(predicate: (url: URL) => boolean) {
		for (let i = 0; i < 5 && navigating.complete; i++) {
			await navigating.complete.catch(() => {});
		}
		await invalidate(predicate);
	}
	const live = setLiveContext(new LiveController({ invalidate: invalidateAfterNavigation }));
	// One coordinator per layout: command intents survive client navigation.
	const commands = setCommandContext(
		new CommandCoordinator({
			live,
			invalidate: (keys) => {
				const wanted = new Set(keys);
				return invalidateAfterNavigation(
					(url) => url.protocol === 'factory:' && wanted.has(url.href)
				);
			}
		})
	);
	onMount(() => {
		live.start();
		return () => {
			commands.stop();
			live.stop();
		};
	});

	const newCurrent = $derived(page.url.pathname === '/new');
	// The Flow board fills the viewport and scrolls inside its lanes.
	// Tickets and stats share that shell width so the header and nav stay one
	// width across those routes. They still scroll with the document.
	const fill = $derived(page.url.pathname === '/');
	const wide = $derived(
		fill || page.url.pathname.startsWith('/tickets') || page.url.pathname.startsWith('/stats')
	);

	const NAV = [
		{ href: '/', label: 'Flow board', icon: FactoryIcon },
		{ href: '/tickets', label: 'Tickets', icon: LayoutListIcon },
		{ href: '/stats', label: 'Stats', icon: ChartColumnIcon }
	] as const;

	/** `/` is current only on itself; any other link is current on its subtree too. */
	function isCurrent(href: string, pathname: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname === href || pathname.startsWith(`${href}/`);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Factory Dashboard</title>
</svelte:head>
<div
	class={cn(
		'mx-auto prose flex w-full flex-col overflow-hidden bg-background prose-zinc lg:prose-lg dark:prose-invert',
		fill ? 'h-dvh max-w-screen-2xl' : wide ? 'max-w-screen-2xl' : 'max-w-7xl'
	)}
>
	<div class={cn('flex min-h-0 flex-col', fill && 'h-full')}>
		<header
			class="not-prose flex flex-nowrap items-center gap-2 bg-muted px-4 py-2 md:gap-4 md:px-8 md:py-4"
		>
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<span class="shrink-0"><Logo /></span>
				<Separator orientation="vertical" class="shrink-0" />
				<h3 class="min-w-0 truncate text-2xl font-light" title={data.companyName}>
					{data.companyName}
				</h3>
			</div>
			<div class="flex min-w-0 items-center gap-4 md:shrink-0">
				<ConnectionStatus
					state={live.connectionState}
					lastRefreshAt={live.lastRefreshAt}
					onretry={() => live.retry()}
				/>
				<span class="shrink-0"><ToggleMode /></span>
			</div>
		</header>
		<CommandFeedback
			class="px-8 data-[empty=false]:py-2"
			intents={commands.intents.map(toCommandFeedbackItem)}
			notice={commands.notice}
			onretry={(id) => commands.retryDelivery(id)}
			ondismiss={(id) => commands.dismiss(id)}
		/>
		<nav
			aria-label="Primary"
			class="flex items-stretch justify-center gap-1 px-2 py-2 md:items-center md:justify-start md:gap-2 md:px-8 md:py-4"
		>
			{#each NAV as item (item.href)}
				{@const current = isCurrent(item.href, page.url.pathname)}
				<Button
					variant={current ? 'secondary' : 'outline'}
					href={item.href}
					aria-current={current ? 'page' : undefined}
					class="flex items-center max-md:h-auto max-md:min-w-0 max-md:flex-1 max-md:shrink max-md:flex-col max-md:justify-center max-md:gap-1 max-md:px-1 max-md:py-2 max-md:text-center max-md:whitespace-normal md:p-4"
					size="lg"
				>
					<item.icon class="size-4 shrink-0 max-md:m-0 md:mr-2 md:-ml-1" />
					{item.label}
				</Button>
			{/each}
			<!-- A separate action, not Beacon Yellow: the composer's Start planning is the primary one. -->
			<Button
				variant={newCurrent ? 'secondary' : 'outline'}
				href="/new"
				aria-current={newCurrent ? 'page' : undefined}
				data-testid="nav-new-ticket"
				class="flex items-center max-md:h-auto max-md:min-w-0 max-md:flex-1 max-md:shrink max-md:flex-col max-md:justify-center max-md:gap-1 max-md:px-1 max-md:py-2 max-md:text-center max-md:whitespace-normal md:ml-auto md:p-4"
				size="lg"
			>
				<PlusIcon class="size-4 shrink-0 max-md:m-0 md:mr-2 md:-ml-1" />
				New ticket
			</Button>
		</nav>
		<Separator />
		<div
			class={cn(
				'flex flex-col px-8 py-4',
				fill ? 'min-h-0 flex-1 overflow-hidden' : 'overflow-y-auto scroll-smooth'
			)}
		>
			<ModeWatcher />
			{@render children()}
		</div>
	</div>
</div>
