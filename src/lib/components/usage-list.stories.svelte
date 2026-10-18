<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import UsageList from './usage-list.svelte';
	// Types only — erased at runtime, the same way usage-list.svelte imports them.
	import type { TicketDetailSession, UsageTotals } from '$lib/server/types';

	const usage = (costUsd: number, input: number, output: number, read: number, write: number) =>
		({
			costUsd,
			tokensInput: input,
			tokensOutput: output,
			tokensCacheRead: read,
			tokensCacheWrite: write,
			tokensTotal: input + output + read + write
		}) satisfies UsageTotals;

	const session = (overrides: Partial<TicketDetailSession>): TicketDetailSession => ({
		id: 'session-plan-1',
		stage: 'plan',
		taskId: null,
		taskStatus: 'unknown',
		model: 'claude-opus-4',
		status: 'completed',
		contextTokens: 64_000,
		contextWindow: 200_000,
		contextPercent: 32,
		usage: usage(1.84, 42_118, 9_870, 310_442, 18_204),
		...overrides
	});

	const populated: TicketDetailSession[] = [
		session({ id: 'session-plan-1' }),
		session({
			id: 'session-work-01',
			stage: 'work',
			taskId: '01',
			taskStatus: 'done',
			contextPercent: 71,
			usage: usage(6.12, 128_904, 31_552, 1_204_512, 96_880)
		}),
		session({
			id: 'session-work-02',
			stage: 'work',
			taskId: '02',
			taskStatus: 'working',
			status: 'open',
			contextPercent: 18,
			usage: usage(0.42, 9_310, 2_004, 61_002, 4_480)
		}),
		session({
			id: 'session-review-01',
			stage: 'review',
			taskId: '01',
			taskStatus: 'reviewing',
			model: 'gpt-5',
			contextPercent: 44,
			usage: usage(0.97, 22_604, 4_118, 88_120, 0)
		}),
		session({
			id: 'session-wrapup-1',
			stage: 'wrapup',
			taskId: null,
			taskStatus: 'unknown',
			contextPercent: 9,
			usage: usage(0.21, 5_402, 1_390, 30_877, 2_210)
		})
	];

	const { Story } = defineMeta({
		title: 'Components/UsageList',
		component: UsageList
	});
</script>

<Story name="Sessions across stages" args={{ sessions: populated }} />

<Story
	name="Session without usage"
	args={{
		sessions: [
			session({
				id: 'session-work-03',
				stage: 'work',
				taskId: '03',
				taskStatus: 'pending',
				status: 'prepared',
				contextTokens: null,
				contextWindow: null,
				contextPercent: 0,
				usage: null
			})
		]
	}}
/>

<Story
	name="Context not reported"
	args={{
		sessions: [
			session({
				id: 'session-work-04',
				stage: 'work',
				taskId: '04',
				taskStatus: 'blocked',
				status: 'open',
				contextTokens: null,
				contextWindow: null,
				contextPercent: null
			})
		]
	}}
/>

<Story
	name="Unknown task status"
	args={{ sessions: [session({ id: 'session-plan-2', taskId: null, taskStatus: 'unknown' })] }}
/>

<Story name="No sessions" args={{ sessions: [] }} />
