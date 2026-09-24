import { db } from '$lib/server/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const tickets = await db.query.tickets.findMany({
		with: { usages: true }
	});

	return { tickets };
};
