import { describe, expect, it } from 'vitest';

import { createFactoryClient } from './client';
import {
	CONTRACT_ERROR,
	FactoryApiError,
	NETWORK_ERROR,
	normalizeFactoryFailure,
	type FactoryApiFailure,
	type ProblemType
} from './errors';

const BASE_URL = 'http://127.0.0.1:7731';
const TOKEN = 'secret-token-abc123';

function clientReturning(response: () => Response | Promise<Response>) {
	return createFactoryClient({
		baseUrl: BASE_URL,
		token: TOKEN,
		fetch: async () => response()
	});
}

function problemResponse(body: unknown, status: number, contentType = 'application/problem+json') {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': contentType }
	});
}

/** Run `GET /v1/me` against `response` and normalize whatever comes back. */
async function failureFor(response: () => Response | Promise<Response>) {
	const client = clientReturning(response);
	try {
		const result = await client.GET('/v1/me');
		expect(result.error).toBeDefined();
		return normalizeFactoryFailure(result);
	} catch (thrown) {
		return normalizeFactoryFailure(thrown);
	}
}

const problemCases: Array<{ type: ProblemType; status: number; retryable: boolean }> = [
	{ type: 'validation_error', status: 400, retryable: false },
	{ type: 'unauthorized', status: 401, retryable: false },
	{ type: 'insufficient_scope', status: 403, retryable: false },
	{ type: 'not_found', status: 404, retryable: false },
	{ type: 'ticket_not_found', status: 404, retryable: false },
	{ type: 'invalid_state', status: 409, retryable: false },
	{ type: 'not_waiting_for_reply', status: 409, retryable: false },
	{ type: 'tracker_unavailable', status: 503, retryable: true },
	{ type: 'internal_error', status: 500, retryable: true },
	{ type: 'method_not_allowed', status: 405, retryable: false },
	{ type: 'umbrella_issue', status: 422, retryable: false },
	{ type: 'unsupported_media_type', status: 415, retryable: false }
];

describe('normalizeFactoryFailure: Problem documents', () => {
	it.each(problemCases)(
		'$type maps type, title, status, detail and retryable=$retryable',
		async ({ type, status, retryable }) => {
			const failure = await failureFor(() =>
				problemResponse(
					{ type, title: `Title for ${type}`, status, detail: `Detail ${type}` },
					status
				)
			);

			expect(failure).toEqual({
				type,
				title: `Title for ${type}`,
				status,
				detail: `Detail ${type}`,
				retryable
			} satisfies FactoryApiFailure);
		}
	);

	it('maps validation_error errors[] to fieldErrors', async () => {
		const failure = await failureFor(() =>
			problemResponse(
				{
					type: 'validation_error',
					title: 'Invalid request',
					status: 400,
					errors: [
						{ path: 'query.stage', message: 'must be one of plan, work' },
						{ path: 'body.ref', message: 'is required' }
					]
				},
				400
			)
		);

		expect(failure).toEqual({
			type: 'validation_error',
			title: 'Invalid request',
			status: 400,
			retryable: false,
			fieldErrors: [
				{ path: 'query.stage', message: 'must be one of plan, work' },
				{ path: 'body.ref', message: 'is required' }
			]
		});
	});

	it('accepts a Problem served as application/json with a charset', async () => {
		const failure = await failureFor(() =>
			problemResponse(
				{ type: 'not_found', title: 'Not found', status: 404 },
				404,
				'application/json; charset=utf-8'
			)
		);

		expect(failure).toEqual({
			type: 'not_found',
			title: 'Not found',
			status: 404,
			retryable: false
		});
	});
});

const UPSTREAM_SECRET = 'UPSTREAM-INTERNAL-stacktrace-at-db.go:42';

