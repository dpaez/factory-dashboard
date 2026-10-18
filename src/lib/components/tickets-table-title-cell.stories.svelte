<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TicketsTableTitleCell from './tickets-table-title-cell.svelte';

	const { Story } = defineMeta({
		title: 'Components/TicketsTable/TitleCell',
		component: TicketsTableTitleCell
	});
</script>

<Story
	name="With type"
	args={{ type: 'feature', title: 'Storybook for isolated component development' }}
/>

<Story
	name="Without type"
	args={{ type: null, title: 'Show the current execution on the ticket page' }}
/>

<Story name="Missing title" args={{ type: 'bug', title: null }} />
