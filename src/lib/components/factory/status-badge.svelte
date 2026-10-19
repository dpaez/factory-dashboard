<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Signal, StatusSignal } from '$lib/factory/status';

	/**
	 * DESIGN.md → Status Badges: a mono pill whose label is always visible text,
	 * toned by one of the five `--signal-*` tokens with Two-Ink foreground.
	 * Callers map status vocabulary through `$lib/factory/status`.
	 */
	let { label, signal, class: className }: StatusSignal & { class?: string } = $props();

	// Literal class names so Tailwind generates every tone.
	const toneClasses: Record<Signal, string> = {
		run: 'bg-signal-run text-signal-run-foreground',
		wait: 'bg-signal-wait text-signal-wait-foreground',
		standby: 'bg-signal-standby text-signal-standby-foreground',
		fault: 'bg-signal-fault text-signal-fault-foreground',
		clear: 'bg-signal-clear text-signal-clear-foreground'
	};
</script>

<span
	data-slot="status-badge"
	data-signal={signal}
	class={cn(
		'inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-full px-2 py-0.5 font-mono text-[0.625rem] font-medium whitespace-nowrap',
		toneClasses[signal],
		className
	)}>{label}</span
>
