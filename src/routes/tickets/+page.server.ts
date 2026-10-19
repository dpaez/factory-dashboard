import { toTicketList } from '$lib/factory/adapters';
import { factoryClientFromEnv, type FactoryClient } from '$lib/server/factory/client';
import { listAllTickets, throwPageError } from '$lib/server/factory/pages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	let client: FactoryClient;
	try {
		client = factoryClientFromEnv(fetch);
	} catch (cause) {
		throwPageError(cause);
	}

	const tickets = await listAllTickets(client, { status: 'all' });
	if (!tickets.ok) throwPageError(tickets.failure);

	return { tickets: toTicketList(tickets.data) };
};
