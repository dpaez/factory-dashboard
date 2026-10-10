import { createColumnHelper, renderComponent } from '@tanstack/svelte-table';
import TicketsTableTitleCell from './tickets-table-title-cell.svelte';
import TicketsTableStatusCell from './tickets-table-status-cell.svelte';
import TicketsTableCostCell from './tickets-table-cost-cell.svelte';
import type { TicketsTableFeatures } from './tickets-table-features.js';
import type { ExecutionStage, ExecutionStatus, TicketListRow } from '$lib/server/types';

/** One row of the tickets table: the read module's `TicketListRow` (ADR 0004).
 *  Types only — this import is erased at runtime, so nothing from
 *  `$lib/server` reaches the client bundle. */
export type TicketTableRow = TicketListRow;
export type TicketStatus = ExecutionStatus;
export type TicketStage = ExecutionStage;

const columnHelper = createColumnHelper<TicketsTableFeatures, TicketTableRow>();

export const columns = columnHelper.columns([
	columnHelper.accessor('id', {
		header: 'ID'
	}),
	columnHelper.accessor('title', {
		header: 'Title',
		cell: ({ row }) =>
			renderComponent(TicketsTableTitleCell, {
				type: row.original.type,
				title: row.original.title
			})
	}),
	columnHelper.accessor('stage', {
		header: 'Stage'
	}),
	columnHelper.accessor('status', {
		header: 'Status',
		cell: ({ row }) =>
			renderComponent(TicketsTableStatusCell, {
				status: row.original.status
			})
	}),
	columnHelper.accessor((row) => row.costUsd, {
		id: 'cost',
		header: 'Cost',
		cell: ({ getValue }) =>
			renderComponent(TicketsTableCostCell, {
				cost: getValue() as number
			})
	})
]);
