<script lang="ts">
	import { type ColumnDef, createTable, FlexRender } from '@tanstack/svelte-table';
	import * as Table from '$lib/components/ui/table/index.js';

	import { TICKET_LINK_COLUMN, type TicketTableRow } from './tickets-table-columns.js';
	import { features, type TicketsTableFeatures } from './tickets-table-features.js';
	import { goto } from '$app/navigation';

	type TicketsTableProps = {
		columns: ColumnDef<TicketsTableFeatures, TicketTableRow>[];
		data: TicketTableRow[];
	};

	let { data, columns }: TicketsTableProps = $props();

	const table = createTable({
		features,
		getRowId: (row) => row.key,
		get data() {
			return data;
		},
		get columns() {
			return columns;
		}
	});

	// Ticket keys are opaque: always encode them.
	const hrefFor = (row: TicketTableRow) => `/tickets/${encodeURIComponent(row.key)}`;

	// The ticket cell holds the real link (keyboard and middle-click work). A
	// click elsewhere on the row follows the same link, for pointer users.
	function onRowClick(event: MouseEvent, row: TicketTableRow) {
		if ((event.target as Element | null)?.closest('a')) return;
		goto(hrefFor(row));
	}
</script>

<div class="font-mono text-xs md:text-sm">
	<Table.Root class="my-0! table-auto border-spacing-2 border lg:border-spacing-4">
		<Table.Header>
			{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<Table.Row>
					{#each headerGroup.headers as header (header.id)}
						<Table.Head
							colspan={header.colSpan}
							class="sticky top-0 bg-accent p-4! font-sans font-extrabold tracking-wide {header.id ===
							'cost'
								? 'hidden lg:table-cell'
								: ''}"
						>
							{#if !header.isPlaceholder}
								<FlexRender {header} />
							{/if}
						</Table.Head>
					{/each}
				</Table.Row>
			{/each}
		</Table.Header>
		<Table.Body>
			{#each table.getRowModel().rows as row (row.id)}
				<Table.Row
					data-state={row.getIsSelected() && 'selected'}
					data-ticket-key={row.original.key}
					class="cursor-pointer"
					onclick={(event: MouseEvent) => onRowClick(event, row.original)}
				>
					{#each row.getVisibleCells() as cell (cell.id)}
						<Table.Cell
							class="p-4! break-words whitespace-normal {cell.column.id === 'cost'
								? 'hidden lg:table-cell'
								: ''}"
						>
							{#if cell.column.id === TICKET_LINK_COLUMN}
								<a
									href={hrefFor(row.original)}
									class="font-medium whitespace-nowrap text-foreground underline-offset-4 hover:underline focus-visible:underline"
									>{row.original.displayRef}</a
								>
							{:else}
								<FlexRender {cell} />
							{/if}
						</Table.Cell>
					{/each}
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={columns.length} class="h-24 text-center">No tickets.</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
