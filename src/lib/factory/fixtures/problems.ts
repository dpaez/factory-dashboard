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

/** A start of an umbrella issue: start one of its sub-issues instead. */
export const problemUmbrellaIssue = {
	status: 422,
	title: 'Umbrella issue',
	type: 'umbrella_issue',
	detail: 'dpaez/factory-dashboard#16 has sub-issues; start one of them.'
} satisfies Problem;

/** A start whose issue reference the factory cannot resolve. */
export const problemStartRefValidation = {
	status: 400,
	title: 'Invalid request',
	type: 'validation_error',
	errors: [{ path: 'body.ref', message: 'Not an issue reference the tracker knows.' }]
} satisfies Problem;

/** A written brief with an empty ID and text. */
export const problemStartBriefValidation = {
	status: 400,
	title: 'Invalid request',
	type: 'validation_error',
	errors: [
		{ path: 'body.id', message: 'Must not be empty.' },
		{ path: 'body.text', message: 'Must not be empty.' }
	]
} satisfies Problem;

/** A start the factory's state rejects: the conflict case (there is no `conflict` type). */
export const problemStartConflict = {
	status: 409,
	title: 'Invalid state',
	type: 'invalid_state',
	detail: 'The start does not fit the ticket in its current state.'
} satisfies Problem;

/** A reply with an empty answer. */
export const problemReplyValidationError = {
	status: 400,
	title: 'Invalid request',
	type: 'validation_error',
	errors: [{ path: 'body.answer', message: 'Must not be empty.' }]
} satisfies Problem;

/*
 * Backlog read failures as the factory sends them: every tracker error is
 * `tracker_unavailable` (502) whose `detail` is gh's raw output, Go-quoted
 * (the backslashes below are literal characters in the detail).
 */

/** gh's answer to a rejected token (the sample from dpaez/factory-dashboard#65). */
export const problemTrackerUnauthorized = {
	status: 502,
	title: 'Tracker unavailable',
	type: 'tracker_unavailable',
	detail:
		'non-200 OK status code: 401 Unauthorized body: "{\\r\\n  \\"message\\": \\"Bad credentials\\",\\r\\n  \\"documentation_url\\": \\"https://docs.github.com/rest\\",\\r\\n  \\"status\\": \\"401\\"\\r\\n}"'
} satisfies Problem;

/** gh rate limited or missing a scope. */
export const problemTrackerForbidden = {
	status: 502,
	title: 'Tracker unavailable',
	type: 'tracker_unavailable',
	detail: 'GraphQL: API rate limit exceeded for user ID 1234. (HTTP 403)'
} satisfies Problem;

/** The tracker repository does not resolve. */
export const problemTrackerNotFound = {
	status: 502,
	title: 'Tracker unavailable',
	type: 'tracker_unavailable',
	detail:
		"GraphQL: Could not resolve to a Repository with the name 'dpaez/missing-repo'. (repository)"
} satisfies Problem;

/** The factory server has no `gh` on its PATH. */
export const problemTrackerCliMissing = {
	status: 502,
	title: 'Tracker unavailable',
	type: 'tracker_unavailable',
	detail: 'spawn gh ENOENT'
} satisfies Problem;

/** A tracker error the dashboard does not recognize. */
export const problemTrackerUnknown = {
	status: 502,
	title: 'Tracker unavailable',
	type: 'tracker_unavailable',
	detail: 'unexpected EOF while reading the GraphQL response'
} satisfies Problem;

/** `FACTORY.json` has no `tracker` (factory-skills `src/controller/service.ts`). */
export const problemNoTracker = {
	status: 502,
	title: 'Tracker unavailable',
	type: 'tracker_unavailable',
	detail: 'FACTORY.json has no tracker, so there is no backlog.'
} satisfies Problem;
