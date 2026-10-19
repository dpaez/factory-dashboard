<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import LightCard from './light-card.svelte';

	const { Story } = defineMeta({
		title: 'Components/LightCard',
		component: LightCard
	});
</script>

{#snippet branchContent()}
	<a href="#branch" class="underline">factory/dpaez-factory-dashboard-18-a86f419e</a>
{/snippet}

<Story name="String content" args={{ title: 'Stage', content: 'work · task 02' }} />

<Story name="Snippet content" asChild>
	<div class="w-80">
		<LightCard title="Branch" content={branchContent} />
	</div>
</Story>
