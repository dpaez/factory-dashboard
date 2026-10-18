<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import InfoCostCard from './info-cost-card.svelte';

	const { Story } = defineMeta({
		title: 'Components/InfoCostCard',
		component: InfoCostCard
	});
</script>

<Story
	name="Default"
	args={{
		title: 'Cost',
		value: 12.48,
		tokensInputUsage: 182_340,
		tokensOutputUsage: 41_207,
		tokensCacheRead: 1_204_512,
		tokensCacheWrite: 96_880
	}}
/>

<Story
	name="Zero tokens"
	args={{
		title: 'Cost',
		value: 0,
		tokensInputUsage: 0,
		tokensOutputUsage: 0,
		tokensCacheRead: 0,
		tokensCacheWrite: 0
	}}
/>

<Story
	name="Large cost"
	args={{
		title: 'Cost',
		value: 1843.7,
		tokensInputUsage: 48_210_993,
		tokensOutputUsage: 9_604_118,
		tokensCacheRead: 310_440_201,
		tokensCacheWrite: 22_017_664
	}}
/>
