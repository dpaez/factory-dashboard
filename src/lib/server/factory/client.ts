import createClient, { type Client } from 'openapi-fetch';
import { env } from '$env/dynamic/private';

import type { paths } from '$lib/factory/generated/factory-api';

import { CONFIGURATION_ERROR, FactoryApiError } from './errors';

export type FactoryClient = Client<paths>;

export type FactoryClientOptions = {
	/** Factory server origin, without `/v1`. A trailing `/` is ignored. */
	baseUrl: string;
	token: string;
	/** SvelteKit's request-scoped `fetch` (or a fake in tests). */
	fetch: (input: Request) => Promise<Response>;
	/** Sent as `x-factory-on-behalf-of` when non-empty. */
	operatorName?: string;
};

/** Build a request-scoped typed client. Never construct one at module scope. */
export function createFactoryClient(options: FactoryClientOptions): FactoryClient {
	const { token, fetch } = options;
	const operatorName = options.operatorName?.trim();
	const client = createClient<paths>({
		baseUrl: options.baseUrl.replace(/\/+$/, ''),
		fetch
	});

	client.use({
		onRequest({ request }) {
			request.headers.set('authorization', `Bearer ${token}`);
			if (operatorName) request.headers.set('x-factory-on-behalf-of', operatorName);
			return request;
		}
	});

	return client;
}

/**
 * Build a client from `FACTORY_API_URL`, `FACTORY_API_TOKEN` and
 * `FACTORY_OPERATOR_NAME`, read now (not at import). Throws a
 * `FactoryApiError` with a `configuration_error` failure naming the missing
 * variables, never their values.
 */
export function factoryClientFromEnv(fetch: FactoryClientOptions['fetch']): FactoryClient {
	const baseUrl = env.FACTORY_API_URL;
	const token = env.FACTORY_API_TOKEN;
	const missing = [!baseUrl && 'FACTORY_API_URL', !token && 'FACTORY_API_TOKEN'].filter(Boolean);
	if (!baseUrl || !token) {
		throw new FactoryApiError({
			status: 500,
			type: CONFIGURATION_ERROR,
			title: 'Factory API is not configured',
			detail: `Missing ${missing.join(' and ')}.`,
			retryable: false
		});
	}
	return createFactoryClient({ baseUrl, token, fetch, operatorName: env.FACTORY_OPERATOR_NAME });
}
