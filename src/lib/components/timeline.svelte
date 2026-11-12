<script lang="ts">
	import { cubicInOut } from 'svelte/easing';
	import { untrack } from 'svelte';
	import { prefersReducedMotion, Tween } from 'svelte/motion';

	import { cn } from '$lib/utils';
	import { Progress } from '$lib/components/ui/progress';
	type TimelineProps = {
		steps: string[];
		currentStep: number;
		totalSteps: number;
		/** The progress bar's accessible name. */
		label?: string;
	};
	const { steps, currentStep, totalSteps, label }: TimelineProps = $props();
	const value = $derived((currentStep / totalSteps) * 100);
	// The first render shows the current step as is. Only a later move forward
	// animates (800ms), and not under reduced motion; a move back (a ticket
	// returned to an earlier stage) jumps there at once.
	const tween = new Tween(
		untrack(() => value),
		{ duration: 800, easing: cubicInOut }
	);
	$effect(() => {
		const back = value < untrack(() => tween.target);
		tween.set(value, back || prefersReducedMotion.current ? { duration: 0 } : undefined);
	});
</script>

<div class="flex w-full flex-col gap-2">
	<Progress
		class="overflow-hidden **:data-[slot=progress-indicator]:transition-none"
		aria-label={label}
		value={Math.round(tween.current)}
		max={100}
	/>
	<div class="relative -mt-4.5 h-10 w-full">
		{#each steps as step, index}
			{@const t = index / (steps.length - 1)}
			{@const isFirst = index === 0}
			{@const isLast = index === steps.length - 1}
			{@const reached = t === 0 ? tween.current > 0 : tween.current >= t * 100}

			<div
				class="absolute flex flex-col {isFirst
					? 'items-start'
					: isLast
						? 'items-end'
						: 'items-center'}"
				style="left: {t * 100}%; transform: translateX({isFirst ? '0' : isLast ? '-100%' : '-50%'})"
			>
				<div class={cn('size-4 rounded-full', reached ? 'bg-primary' : 'bg-muted')}></div>
				<p class="not-prose mt-1 text-xs text-foreground/75 capitalize">{step}</p>
			</div>
		{/each}
	</div>
</div>
