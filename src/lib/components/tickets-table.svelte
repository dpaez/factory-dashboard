<script lang="ts" generics="TData extends RowData">
  import {
    type ColumnDef,
    type RowData,
    createTable,
    FlexRender,
} from "@tanstack/svelte-table";
  import * as Table from "$lib/components/ui/table/index.js";

  import type { TicketTableRow } from "./tickets-table-columns.js";
  import { features, type TicketsTableFeatures } from "./tickets-table-features.js";
  import { goto } from "$app/navigation";

  type TicketsTableProps = {
  columns: ColumnDef<TicketsTableFeatures, TicketTableRow>[];
  data: TicketTableRow[];
  };

  let { data, columns }: TicketsTableProps = $props();

  const table = createTable({
  features,
  get data() {
    return data;
  },
  get columns() {
    return columns;
  },
  });
  </script>

  <div class="font-mono text-xs md:text-sm">
  <Table.Root class="border my-0! table-auto border-spacing-2 lg:border-spacing-4">
  <Table.Header>
    {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
    <Table.Row>
      {#each headerGroup.headers as header (header.id)}
      <Table.Head
        colspan={header.colSpan}
        class="sticky top-0 bg-accent font-sans p-4! font-extrabold tracking-wide {header.id === 'cost' ? 'hidden lg:table-cell' : ''}"
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
    <Table.Row data-state={row.getIsSelected() && "selected"} onclick={() => goto(`/tickets/${row.original.id}`)}>
      {#each row.getVisibleCells() as cell (cell.id)}
      <Table.Cell class="p-4! {cell.column.id === 'cost' ? 'hidden lg:table-cell' : ''}">
        <FlexRender {cell} />
      </Table.Cell>
      {/each}
    </Table.Row>
    {:else}
    <Table.Row>
      <Table.Cell colspan={columns.length} class="h-24 text-center">
      No results.
      </Table.Cell>
    </Table.Row>
    {/each}
  </Table.Body>
  </Table.Root>
</div>