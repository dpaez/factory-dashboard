import { getDb } from '$lib/server/client';
import { throwKitError } from '$lib/server/db';
import { getOverview, getTicketList } from '$lib/server/read';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const { db } = getDb();
		const [overview, tickets] = await Promise.all([getOverview(db), getTicketList(db)]);
		return { overview, tickets };
	} catch (cause) {
		throwKitError(cause);
	}
};
