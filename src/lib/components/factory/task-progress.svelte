<script lang="ts">
	import { Progress } from '$lib/components/ui/progress/index.js';
	import type { TicketProgress } from '$lib/factory/models';

	/**
	 * Approved tasks over planned tasks. Without a denominator there is no bar
	 * and no percentage: a plan execution reads "Planning tasks", any other
	 * stage reads "No tasks".
	 */
	let { progress, stage }: { progress: Pick<TicketProgress, 'done' | 'total'>; stage: string } =
		$props();

	const known = $derived(progress.total > 0);
</script>

<div data-slot="task-progress" class="flex min-w-0 flex-col gap-1">
	{#if known}
		<p class="font-mono text-[0.625rem] text-foreground/75 tabular-nums">
			{progress.done}/{progress.total} approved
		</p>
		<Progress
			value={progress.done}
			max={progress.total}
			aria-label="{progress.done} of {progress.total} tasks approved"
		/>
	{:else}
		<p class="text-[0.625rem] text-foreground/75">
			{stage === 'plan' ? 'Planning tasks' : 'No tasks'}
		</p>
	{/if}
</div>
