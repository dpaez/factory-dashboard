<script lang="ts">
	import type { PageProps } from './$types';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import Timeline from '$lib/components/timeline.svelte';
	import AgentMessage from '$lib/components/agent-message.svelte';
	import LightCard from '$lib/components/light-card.svelte';
	import UsageList from '$lib/components/usage-list.svelte';
	import type { TaskStatus } from '$lib/components/tasks-table-status-cell.svelte';

	const { data }: PageProps = $props();
	const ticket = $derived(data.ticket);

	const steps = ['plan', 'work', 'review', 'wrapup', 'done'];
	const currentStep = $derived(steps.indexOf(ticket.stage.toLowerCase()) + 1);
	const totalSteps = steps.length;

	// for each task, get the status and title
	const taskCompletionStatus = $derived(
		ticket.tasks.map((task) => ({
			title: task.taskId,
			status: task.status,
			stage: ticket.stage
		}))
	);

	// get the blockers from the tickets
	const blockers = $derived(
		ticket.blockers.map((blocker) => ({
			description: blocker.reason,
			since: blocker.since,
			task: blocker.task
		}))
	);

	// get the last review round verdict
	const lastReviewRound = $derived(
		ticket.tasks.reduce((max, task) => Math.max(max, task.reviewRound ?? 0), 0)
	);
	const reviewVerdict = $derived(
		ticket.tasks.find((task) => task.reviewRound === lastReviewRound)?.reviewVerdict
	);
	const inputUsage = $derived(ticket.usages.reduce((sum, usage) => sum + usage.tokensInput, 0));
	const outputUsage = $derived(ticket.usages.reduce((sum, usage) => sum + usage.tokensOutput, 0));

	const getTaskStatus = (task: string | null): TaskStatus => {
		if (!task) return 'unknown';
		const taskStatus = ticket.tasks.find((t) => t.taskId === task)?.status ?? 'unknown';
		return taskStatus as TaskStatus;
	};
</script>

<main class="flex flex-col gap-6 pb-8">
	<section>
		<div class="mt-2 mb-8 flex items-start justify-between">
			<div class="flex flex-col">
				<h2 class="not-prose text-4xl font-light">Ticket Detail</h2>
				<p class="not-prose mt-2 text-sm font-extralight text-muted-foreground">
					Operational state, sessions, and task handoff
				</p>
			</div>
		</div>
	</section>
	<section class="flex flex-col gap-6 bg-card p-4 md:px-8">
		<div class="mb-4 flex flex-col gap-4 md:mb-6 md:flex-row md:items-start md:justify-between">
			<h3 class="not-prose text-2xl font-light">
				<pre class="font-mono whitespace-pre-wrap tabular-nums">{ticket.title}</pre>
			</h3>
			<Badge variant="outline" class="mt-1 h-auto px-4 py-1 font-mono tabular-nums [&>svg]:size-4!">
				{ticket.type}
			</Badge>
		</div>
		<div class="flex max-w-5xl flex-col gap-6">
			<div class="flex flex-col gap-6">
				<Timeline {steps} {currentStep} {totalSteps} />

				{#if ticket.message}
					<AgentMessage
						agentName="Last Message"
						content={ticket.message}
						createdAt={ticket.messageAt ?? undefined}
					/>
				{:else}
					<AgentMessage agentName="Last Message" content="No message yet" />
				{/if}
			</div>
			<div class="grid grid-cols-2 gap-x-2 gap-y-4">
				<LightCard title="Task Status">
					{#snippet content()}
						{#each taskCompletionStatus as task}
							<div class="flex items-center justify-between">
								<p class="font-mono text-xs tabular-nums">{task.title}</p>
								<Separator
									class="mt-2 max-w-[20%] border-t border-dashed border-accent-foreground bg-transparent md:max-w-[50%] lg:max-w-[70%]"
								/>
								<p class="font-mono text-xs tabular-nums">{task.status}</p>
							</div>
						{/each}
					{/snippet}
				</LightCard>
				<LightCard title="Review" content={`${reviewVerdict} (${lastReviewRound} rounds)`} />
				<LightCard title="Recorded Usage">
					{#snippet content()}
						<div class="flex flex-col items-start justify-between">
							<p class="font-mono text-xs tabular-nums">Input: {inputUsage}</p>
							<p class="font-mono text-xs tabular-nums">Output: {outputUsage}</p>
						</div>
					{/snippet}
				</LightCard>
				<LightCard title="Blocker">
					{#snippet content()}
						{#each blockers as blocker}
							<div class="flex items-center justify-between">
								<p class="font-mono text-xs tabular-nums">{blocker.description}</p>
								<p class="font-mono text-xs tabular-nums">Since: {blocker.since}</p>
								<p class="font-mono text-xs tabular-nums">Related Task: {blocker.task}</p>
							</div>
						{:else}
							<p class="font-mono text-xs tabular-nums">No blockers</p>
						{/each}
					{/snippet}
				</LightCard>
			</div>
		</div>
	</section>
	<section class="flex flex-col gap-6 bg-card p-4 md:px-8">
		<h3 class="not-prose text-2xl font-light">Usage breakdown</h3>
		<UsageList
			tasks={ticket.usages
				.map((usage) => ({
					id: usage.sessionId,
					stage: usage.stage,
					task: usage.task ?? '--',
					model: usage.model ?? '--',
					usage: {
						input: usage.tokensInput ?? 0,
						output: usage.tokensOutput ?? 0,
						cacheRead: usage.tokensCacheRead,
						cacheWrite: usage.tokensCacheWrite
					},
					status: getTaskStatus(usage.task),
					createdAt: usage.recordedAt
				}))
				.sort((a, b) => steps.indexOf(a.stage) - steps.indexOf(b.stage))}
		/>
	</section>
</main>
