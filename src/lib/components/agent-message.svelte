<script lang="ts">
	import * as Bubble from '$lib/components/ui/bubble/index.js';
	import * as Message from '$lib/components/ui/message/index.js';

	type AgentMessageProps = {
		agentName: string;
		content: string;
		createdAt?: string;
		/** Shown above the message, such as "Latest activity". */
		label?: string;
	};

	const { agentName, content, createdAt, label }: AgentMessageProps = $props();
</script>

<div class="flex w-full flex-col font-mono">
	{#if label}
		<p class="mb-1 text-xs text-foreground/75" data-slot="agent-message-label">{label}</p>
	{/if}
	<Message.Root>
		<Message.Content>
			<Message.Header class="text-foreground/75">{agentName}</Message.Header>
			<Bubble.Root variant="tinted" class="w-full! max-w-full!">
				<Bubble.Content class="w-full font-sans">{content}</Bubble.Content>
			</Bubble.Root>
			<Message.Footer class="justify-end">
				<div>
					<span class="text-xs text-foreground/75 tabular-nums">{createdAt || ''}</span>
				</div>
			</Message.Footer>
		</Message.Content>
	</Message.Root>
</div>
