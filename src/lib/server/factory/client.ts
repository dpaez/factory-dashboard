import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const FILE_KEYS = ['FACTORY_API_URL', 'FACTORY_API_TOKEN', 'FACTORY_OPERATOR_NAME'] as const;

type FileKey = (typeof FILE_KEYS)[number];

/** A process or file value, or undefined when it is missing or only whitespace. */
function nonEmpty(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

/**
 * `FACTORY_DASHBOARD_ENV_FILE` when set, otherwise
 * `$WORKSPACE_DIR/.factory/dashboard.env`. Undefined when neither is set.
 */
function envFilePath(): string | undefined {
	const explicit = nonEmpty(env.FACTORY_DASHBOARD_ENV_FILE);
	if (explicit) return explicit;
	const workspace = nonEmpty(env.WORKSPACE_DIR);
	if (workspace) return join(workspace, '.factory', 'dashboard.env');
	return undefined;
}

function isFileKey(key: string): key is FileKey {
	return (FILE_KEYS as readonly string[]).includes(key);
}

/**
 * `KEY=VALUE` lines from `factory-up`. Blank lines, `#` comments and unknown
 * keys are ignored. No shell expansion and no quote stripping. A missing or
 * unreadable file yields no values.
 */
function readEnvFile(path: string): Partial<Record<FileKey, string>> {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		return {};
	}
	const values: Partial<Record<FileKey, string>> = {};
	for (const rawLine of text.split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq <= 0) continue;
		const key = line.slice(0, eq).trim();
		const value = line.slice(eq + 1).trim();
		if (!isFileKey(key) || !value) continue;
		values[key] = value;
	}
	return values;
}

/**
 * Build a client from `FACTORY_API_URL`, `FACTORY_API_TOKEN` and
 * `FACTORY_OPERATOR_NAME`, read now (not at import). A non-empty process
 * variable wins per key; otherwise the value comes from the env file, also
 * read now. Throws a `FactoryApiError` with a `configuration_error` failure
 * naming the missing variables, never their values.
 */
export function factoryClientFromEnv(fetch: FactoryClientOptions['fetch']): FactoryClient {
	const path = envFilePath();
	const file = path ? readEnvFile(path) : {};
	const baseUrl = nonEmpty(env.FACTORY_API_URL) ?? file.FACTORY_API_URL;
	const token = nonEmpty(env.FACTORY_API_TOKEN) ?? file.FACTORY_API_TOKEN;
	const operatorName = nonEmpty(env.FACTORY_OPERATOR_NAME) ?? file.FACTORY_OPERATOR_NAME;
	const missing = [!baseUrl && 'FACTORY_API_URL', !token && 'FACTORY_API_TOKEN'].filter(Boolean);
	if (!baseUrl || !token) {
		throw new FactoryApiError({
			status: 500,
			type: CONFIGURATION_ERROR,
			title: 'Factory API is not configured',
			detail: path
				? `Missing ${missing.join(' and ')}. Checked ${path}.`
				: `Missing ${missing.join(' and ')}.`,
			retryable: false
		});
	}
	return createFactoryClient({ baseUrl, token, fetch, operatorName });
}
