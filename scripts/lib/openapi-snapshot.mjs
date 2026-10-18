// Pure helpers for pulling and validating the factory OpenAPI snapshot.
// Kept free of side effects so they can be unit tested without a network.

export const REQUIRED_PATH = '/v1/tickets';

export class OpenApiSnapshotError extends Error {
	/** @param {string} message */
	constructor(message) {
		super(message);
		this.name = 'OpenApiSnapshotError';
	}
}

/**
 * Normalize FACTORY_API_URL: required, trailing slashes stripped.
 * @param {string | undefined} value
 * @returns {string}
 */
export function resolveBaseUrl(value) {
	const trimmed = (value ?? '').trim();
	if (!trimmed) {
		throw new OpenApiSnapshotError(
			'FACTORY_API_URL is not set. Point it at the factory server, e.g. FACTORY_API_URL=http://127.0.0.1:7731'
		);
	}
	return trimmed.replace(/\/+$/, '');
}

/**
 * Validate a fetched OpenAPI response body.
 * @param {{ status: number, contentType: string | null, body: string }} response
 * @returns {Record<string, unknown>} the parsed document
 */
export function validateOpenApiResponse({ status, contentType, body }) {
	if (status < 200 || status >= 300) {
		throw new OpenApiSnapshotError(`Expected a 2xx response, got HTTP ${status}`);
	}
	const type = (contentType ?? '').toLowerCase();
	if (type.includes('text/html')) {
		throw new OpenApiSnapshotError(`Expected JSON, got HTML (content-type: ${contentType})`);
	}
	if (!/^application\/([\w.+-]+\+)?json\b/.test(type)) {
		throw new OpenApiSnapshotError(
			`Expected a JSON content-type, got ${contentType === null ? 'none' : `"${contentType}"`}`
		);
	}
	if (body.trim() === '') {
		throw new OpenApiSnapshotError('Response body is empty');
	}
	if (/^\s*</.test(body)) {
		throw new OpenApiSnapshotError('Response body looks like HTML, not JSON');
	}
	/** @type {unknown} */
	let doc;
	try {
		doc = JSON.parse(body);
	} catch (error) {
		throw new OpenApiSnapshotError(
			`Response body is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	return validateOpenApiDocument(doc);
}

/**
 * Validate a parsed OpenAPI document's minimal shape.
 * @param {unknown} doc
 * @returns {Record<string, unknown>}
 */
export function validateOpenApiDocument(doc) {
	if (!isObject(doc)) {
		throw new OpenApiSnapshotError('OpenAPI document is not a JSON object');
	}
	for (const key of ['openapi', 'info', 'paths']) {
		if (doc[key] === undefined || doc[key] === null) {
			throw new OpenApiSnapshotError(`OpenAPI document is missing "${key}"`);
		}
	}
	if (typeof doc.openapi !== 'string') {
		throw new OpenApiSnapshotError('OpenAPI document "openapi" is not a version string');
	}
	if (!isObject(doc.info)) {
		throw new OpenApiSnapshotError('OpenAPI document "info" is not an object');
	}
	const paths = doc.paths;
	if (!isObject(paths)) {
		throw new OpenApiSnapshotError('OpenAPI document "paths" is not an object');
	}
	if (!isObject(paths[REQUIRED_PATH])) {
		throw new OpenApiSnapshotError(
			`OpenAPI document has no paths["${REQUIRED_PATH}"]; is FACTORY_API_URL the factory server?`
		);
	}
	return doc;
}

/**
 * Stable on-disk formatting for the snapshot.
 * @param {unknown} doc
 */
export function formatSnapshot(doc) {
	return JSON.stringify(doc, null, 2) + '\n';
}

/**
 * Fetch and validate the live document. Never sends an authorization header.
 * @param {string} baseUrl already normalized by resolveBaseUrl
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchOpenApiDocument(baseUrl, fetchImpl = fetch) {
	const url = `${baseUrl}/openapi.json`;
	/** @type {Response} */
	let response;
	try {
		response = await fetchImpl(url, { headers: { accept: 'application/json' } });
	} catch (error) {
		throw new OpenApiSnapshotError(
			`Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	const body = await response.text();
	try {
		return validateOpenApiResponse({
			status: response.status,
			contentType: response.headers.get('content-type'),
			body
		});
	} catch (error) {
		if (error instanceof OpenApiSnapshotError) {
			error.message = `${url}: ${error.message}`;
		}
		throw error;
	}
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
