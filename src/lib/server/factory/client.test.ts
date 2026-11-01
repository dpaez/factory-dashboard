import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFactoryClient, factoryClientFromEnv } from './client';
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
		},
		get FACTORY_DASHBOARD_ENV_FILE() {
			return process.env.FACTORY_DASHBOARD_ENV_FILE;
		},
		get WORKSPACE_DIR() {
			return process.env.WORKSPACE_DIR;
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

const tempDirs: string[] = [];

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'factory-dashboard-env-'));
	tempDirs.push(dir);
	return dir;
}

function thrownBy(run: () => void): unknown {
	try {
		run();
		return undefined;
	} catch (error) {
		return error;
	}
}

beforeEach(() => {
	delete process.env.FACTORY_DASHBOARD_ENV_FILE;
	delete process.env.WORKSPACE_DIR;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
	delete process.env.FACTORY_OPERATOR_NAME;
	delete process.env.FACTORY_DASHBOARD_ENV_FILE;
	delete process.env.WORKSPACE_DIR;
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs.length = 0;
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

	it('reads the URL, token and operator name from the env file', async () => {
		const file = join(tempDir(), 'dashboard.env');
		writeFileSync(
			file,
			[
				'FACTORY_API_URL=http://from-file.test:7731',
				`FACTORY_API_TOKEN=${TOKEN}`,
				'FACTORY_OPERATOR_NAME=Ada'
			].join('\n')
		);
		process.env.FACTORY_DASHBOARD_ENV_FILE = file;
		const { requests, fetch } = recordingFetch();

		await factoryClientFromEnv(fetch).GET('/v1/me');

		expect(requests[0]?.url).toBe('http://from-file.test:7731/v1/me');
		expect(requests[0]?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
		expect(requests[0]?.headers.get('x-factory-on-behalf-of')).toBe('Ada');
	});

	it.each([
		[
			'FACTORY_API_URL',
			{ FACTORY_API_URL: 'http://from-env.test:7731' },
			'http://from-env.test:7731/v1/me',
			`Bearer ${TOKEN}`,
			'Ada'
		],
		[
			'FACTORY_API_TOKEN',
			{ FACTORY_API_TOKEN: 'env-token' },
			'http://from-file.test:7731/v1/me',
			'Bearer env-token',
			'Ada'
		],
		[
			'FACTORY_OPERATOR_NAME',
			{ FACTORY_OPERATOR_NAME: 'Diego' },
			'http://from-file.test:7731/v1/me',
			`Bearer ${TOKEN}`,
			'Diego'
		]
	] as const)(
		'a process %s overrides the file and leaves the other keys',
		async (_key, present, url, authorization, operator) => {
			const file = join(tempDir(), 'dashboard.env');
			writeFileSync(
				file,
				[
					'FACTORY_API_URL=http://from-file.test:7731',
					`FACTORY_API_TOKEN=${TOKEN}`,
					'FACTORY_OPERATOR_NAME=Ada'
				].join('\n')
			);
			process.env.FACTORY_DASHBOARD_ENV_FILE = file;
			Object.assign(process.env, present);
			const { requests, fetch } = recordingFetch();

			await factoryClientFromEnv(fetch).GET('/v1/me');

			expect(requests[0]?.url).toBe(url);
			expect(requests[0]?.headers.get('authorization')).toBe(authorization);
			expect(requests[0]?.headers.get('x-factory-on-behalf-of')).toBe(operator);
		}
	);

	it('ignores comments, blank lines and unknown keys', async () => {
		const file = join(tempDir(), 'dashboard.env');
		writeFileSync(
			file,
			[
				'# comment',
				'',
				'FACTORY_API_URL=http://from-file.test:7731',
				'UNKNOWN=ignored-value',
				'NOT_A_PAIR',
				`FACTORY_API_TOKEN=${TOKEN}`,
				'   # indented comment',
				'FACTORY_OPERATOR_NAME=Ada'
			].join('\n')
		);
		process.env.FACTORY_DASHBOARD_ENV_FILE = file;
		const { requests, fetch } = recordingFetch();

		await factoryClientFromEnv(fetch).GET('/v1/me');

		expect(requests[0]?.url).toBe('http://from-file.test:7731/v1/me');
		expect(requests[0]?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
		expect(requests[0]?.headers.get('x-factory-on-behalf-of')).toBe('Ada');
		const serialized = JSON.stringify({
			url: requests[0]?.url,
			authorization: requests[0]?.headers.get('authorization'),
			operator: requests[0]?.headers.get('x-factory-on-behalf-of')
		});
		expect(serialized).not.toContain('ignored-value');
	});

	it('uses the token written between two calls', async () => {
		const file = join(tempDir(), 'dashboard.env');
		writeFileSync(
			file,
			`FACTORY_API_URL=http://from-file.test:7731\nFACTORY_API_TOKEN=token-one\n`
		);
		process.env.FACTORY_DASHBOARD_ENV_FILE = file;
		const { requests, fetch } = recordingFetch();

		await factoryClientFromEnv(fetch).GET('/v1/me');
		writeFileSync(
			file,
			`FACTORY_API_URL=http://from-file.test:7731\nFACTORY_API_TOKEN=token-two\n`
		);
		await factoryClientFromEnv(fetch).GET('/v1/me');

		expect(requests.map((request) => request.headers.get('authorization'))).toEqual([
			'Bearer token-one',
			'Bearer token-two'
		]);
	});

	it('prefers FACTORY_DASHBOARD_ENV_FILE over WORKSPACE_DIR', async () => {
		const root = tempDir();
		mkdirSync(join(root, '.factory'));
		writeFileSync(
			join(root, '.factory', 'dashboard.env'),
			'FACTORY_API_URL=http://workspace.test:7731\nFACTORY_API_TOKEN=workspace-token\n'
		);
		const explicit = join(root, 'explicit.env');
		writeFileSync(
			explicit,
			'FACTORY_API_URL=http://explicit.test:7731\nFACTORY_API_TOKEN=explicit-token\n'
		);
		process.env.WORKSPACE_DIR = root;
		process.env.FACTORY_DASHBOARD_ENV_FILE = explicit;
		const { requests, fetch } = recordingFetch();

		await factoryClientFromEnv(fetch).GET('/v1/me');

		expect(requests[0]?.url).toBe('http://explicit.test:7731/v1/me');
		expect(requests[0]?.headers.get('authorization')).toBe('Bearer explicit-token');
	});

	it('reads $WORKSPACE_DIR/.factory/dashboard.env when no explicit file is set', async () => {
		const root = tempDir();
		mkdirSync(join(root, '.factory'));
		writeFileSync(
			join(root, '.factory', 'dashboard.env'),
			`FACTORY_API_URL=http://workspace.test:7731\nFACTORY_API_TOKEN=${TOKEN}\n`
		);
		process.env.WORKSPACE_DIR = root;
		const { requests, fetch } = recordingFetch();

		await factoryClientFromEnv(fetch).GET('/v1/me');

		expect(requests[0]?.url).toBe('http://workspace.test:7731/v1/me');
		expect(requests[0]?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
	});

	it('names the missing variables when the env file is missing', () => {
		const path = join(tempDir(), 'missing.env');
		process.env.FACTORY_DASHBOARD_ENV_FILE = path;
		const { requests, fetch } = recordingFetch();

		const thrown = thrownBy(() => factoryClientFromEnv(fetch));

		expect(thrown).toBeInstanceOf(FactoryApiError);
		const failure = (thrown as FactoryApiError).failure;
		expect(failure.type).toBe(CONFIGURATION_ERROR);
		expect(failure.detail).toBe(`Missing FACTORY_API_URL and FACTORY_API_TOKEN. Checked ${path}.`);
		expect(JSON.stringify(failure) + (thrown as Error).message).not.toContain('ENOENT');
		expect(requests).toHaveLength(0);
	});

	it('names the missing variables when no env file is configured', () => {
		const { requests, fetch } = recordingFetch();

		const thrown = thrownBy(() => factoryClientFromEnv(fetch));

		expect(thrown).toBeInstanceOf(FactoryApiError);
		const failure = (thrown as FactoryApiError).failure;
		expect(failure.type).toBe(CONFIGURATION_ERROR);
		expect(failure.detail).toBe('Missing FACTORY_API_URL and FACTORY_API_TOKEN.');
		expect(requests).toHaveLength(0);
	});

	it('names the missing variables when the env file path is a directory', () => {
		const path = tempDir();
		process.env.FACTORY_DASHBOARD_ENV_FILE = path;
		const { fetch } = recordingFetch();

		const thrown = thrownBy(() => factoryClientFromEnv(fetch));

		expect(thrown).toBeInstanceOf(FactoryApiError);
		const failure = (thrown as FactoryApiError).failure;
		expect(failure.detail).toBe(`Missing FACTORY_API_URL and FACTORY_API_TOKEN. Checked ${path}.`);
		const serialized = JSON.stringify(failure) + (thrown as Error).message;
		expect(serialized).not.toContain('EISDIR');
		expect(serialized).not.toContain('ENOENT');
	});

	it('does not reveal a token that the file supplied for a missing URL', () => {
		const file = join(tempDir(), 'dashboard.env');
		writeFileSync(file, `FACTORY_API_TOKEN=${TOKEN}\n`);
		process.env.FACTORY_DASHBOARD_ENV_FILE = file;

		const thrown = thrownBy(() => factoryClientFromEnv(recordingFetch().fetch));

		expect(thrown).toBeInstanceOf(FactoryApiError);
		const failure = (thrown as FactoryApiError).failure;
		expect(failure.detail).toContain('FACTORY_API_URL');
		expect(failure.detail).not.toContain(TOKEN);
		expect((thrown as Error).message).not.toContain(TOKEN);
	});
});
