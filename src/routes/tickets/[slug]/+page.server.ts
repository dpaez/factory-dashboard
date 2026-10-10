import { error } from '@sveltejs/kit';

import { getDb } from '$lib/server/client';
import { throwKitError } from '$lib/server/db';
import { getTicketDetail } from '$lib/server/read';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const { db } = getDb();
		// The route param is `slug`, but the value is an opaque ticket id that
		// may contain colons; it is passed through verbatim, never parsed.
		const detail = await getTicketDetail(db, params.slug);
		if (detail === null) {
			throw error(404, `No ticket with id ${params.slug}`);
		}
		return { detail };
	} catch (cause) {
		throwKitError(cause);
	}
};
