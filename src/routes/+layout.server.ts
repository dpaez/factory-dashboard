import { factoryClientFromEnv } from '$lib/server/factory/client';
import { getFactory } from '$lib/server/factory/reads';
import type { LayoutServerLoad } from './$types';

/**
 * The header name is FACTORY.json `name` from `GET /v1/factory`. An unset name
 * is null, and a failed read (including a missing configuration) must not
 * throw: this is the root layout, so a throw would replace the app instead of
 * letting the page show its own error. Both become an empty string.
 */
export const load = (async ({ fetch }) => {
	try {
		const factory = await getFactory(factoryClientFromEnv(fetch));
		return { companyName: factory.ok ? (factory.data.name ?? '') : '' };
	} catch {
		return { companyName: '' };
	}
}) satisfies LayoutServerLoad;
