<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TicketsTableCostCell from './tickets-table-cost-cell.svelte';

	const { Story } = defineMeta({
		title: 'Components/TicketsTable/CostCell',
		component: TicketsTableCostCell,
		argTypes: { cost: { control: 'number' } }
	});
</script>

<Story name="Zero" args={{ cost: 0 }} />

<Story name="Small" args={{ cost: 0.37 }} />

<Story name="Large" args={{ cost: 1843.7 }} />
