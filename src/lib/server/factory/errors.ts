import type { components } from '$lib/factory/generated/factory-api';

type Problem = components['schemas']['Problem'];
export type ProblemType = Problem['type'];

/*
 * Dashboard-local failure discriminators. They are not schema `Problem.type`
 * values and never come from the factory:
 * - `contract_error`: the factory answered, but not with a documented success
 *   body or a valid Problem document (HTML, non-JSON, malformed Problem,
 *   unknown `type`, invalid success JSON). Status 502, not retryable.
 * - `network_error`: the request never produced a response (fetch rejected,
 *   connection refused, DNS, abort). Status 502, retryable.
 * - `configuration_error`: the dashboard is missing FACTORY_API_URL or
 *   FACTORY_API_TOKEN. Status 500, not retryable.
 */
export const CONTRACT_ERROR = 'contract_error';
export const NETWORK_ERROR = 'network_error';
export const CONFIGURATION_ERROR = 'configuration_error';

export type FactoryFailureType =
	ProblemType | typeof CONTRACT_ERROR | typeof NETWORK_ERROR | typeof CONFIGURATION_ERROR;

/** The one server-side failure shape. Safe to serialize to the browser. */
export type FactoryApiFailure = {
	status: number;
	type: FactoryFailureType;
	title: string;
	detail?: string;
	fieldErrors?: Array<{ path: string; message: string }>;
	retryable: boolean;
};

/** An `Error` carrying a normalized failure, for code paths that throw. */
export class FactoryApiError extends Error {
	readonly failure: FactoryApiFailure;

	constructor(failure: FactoryApiFailure) {
		super(failure.detail ? `${failure.title}: ${failure.detail}` : failure.title);
		this.name = 'FactoryApiError';
		this.failure = failure;
	}
}

// Exhaustive over the schema enum: adding a type upstream fails `pnpm check`
// here until it is classified.
const PROBLEM_RETRYABLE: Record<ProblemType, boolean> = {
	validation_error: false,
	unauthorized: false,
	insufficient_scope: false,
	not_found: false,
	ticket_not_found: false,
	invalid_state: false,
	not_waiting_for_reply: false,
	tracker_unavailable: true,
	internal_error: true,
	method_not_allowed: false,
	umbrella_issue: false,
	unsupported_media_type: false
};

function isProblemType(value: unknown): value is ProblemType {
	return typeof value === 'string' && Object.hasOwn(PROBLEM_RETRYABLE, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonMediaType(contentType: string | null): boolean {
	const mediaType = contentType?.split(';')[0]?.trim().toLowerCase();
	return mediaType === 'application/problem+json' || mediaType === 'application/json';
}

function isFieldError(value: unknown): value is { path: string; message: string } {
	return isRecord(value) && typeof value.path === 'string' && typeof value.message === 'string';
}

/** Return the body as a Problem only if every documented field is well-formed. */
function parseProblem(body: unknown): Problem | undefined {
	if (!isRecord(body)) return undefined;
	const { type, title, status, detail, errors } = body;
	if (!isProblemType(type) || typeof title !== 'string' || !Number.isInteger(status)) {
		return undefined;
	}
	if (detail !== undefined && typeof detail !== 'string') return undefined;
	if (errors !== undefined && !(Array.isArray(errors) && errors.every(isFieldError))) {
		return undefined;
	}
	return {
		type,
		title,
		status: status as number,
		...(detail !== undefined && { detail }),
		...(errors !== undefined && { errors })
	};
}

function contractFailure(upstreamStatus?: number): FactoryApiFailure {
	return {
		status: 502,
		type: CONTRACT_ERROR,
		title: 'Unexpected response from the factory API',
		detail:
			upstreamStatus === undefined
				? 'The response body did not match the API contract.'
				: `The factory responded with HTTP ${upstreamStatus} and a body that did not match the API contract.`,
		retryable: false
	};
}

function networkFailure(): FactoryApiFailure {
	return {
		status: 502,
		type: NETWORK_ERROR,
		title: 'Factory API is unreachable',
		detail: 'The request to the factory API did not complete.',
		retryable: true
	};
}

function fromResult(error: unknown, response: Response): FactoryApiFailure {
	// A success response only reaches the normalizer when its body was invalid.
	if (response.ok) return contractFailure(response.status);
	if (!isJsonMediaType(response.headers.get('content-type'))) {
		return contractFailure(response.status);
	}
	const problem = parseProblem(error);
	if (!problem) return contractFailure(response.status);
	return {
		status: problem.status,
		type: problem.type,
		title: problem.title,
		...(problem.detail !== undefined && { detail: problem.detail }),
		...(problem.errors !== undefined && {
			fieldErrors: problem.errors.map(({ path, message }) => ({ path, message }))
		}),
		retryable: PROBLEM_RETRYABLE[problem.type]
	};
}

/**
 * Normalize anything a factory call can produce into a `FactoryApiFailure`:
 * - an openapi-fetch result `{ error, response }` (or `{ data, response }` whose
 *   success body the caller rejected);
 * - a thrown value: `FactoryApiError` passes through, a `SyntaxError` (invalid
 *   success JSON) is a contract failure, anything else is a transport failure.
 *
 * Upstream body text, the request URL and the token never reach the result.
 */
export function normalizeFactoryFailure(input: unknown): FactoryApiFailure {
	if (input instanceof FactoryApiError) return input.failure;
	if (isRecord(input) && input.response instanceof Response) {
		return fromResult(input.error, input.response);
	}
	if (input instanceof SyntaxError) return contractFailure();
	return networkFailure();
}
