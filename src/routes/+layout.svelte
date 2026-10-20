<script lang="ts">
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';

	import favicon from '$lib/assets/favicon.svg';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ToggleMode from '$lib/components/toggle-mode.svelte';
	import { Factory as FactoryIcon } from '@lucide/svelte';
	import { LayoutList as LayoutListIcon } from '@lucide/svelte';
	import { ChartColumn as ChartColumnIcon } from '@lucide/svelte';
	import { page } from '$app/state';

	import Logo from '$lib/components/logo.svelte';

	let { children } = $props();
	let companyName = 'Chan';

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
			<ToggleMode />
		</header>
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
			<!-- TODO(#30): the New ticket button goes here once the composer exists. -->
		</nav>
		<Separator />
		<div class="flex flex-col overflow-y-auto scroll-smooth px-8 py-4">
			<ModeWatcher />
			{@render children()}
		</div>
	</div>
</div>
