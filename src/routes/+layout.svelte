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
	import ConnectionStatus from '$lib/components/factory/connection-status.svelte';
	import CommandFeedback from '$lib/components/factory/command-feedback.svelte';
	import { LiveController, setLiveContext } from '$lib/factory/live.svelte';
	import {
		CommandCoordinator,
		setCommandContext,
		toCommandFeedbackItem
	} from '$lib/factory/commands.svelte';

	let { children } = $props();
	let companyName = 'Chan';

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
	class="mx-auto prose flex max-w-7xl flex-col overflow-hidden bg-background prose-zinc lg:prose-lg dark:prose-invert"
>
	<div class="flex flex-col">
		<header class="not-prose flex items-center justify-between gap-2 bg-muted px-8 py-4">
			<div class="flex items-center gap-2">
				<Logo />
				<Separator orientation="vertical" />
				<h3 class="text-2xl font-light">{companyName}</h3>
			</div>
			<div class="flex items-center gap-4">
				<ConnectionStatus
					state={live.connectionState}
					lastRefreshAt={live.lastRefreshAt}
					onretry={() => live.retry()}
				/>
				<ToggleMode />
			</div>
		</header>
		<CommandFeedback
			class="px-8 data-[empty=false]:py-2"
			intents={commands.intents.map(toCommandFeedbackItem)}
			notice={commands.notice}
			onretry={(id) => commands.retryDelivery(id)}
			ondismiss={(id) => commands.dismiss(id)}
		/>
		<nav aria-label="Primary" class="flex items-center justify-start gap-2 px-8 py-4">
			{#each NAV as item (item.href)}
				{@const current = isCurrent(item.href, page.url.pathname)}
				<Button
					variant={current ? 'secondary' : 'outline'}
					href={item.href}
					aria-current={current ? 'page' : undefined}
					class="flex items-center p-4"
					size="lg"
				>
					<item.icon class="mr-2 -ml-1 size-4" />
					{item.label}
				</Button>
			{/each}
			<!-- A separate action, not Beacon Yellow: the composer's Start planning is the primary one. -->
			<Button
				variant={newCurrent ? 'secondary' : 'outline'}
				href="/new"
				aria-current={newCurrent ? 'page' : undefined}
				data-testid="nav-new-ticket"
				class="ml-auto flex items-center p-4"
				size="lg"
			>
				<PlusIcon class="mr-2 -ml-1 size-4" />
				New ticket
			</Button>
		</nav>
		<Separator />
		<div class="flex flex-col overflow-y-auto scroll-smooth px-8 py-4">
			<ModeWatcher />
			{@render children()}
		</div>
	</div>
</div>
