import { toOverview } from '$lib/factory/adapters';
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

	// One detail per open ticket, for its usage total.
	const [agents, detailReads] = await Promise.all([
		agentsRead,
		Promise.all(tickets.data.items.map((ticket) => getTicket(client, ticket.key)))
	]);

	const activeAgents = secondary(agents);
	const details = detailReads.map(secondary);
	const everyDetail = details.every((detail) => detail !== null);

	return {
		overview: toOverview({
			tickets: tickets.data.items,
			complete: tickets.data.complete,
			agents: activeAgents,
			details: everyDetail ? details.filter((detail) => detail !== null) : null
		})
	};
};
