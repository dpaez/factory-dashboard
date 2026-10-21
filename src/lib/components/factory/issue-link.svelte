<script lang="ts">
	import type { IssueLink } from '$lib/factory/backlog';

	/**
	 * A related issue (blocker or sub-issue): an external tracker link, or its
	 * display reference as mono text when the tracker gave no URL.
	 */
	let { link }: { link: IssueLink } = $props();
</script>

{#if link.url}
	<a
		href={link.url}
		target="_blank"
		rel="noopener noreferrer"
		data-slot="issue-link"
		class="min-w-0 wrap-anywhere underline outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
	>
		<span class="font-mono tabular-nums">{link.displayRef}</span>
		<span>{link.title}</span>
		<span class="sr-only">(opens in a new tab)</span>
	</a>
{:else}
	<span data-slot="issue-link" class="min-w-0 wrap-anywhere">
		<span class="font-mono tabular-nums">{link.displayRef}</span>
		<span>{link.title}</span>
	</span>
{/if}
