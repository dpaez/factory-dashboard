<script lang="ts">
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';

	import favicon from '$lib/assets/favicon.svg';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ToggleMode from '$lib/components/toggle-mode.svelte';
	import { Factory as FactoryIcon } from '@lucide/svelte';
	import { LayoutList as LayoutListIcon } from '@lucide/svelte';

	import Logo from '$lib/components/logo.svelte';

	let { children } = $props();
	let companyName = 'Chan';
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
		<nav class="flex items-center justify-start gap-2 px-8 py-4">
			<Button variant="outline" href="/" class="flex items-center p-4" size="lg">
				<FactoryIcon class="mr-2 -ml-1 size-4" /> Main
			</Button>
			<Button variant="outline" href="/tickets" class="flex items-center p-4" size="lg">
				<LayoutListIcon class="mr-2 -ml-1 size-4" /> Tickets
			</Button>
		</nav>
		<Separator />
		<div class="flex flex-col overflow-y-auto scroll-smooth px-8 py-4">
			<ModeWatcher />
			{@render children()}
		</div>
	</div>
</div>
