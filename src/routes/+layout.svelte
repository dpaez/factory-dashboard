<script lang="ts">
	import './layout.css';
	import { ModeWatcher } from "mode-watcher";

	import favicon from '$lib/assets/favicon.svg';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Button from "$lib/components/ui/button/button.svelte";
	import ToggleMode from "$lib/components/toggle-mode.svelte";
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
<div class="flex flex-col mx-auto max-w-7xl overflow-hidden bg-background prose prose-zinc dark:prose-invert lg:prose-lg">
	<div class="flex flex-col">
		<header class="flex bg-muted px-8 py-4 justify-between items-center not-prose gap-2 ">
			<div class="flex items-center gap-2">
				<Logo /> <Separator orientation="vertical" /> <h3 class="text-2xl font-light">{companyName}</h3>
			</div>
			<ToggleMode />
		</header>
		<nav class="flex px-8 justify-start items-center gap-2 py-4">
			<Button variant="outline" href="/" class="flex items-center p-4" size="lg">
				<FactoryIcon class="size-4 -ml-1 mr-2" /> Main
			</Button>
			<Button variant="outline" href="/tickets" class="flex items-center p-4" size="lg">
				<LayoutListIcon class="size-4 -ml-1 mr-2" /> Tickets
			</Button>
		</nav>
		<Separator />
		<div class="flex flex-col px-8 py-4 scroll-smooth overflow-y-auto">
			<ModeWatcher />
			{@render children()}
		</div>
	</div>
</div>

