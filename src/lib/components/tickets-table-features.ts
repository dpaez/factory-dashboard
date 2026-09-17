import {
 columnFilteringFeature,
 columnVisibilityFeature,
 createFilteredRowModel,
 createPaginatedRowModel,
 createSortedRowModel,
 filterFn_includesString,
 rowPaginationFeature,
 rowSelectionFeature,
 rowSortingFeature,
 sortFn_alphanumeric,
 sortFn_text,
 tableFeatures,
} from "@tanstack/svelte-table";
 
export const features = tableFeatures({
 columnFilteringFeature,
 columnVisibilityFeature,
 rowPaginationFeature,
 rowSelectionFeature,
 rowSortingFeature,
 filteredRowModel: createFilteredRowModel(),
 paginatedRowModel: createPaginatedRowModel(),
 sortedRowModel: createSortedRowModel(),
 filterFns: { includesString: filterFn_includesString },
 sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});
 
// Pass this as the first generic argument to `ColumnDef`, `Column`, `Table`,
// and `Row` so each type knows which feature APIs are available.
export type TicketsTableFeatures = typeof features;