import { toBoard } from '$lib/factory/board';
import { factoryClientFromEnv, type FactoryClient } from '$lib/server/factory/client';
import { isConfigurationFailure, listAllTickets, throwPageError } from '$lib/server/factory/pages';
import { getTicket, listAgents, type FactoryResult } from '$lib/server/factory/reads';
import type { PageServerLoad } from './$types';

/**
 * A secondary read's data, or null when it failed. Auth and configuration
 * failures still become the page-level configuration error.
 */
function secondary<T>(result: FactoryResult<T>): T | null {
	if (result.ok) return result.data;
	if (isConfigurationFailure(result.failure)) throwPageError(result.failure);
	return null;
}

/**
 * The Flow board. The selected ticket (`?ticket=`) lives in the page, not
 * here: this load never reads `url.search*`, so selecting a card does not
 * refetch the board.
 */
export const load: PageServerLoad = async ({ fetch }) => {
	let client: FactoryClient;
	try {
		client = factoryClientFromEnv(fetch);
	} catch (cause) {
		throwPageError(cause);
	}

	// Agents do not depend on the ticket list: read them alongside it.
	const agentsRead = listAgents(client);
	const tickets = await listAllTickets(client, { status: 'open' });
	if (!tickets.ok) throwPageError(tickets.failure);

	// One detail per open ticket, for its card's cost. A failed read blanks only that card.
	const [agents, detailReads] = await Promise.all([
		agentsRead,
		Promise.all(tickets.data.items.map((ticket) => getTicket(client, ticket.key)))
	]);

	return {
		board: toBoard({
			tickets: tickets.data.items,
			complete: tickets.data.complete,
			agents: secondary(agents),
			details: detailReads.map(secondary)
		})
	};
};
