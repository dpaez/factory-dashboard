<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import InfoCostCard from './info-cost-card.svelte';
	import { ticketDetailActiveInWork } from '$lib/factory/fixtures';

	const usage = ticketDetailActiveInWork.usage;

	const { Story } = defineMeta({
		title: 'Components/InfoCostCard',
		component: InfoCostCard
	});
</script>

<Story
	name="Default"
	args={{
		title: 'Cost · open tickets',
		subtitle: 'Current execution of each open ticket',
		value: usage.costUsd,
		tokensInputUsage: usage.tokensInput,
		tokensOutputUsage: usage.tokensOutput,
		tokensCacheRead: usage.tokensCacheRead,
		tokensCacheWrite: usage.tokensCacheWrite
	}}
/>

<Story
	name="Zero tokens"
	args={{
		title: 'Cost · open tickets',
		subtitle: 'no open tickets',
		value: 0,
		tokensInputUsage: 0,
		tokensOutputUsage: 0,
		tokensCacheRead: 0,
		tokensCacheWrite: 0
	}}
/>

<Story
	name="Unavailable"
	args={{
		title: 'Cost · open tickets',
		subtitle: 'Unavailable: not every open ticket could be read',
		value: null,
		tokensInputUsage: null,
		tokensOutputUsage: null,
		tokensCacheRead: null,
		tokensCacheWrite: null
	}}
/>

<Story
	name="Large cost"
	args={{
		title: 'Cost · open tickets',
		subtitle: 'Current execution of each open ticket',
		value: 1843.7,
		tokensInputUsage: 48_210_993,
		tokensOutputUsage: 9_604_118,
		tokensCacheRead: 310_440_201,
		tokensCacheWrite: 22_017_664
	}}
/>
