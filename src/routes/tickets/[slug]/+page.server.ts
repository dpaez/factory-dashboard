import { db } from '$lib/server/client';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  console.log({params});
	const ticket = await db.query.tickets.findFirst({
		where: { id: params.slug},
		with: { usages: true, blockers: true, tasks: true }
	});
	
	console.log({ticket});

	if (!ticket) {
		throw error(404, 'Ticket not found');
	}

	return { ticket };
};
