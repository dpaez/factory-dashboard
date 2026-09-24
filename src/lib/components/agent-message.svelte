<script lang="ts">
  import * as Bubble from "$lib/components/ui/bubble/index.js";
  import * as Message from "$lib/components/ui/message/index.js";

  type AgentMessageProps = {
    agentName: string;
    content: string;
    createdAt?: string;
  }

  const { agentName, content, createdAt }: AgentMessageProps = $props();
</script>
 
<div class="flex font-mono w-full flex-col">
  <Message.Root>
    <Message.Content>
      <Message.Header>{agentName}</Message.Header>
      <Bubble.Root variant="tinted" class="w-full! max-w-full!">
        <Bubble.Content class="w-full font-sans" >{content}</Bubble.Content>
      </Bubble.Root>
      <Message.Footer class="justify-end">
        <div>
          <span class="tabular-nums text-xs">{createdAt || ''}</span>
        </div>
      </Message.Footer>
    </Message.Content>
  </Message.Root>
</div>