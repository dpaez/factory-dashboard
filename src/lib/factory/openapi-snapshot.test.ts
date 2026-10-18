import { describe, expect, it } from 'vitest';
import {
	OpenApiSnapshotError,
	fetchOpenApiDocument,
	formatSnapshot,
	resolveBaseUrl,
	validateOpenApiDocument,
	validateOpenApiResponse
} from '../../../scripts/lib/openapi-snapshot.mjs';

const validDoc = {
	openapi: '3.1.0',
	info: { title: 'Factory API', version: '1.0.0' },
	paths: { '/v1/tickets': { get: {} } }
};

const json = (body: string, status = 200, contentType: string | null = 'application/json') => ({
	status,
	contentType,
	body
});

describe('resolveBaseUrl', () => {
	it('strips trailing slashes', () => {
		expect(resolveBaseUrl('http://127.0.0.1:7731/')).toBe('http://127.0.0.1:7731');
		expect(resolveBaseUrl('http://127.0.0.1:7731')).toBe('http://127.0.0.1:7731');
	});

	it('errors when unset or blank', () => {
		expect(() => resolveBaseUrl(undefined)).toThrow(/FACTORY_API_URL is not set/);
		expect(() => resolveBaseUrl('  ')).toThrow(OpenApiSnapshotError);
	});
});

describe('validateOpenApiResponse', () => {
	it('accepts a valid JSON OpenAPI document', () => {
		expect(validateOpenApiResponse(json(JSON.stringify(validDoc)))).toEqual(validDoc);
		expect(
			validateOpenApiResponse(
				json(JSON.stringify(validDoc), 200, 'application/json; charset=utf-8')
			)
		).toEqual(validDoc);
	});

	it('rejects non-2xx responses', () => {
		expect(() => validateOpenApiResponse(json(JSON.stringify(validDoc), 404))).toThrow(/HTTP 404/);
	});

	it('rejects HTML responses', () => {
		expect(() =>
			validateOpenApiResponse(json('<!doctype html><html></html>', 200, 'text/html'))
		).toThrow(/HTML/);
		expect(() => validateOpenApiResponse(json('<!doctype html><html></html>'))).toThrow(/HTML/);
	});

	it('rejects non-JSON content types and bodies', () => {
		expect(() => validateOpenApiResponse(json('{}', 200, 'text/plain'))).toThrow(/content-type/);
		expect(() => validateOpenApiResponse(json('{}', 200, null))).toThrow(/content-type/);
		expect(() => validateOpenApiResponse(json('not json'))).toThrow(/not valid JSON/);
	});

	it('rejects empty bodies', () => {
		expect(() => validateOpenApiResponse(json(''))).toThrow(/empty/);
	});
});

describe('validateOpenApiDocument', () => {
	it('rejects non-object documents', () => {
		for (const doc of [null, [], 'openapi', 42]) {
			expect(() => validateOpenApiDocument(doc)).toThrow(/not a JSON object/);
		}
	});

	it.each(['openapi', 'info', 'paths'])('rejects a document missing %s', (key) => {
		const doc: Record<string, unknown> = { ...validDoc };
		delete doc[key];
		expect(() => validateOpenApiDocument(doc)).toThrow(new RegExp(`missing "${key}"`));
	});

	it('rejects a schema without /v1/tickets', () => {
		expect(() =>
			validateOpenApiDocument({ ...validDoc, paths: { '/health': { get: {} } } })
		).toThrow(/\/v1\/tickets/);
	});
});

describe('formatSnapshot', () => {
	it('writes two-space JSON with a trailing newline', () => {
		expect(formatSnapshot({ a: 1 })).toBe('{\n  "a": 1\n}\n');
	});
});

describe('fetchOpenApiDocument', () => {
	it('requests /openapi.json without an authorization header', async () => {
		const requests: { url: string; headers: Headers }[] = [];
		const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
			requests.push({ url: String(input), headers: new Headers(init?.headers) });
			return new Response(JSON.stringify(validDoc), {
				headers: { 'content-type': 'application/json' }
			});
		}) as typeof fetch;

		await expect(fetchOpenApiDocument('http://factory.test', fakeFetch)).resolves.toEqual(validDoc);
		expect(requests).toHaveLength(1);
		const [request] = requests;
		expect(request).toBeDefined();
		expect(request!.url).toBe('http://factory.test/openapi.json');
		expect(request!.headers.has('authorization')).toBe(false);
	});

	it('names the URL when the response is rejected', async () => {
		const fakeFetch = (async () =>
			new Response('<html></html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch;
		await expect(fetchOpenApiDocument('http://factory.test', fakeFetch)).rejects.toThrow(
			/http:\/\/factory\.test\/openapi\.json: Expected JSON, got HTML/
		);
	});
});
