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

/** A command that does not fit the ticket's state (a retry with nothing to retry). */
export const problemInvalidState = {
	status: 409,
	title: 'Invalid state',
	type: 'invalid_state',
	detail: 'The ticket has nothing to retry.'
} satisfies Problem;

/** A reply to a ticket whose agent is not waiting for one. */
export const problemNotWaitingForReply = {
	status: 409,
	title: 'Not waiting for a reply',
	type: 'not_waiting_for_reply',
	detail: 'No agent on this ticket is waiting for an answer.'
} satisfies Problem;

/** A command from a token without the `act` scope. */
export const problemInsufficientScope = {
	status: 403,
	title: 'Insufficient scope',
	type: 'insufficient_scope',
	detail: 'The token lacks the act scope.'
} satisfies Problem;

/** The factory failed while handling the request; it may or may not have applied it. */
export const problemInternalError = {
	status: 500,
	title: 'Internal error',
	type: 'internal_error'
} satisfies Problem;

/** A reply with an empty answer. */
export const problemReplyValidationError = {
	status: 400,
	title: 'Invalid request',
	type: 'validation_error',
	errors: [{ path: 'body.answer', message: 'Must not be empty.' }]
} satisfies Problem;
