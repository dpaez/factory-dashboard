import { createColumnHelper, renderComponent } from '@tanstack/svelte-table';
import TicketsTableTitleCell from './tickets-table-title-cell.svelte';
import TicketsTableStatusCell from './tickets-table-status-cell.svelte';
import TicketsTableCostCell from './tickets-table-cost-cell.svelte';
import type { TicketsTableFeatures } from './tickets-table-features.js';
import type { ExecutionStatus, Stage, TicketRow } from '$lib/factory/models';

/** One row of the tickets table: the browser-safe view model from `$lib/factory/models`. */
export type TicketTableRow = TicketRow;
/** The API execution status vocabulary, open to values added later. */
export type TicketStatus = ExecutionStatus;
export type TicketStage = Stage;

/** The column whose cell links to the ticket. */
export const TICKET_LINK_COLUMN = 'displayRef';

const columnHelper = createColumnHelper<TicketsTableFeatures, TicketTableRow>();

export const columns = columnHelper.columns([
	columnHelper.accessor('displayRef', {
		id: TICKET_LINK_COLUMN,
		header: 'Ticket'
	}),
	columnHelper.accessor('title', {
		header: 'Title',
		cell: ({ row }) =>
			renderComponent(TicketsTableTitleCell, { type: null, title: row.original.title })
	}),
	columnHelper.accessor('stage', {
		header: 'Stage'
	}),
	columnHelper.accessor('status', {
		header: 'Status',
		cell: ({ row }) => renderComponent(TicketsTableStatusCell, { status: row.original.status })
	}),
	columnHelper.accessor((row) => `${row.progress.done}/${row.progress.total}`, {
		id: 'progress',
		header: 'Progress'
	}),
	columnHelper.accessor((row) => row.costUsd, {
		id: 'cost',
		header: 'Cost',
		cell: ({ row }) => renderComponent(TicketsTableCostCell, { cost: row.original.costUsd })
	})
]);
