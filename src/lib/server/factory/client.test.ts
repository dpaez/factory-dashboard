import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFactoryClient } from './client';
import { CONFIGURATION_ERROR, FactoryApiError } from './errors';

// In `serve` mode (which vitest uses), `$env/dynamic/private` is a snapshot
// taken at config load, so the mock exposes live getters instead.
vi.mock('$env/dynamic/private', () => ({
	env: {
		get FACTORY_API_URL() {
			return process.env.FACTORY_API_URL;
		},
		get FACTORY_API_TOKEN() {
			return process.env.FACTORY_API_TOKEN;
		},
		get FACTORY_OPERATOR_NAME() {
			return process.env.FACTORY_OPERATOR_NAME;
		}
	}
}));

const TOKEN = 'secret-token-abc123';

function recordingFetch() {
	const requests: Request[] = [];
	const fetch = async (request: Request) => {
		requests.push(request);
		return new Response(JSON.stringify({ name: 'dashboard', onBehalfOf: null }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	};
	return { requests, fetch };
}

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
	delete process.env.FACTORY_OPERATOR_NAME;
});

describe('createFactoryClient', () => {
	it('sends the bearer token on every request', async () => {
		const { requests, fetch } = recordingFetch();
		const client = createFactoryClient({ baseUrl: 'http://127.0.0.1:7731', token: TOKEN, fetch });

		await client.GET('/v1/me');
		await client.GET('/v1/tickets', { params: { query: { limit: 5 } } });
		await client.GET('/v1/agents');

		expect(requests).toHaveLength(3);
		for (const request of requests) {
			expect(request.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
		}
	});

	it.each([
		['without a trailing slash', 'http://127.0.0.1:7731'],
		['with a trailing slash', 'http://127.0.0.1:7731/']
	])('builds /v1 URLs from a base URL %s', async (_label, baseUrl) => {
		const { requests, fetch } = recordingFetch();
		const client = createFactoryClient({ baseUrl, token: TOKEN, fetch });

		await client.GET('/v1/me');
		await client.GET('/v1/tickets/{key}', { params: { path: { key: 'dpaez/repo#1' } } });

		expect(requests.map((r) => r.url)).toEqual([
			'http://127.0.0.1:7731/v1/me',
			'http://127.0.0.1:7731/v1/tickets/dpaez%2Frepo%231'
		]);
	});

	it('sends x-factory-on-behalf-of when operatorName is set', async () => {
		const { requests, fetch } = recordingFetch();
		const client = createFactoryClient({
			baseUrl: 'http://127.0.0.1:7731',
			token: TOKEN,
			fetch,
			operatorName: 'Diego'
		});

		await client.GET('/v1/me');

		expect(requests[0]?.headers.get('x-factory-on-behalf-of')).toBe('Diego');
	});

	it.each([
		['unset', undefined],
		['empty', ''],
		['blank', '   ']
	])('omits x-factory-on-behalf-of when operatorName is %s', async (_label, operatorName) => {
		const { requests, fetch } = recordingFetch();
		const client = createFactoryClient({
			baseUrl: 'http://127.0.0.1:7731',
			token: TOKEN,
			fetch,
			operatorName
		});

		await client.GET('/v1/me');

		expect(requests[0]?.headers.has('x-factory-on-behalf-of')).toBe(false);
	});
});

describe('factoryClientFromEnv', () => {
	it('reads the URL, token and operator name at call time', async () => {
		// Imported before the env is populated: nothing is read at import.
		const { factoryClientFromEnv } = await import('./client');
		process.env.FACTORY_API_URL = 'http://factory.test:9000/';
		process.env.FACTORY_API_TOKEN = TOKEN;
		process.env.FACTORY_OPERATOR_NAME = 'Diego';
		const { requests, fetch } = recordingFetch();

		await factoryClientFromEnv(fetch).GET('/v1/me');

		expect(requests[0]?.url).toBe('http://factory.test:9000/v1/me');
		expect(requests[0]?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
		expect(requests[0]?.headers.get('x-factory-on-behalf-of')).toBe('Diego');
	});

	it('omits on-behalf-of when FACTORY_OPERATOR_NAME is unset', async () => {
		const { factoryClientFromEnv } = await import('./client');
		process.env.FACTORY_API_URL = 'http://factory.test:9000';
		process.env.FACTORY_API_TOKEN = TOKEN;
		const { requests, fetch } = recordingFetch();

		await factoryClientFromEnv(fetch).GET('/v1/me');

		expect(requests[0]?.headers.has('x-factory-on-behalf-of')).toBe(false);
	});

	it.each([
		['FACTORY_API_URL', { FACTORY_API_TOKEN: TOKEN }],
		['FACTORY_API_TOKEN', { FACTORY_API_URL: 'http://factory.test:9000' }],
		['FACTORY_API_URL and FACTORY_API_TOKEN', {}]
	])(
		'throws a configuration failure naming %s without revealing values',
		async (missing, present: Record<string, string>) => {
			const { factoryClientFromEnv } = await import('./client');
			Object.assign(process.env, present);
			const { requests, fetch } = recordingFetch();

			let thrown: unknown;
			try {
				factoryClientFromEnv(fetch);
			} catch (error) {
				thrown = error;
			}

			expect(thrown).toBeInstanceOf(FactoryApiError);
			const failure = (thrown as FactoryApiError).failure;
			expect(failure.type).toBe(CONFIGURATION_ERROR);
			expect(failure.retryable).toBe(false);
			expect(failure.detail).toContain(missing);
			const serialized = JSON.stringify(failure) + (thrown as Error).message;
			expect(serialized).not.toContain(TOKEN);
			expect(serialized).not.toContain('factory.test');
			expect(requests).toHaveLength(0);
		}
	);
});
