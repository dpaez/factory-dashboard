/* Problem documents as the factory sends them (`application/problem+json`). */
import type { components } from '$lib/factory/generated/factory-api';

type Problem = components['schemas']['Problem'];

export const problemTicketNotFound = {
	status: 404,
	title: 'Ticket not found',
	type: 'ticket_not_found',
	detail: 'No ticket has the key missing-ticket-00000000.'
} satisfies Problem;

export const problemValidationError = {
	status: 400,
	title: 'Invalid request',
	type: 'validation_error',
	errors: [{ path: 'query.stage', message: 'Must be one of plan, qa, review, work, wrapup, done.' }]
} satisfies Problem;

export const problemUnauthorized = {
	status: 401,
	title: 'Unauthorized',
	type: 'unauthorized'
} satisfies Problem;

export const problemTrackerUnavailable = {
	status: 503,
	title: 'Tracker unavailable',
	type: 'tracker_unavailable',
	detail: 'GitHub did not answer.'
} satisfies Problem;
