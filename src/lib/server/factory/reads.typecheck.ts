/*
 * Compile-time contract tests. Never executed: `pnpm check` type-checks this
 * file, and each `@ts-expect-error` fails the check as an unused directive if
 * the call below it stops being a type error.
 */
import type { FactoryClient } from './client';
import { getTicket, listTickets } from './reads';

export async function contractTypeTests(client: FactoryClient) {
	// @ts-expect-error a misspelled path is not in the contract
	await client.GET('/v1/tickts');

	// @ts-expect-error the `key` path param is required
	await client.GET('/v1/tickets/{key}', { params: { path: {} } });

	// @ts-expect-error `qa2` is not a ticket stage
	await listTickets(client, { stage: 'qa2' });

	// @ts-expect-error `stages` is not a query field
	await listTickets(client, { stages: ['qa'] });

	// @ts-expect-error `needsUser` is the string "true" | "false", not a boolean
	await listTickets(client, { needsUser: true });

	const result = await getTicket(client, 'dpaez-factory-dashboard-17-e32797ab');
	if (result.ok) {
		// @ts-expect-error `TicketDetail` has no `assignee`
		void result.data.assignee;
	}
}
