import { createColumnHelper, renderComponent } from "@tanstack/svelte-table";
import TicketsTableTitleCell from "./tickets-table-title-cell.svelte";
import TicketsTableStatusCell from "./tickets-table-status-cell.svelte";
import TicketsTableCostCell from "./tickets-table-cost-cell.svelte";
import type { TicketsTableFeatures } from "./tickets-table-features.js";
import type { tickets, usage } from "$lib/db/drizzle/schema";

export type TicketRow = typeof tickets.$inferSelect;
export type UsageRow = typeof usage.$inferSelect;
export type TicketStatus = TicketRow["status"];
export type TicketStage = TicketRow["stage"];

/** Shape returned by `db.query.tickets.findMany({ with: { usages: true } })` */
export type TicketTableRow = TicketRow & {
	usages: UsageRow[];
};

const columnHelper = createColumnHelper<TicketsTableFeatures, TicketTableRow>();

export const columns = columnHelper.columns([
	columnHelper.accessor("id", {
		header: "ID",
	}),
	columnHelper.accessor("title", {
		header: "Title",
		cell: ({ row }) =>
			renderComponent(TicketsTableTitleCell, {
				type: row.original.type,
				title: row.original.title,
			}),
	}),
	columnHelper.accessor("stage", {
		header: "Stage",
	}),
	columnHelper.accessor("status", {
		header: "Status",
		cell: ({ row }) =>
			renderComponent(TicketsTableStatusCell, {
				status: row.original.status,
			}),
	}),
	columnHelper.accessor((row) => row.usages.reduce((sum, entry) => sum + entry.costUsd, 0), {
		id: "cost",
		header: "Cost",
		cell: ({ getValue }) =>
			renderComponent(TicketsTableCostCell, {
				cost: getValue() as number,
			}),
	}),
]);
