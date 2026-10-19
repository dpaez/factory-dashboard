<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import InfoCard from './info-card.svelte';

	const { Story } = defineMeta({
		title: 'Components/InfoCard',
		component: InfoCard,
		argTypes: {
			title: { control: 'text' },
			value: { control: 'text' },
			subtitle: { control: 'text' }
		}
	});
</script>

<Story
	name="Active tickets"
	args={{ title: 'Active', value: 4, subtitle: '12 tickets in total' }}
/>

<Story
	name="Attention"
	args={{ title: 'Attention', value: 2, subtitle: '2 executions waiting for user' }}
/>

<Story name="Zero" args={{ title: 'Attention', value: 0, subtitle: 'Nothing needs a person' }} />

<Story
	name="Large value"
	args={{ title: 'Active', value: 128_400, subtitle: 'Across 37 tickets and 52 executions' }}
/>

<Story
	name="Needs attention"
	args={{
		title: 'Needs attention',
		value: 3,
		subtitle: 'dpaez/factory-dashboard#23 · dpaez/factory-dashboard#24 · KAI-12'
	}}
/>

<Story
	name="Active agents unavailable"
	args={{ title: 'Active agents', value: '—', subtitle: 'Unavailable' }}
/>
