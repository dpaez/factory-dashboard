<script lang="ts">
	import { actorText, formatTimestamp, words } from '$lib/factory/format';
	import type { AttentionView } from '$lib/factory/models';

	/**
	 * Attention requests with their replies; open requests come first, the
	 * rest keep API order. A question can be a long multi-line table, so it
	 * keeps its whitespace in mono and scrolls sideways.
	 */
	let { attention }: { attention: AttentionView[] } = $props();

	const ordered = $derived([
		...attention.filter((request) => request.status === 'open'),
		...attention.filter((request) => request.status !== 'open')
	]);
</script>

<div class="flex flex-col gap-4 font-mono text-xs font-light tabular-nums" data-testid="attention">
	{#each ordered as request (request.id)}
		<div class="flex min-w-0 flex-col gap-2" data-attention={request.id}>
			<p class="text-foreground/75">
				{words(request.kind)} · <span data-testid="attention-status">{words(request.status)}</span>
			</p>
			<pre
				class="overflow-x-auto bg-background/60 p-2 font-mono text-xs whitespace-pre">{request.question}</pre>
			{#if request.replies.length > 0}
				<ol class="flex flex-col gap-1 border-l border-border pl-3">
					{#each request.replies as reply, index (index)}
						<li class="flex flex-col gap-0.5" data-reply-current={reply.current}>
							<p class="whitespace-pre-wrap">{reply.answer}</p>
							<p class="text-foreground/75">
								{actorText(reply.actor)} · {formatTimestamp(reply.createdAt)}
								{#if reply.current}· <span class="text-foreground">current</span>{/if}
							</p>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="text-foreground/75">No replies yet.</p>
			{/if}
		</div>
	{:else}
		<p class="text-foreground/75">No attention requests.</p>
	{/each}
</div>