describe('normalizeFactoryFailure: contract failures', () => {
	const cases: Array<{ name: string; response: () => Response }> = [
		{
			name: 'an HTML error body',
			response: () =>
				new Response(`<html><body><h1>502 Bad Gateway</h1>${UPSTREAM_SECRET}</body></html>`, {
					status: 502,
					headers: { 'content-type': 'text/html' }
				})
		},
		{
			name: 'a non-JSON text body',
			response: () =>
				new Response(`panic: ${UPSTREAM_SECRET}`, {
					status: 500,
					headers: { 'content-type': 'text/plain' }
				})
		},
		{
			name: 'unparseable JSON under a problem content type',
			response: () =>
				new Response(`{"type": "internal_error", ${UPSTREAM_SECRET}`, {
					status: 500,
					headers: { 'content-type': 'application/problem+json' }
				})
		},
		{
			name: 'a Problem with an unknown type',
			response: () =>
				problemResponse({ type: 'brand_new_type', title: UPSTREAM_SECRET, status: 500 }, 500)
		},
		{
			name: 'a Problem missing its title',
			response: () =>
				problemResponse({ type: 'not_found', status: 404, detail: UPSTREAM_SECRET }, 404)
		},
		{
			name: 'a Problem with a non-integer status',
			response: () =>
				problemResponse({ type: 'not_found', title: UPSTREAM_SECRET, status: '404' }, 404)
		},
		{
			name: 'a Problem with malformed errors[]',
			response: () =>
				problemResponse(
					{
						type: 'validation_error',
						title: UPSTREAM_SECRET,
						status: 400,
						errors: [{ path: 1, message: UPSTREAM_SECRET }]
					},
					400
				)
		},
		{
			name: 'a valid Problem under a non-JSON content type',
			response: () =>
				problemResponse(
					{ type: 'not_found', title: UPSTREAM_SECRET, status: 404 },
					404,
					'text/html'
				)
		},
		{
			name: 'a JSON array body',
			response: () => problemResponse([UPSTREAM_SECRET], 500)
		},
		{
			name: 'an invalid JSON success body',
			response: () =>
				new Response(`{"name": ${UPSTREAM_SECRET}`, {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		}
	];

	it.each(cases)('$name becomes a contract failure with no upstream body', async ({ response }) => {
		const failure = await failureFor(response);

		expect(failure.type).toBe(CONTRACT_ERROR);
		expect(failure.retryable).toBe(false);
		expect(failure.fieldErrors).toBeUndefined();
		expect(JSON.stringify(failure)).not.toContain(UPSTREAM_SECRET);
		expect(JSON.stringify(failure)).not.toContain('Bad Gateway');
	});
});

describe('normalizeFactoryFailure: transport failures', () => {
	it('a rejected fetch becomes a retryable network failure that leaks neither token nor URL', async () => {
		const client = createFactoryClient({
			baseUrl: BASE_URL,
			token: TOKEN,
			fetch: async (request) => {
				throw new TypeError(
					`fetch failed: ${request.url} ${request.headers.get('authorization')}`,
					{
						cause: new Error(`connect ECONNREFUSED ${BASE_URL}`)
					}
				);
			}
		});

		let thrown: unknown;
		try {
			await client.GET('/v1/me');
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(TypeError);

		const failure = normalizeFactoryFailure(thrown);
		const serialized = JSON.stringify(failure);

		expect(failure.type).toBe(NETWORK_ERROR);
		expect(failure.retryable).toBe(true);
		expect(failure.status).toBe(502);
		expect(serialized).not.toContain(TOKEN);
		expect(serialized).not.toContain('127.0.0.1');
		expect(serialized).not.toContain('7731');
	});

	it('an abort is a network failure too', () => {
		const failure = normalizeFactoryFailure(
			new DOMException('The operation was aborted', 'AbortError')
		);

		expect(failure.type).toBe(NETWORK_ERROR);
		expect(failure.retryable).toBe(true);
	});

	it('passes a FactoryApiError failure through unchanged', () => {
		const failure: FactoryApiFailure = {
			status: 500,
			type: 'configuration_error',
			title: 'Factory API is not configured',
			retryable: false
		};

		expect(normalizeFactoryFailure(new FactoryApiError(failure))).toBe(failure);
	});
});
