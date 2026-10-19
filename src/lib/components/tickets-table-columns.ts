import { createColumnHelper, renderComponent } from '@tanstack/svelte-table';
import TicketsTableTitleCell from './tickets-table-title-cell.svelte';
import TicketsTableStatusCell from './tickets-table-status-cell.svelte';
import TicketsTableCostCell from './tickets-table-cost-cell.svelte';
import type { TicketsTableFeatures } from './tickets-table-features.js';
import type { ExecutionStage, TicketListRow } from '$lib/server/types';
import type { components } from '$lib/factory/generated/factory-api';

/** One row of the tickets table: the read module's `TicketListRow` (ADR 0004).
 *  Types only — this import is erased at runtime, so nothing from
 *  `$lib/server` reaches the client bundle. */
export type TicketTableRow = TicketListRow;
/** The API execution vocabulary; identical to the SQLite one (plan.md → Discoveries). */
export type TicketStatus = components['schemas']['TicketSummary']['status'];
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
