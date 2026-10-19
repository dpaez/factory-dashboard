<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TicketAttention from './ticket-attention.svelte';
	import { toAttention } from '$lib/factory/adapters';
	import {
		ticketDetailActiveInQa,
		ticketDetailAgentQuestion,
		ticketDetailManualApproval
	} from '$lib/factory/fixtures';

	const manyReplies = toAttention([
		{
			...ticketDetailManualApproval.attention[0]!,
			replies: Array.from({ length: 6 }, (_, i) => ({
				actor: i % 2 === 0 ? { client: 'dashboard', onBehalfOf: 'Diego' } : null,
				answer: `Reply ${i + 1}: keep going, but check the reconnect path again.`,
				createdAt: `2026-10-14T0${i}:00:00Z`,
				current: i === 5,
				version: i + 1
			}))
		}
	]);

	const { Story } = defineMeta({
		title: 'Components/TicketDetail/Attention',
		component: TicketAttention,
		parameters: {
			docs: {
				description: {
					component:
						'Attention requests, open first, with replies (answer, actor, time, current marker). Questions keep whitespace and scroll sideways. Loading and error states: N/A: the page loads the data.'
				}
			}
		}
	});
</script>

<Story
	name="Open and resolved with a table question"
	args={{ attention: toAttention(ticketDetailActiveInQa.attention) }}
/>

<Story
	name="Agent questions"
	args={{ attention: toAttention(ticketDetailAgentQuestion.attention) }}
/>

<Story name="Many replies" args={{ attention: manyReplies }} />

<Story name="No attention" args={{ attention: [] }} />
