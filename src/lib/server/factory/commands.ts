/**
 * The factory's commands over the typed client. Each takes the idempotency
 * key (the browser's intent id) and answers a `FactoryResult` with the
 * accepted command; like the reads, they never throw. The bearer and
 * `x-factory-on-behalf-of` come from the client.
 */
import { parseCommandAccepted } from '$lib/factory/commands';
import type { components, operations } from '$lib/factory/generated/factory-api';

import type { FactoryClient } from './client';
import { CONTRACT_ERROR, normalizeFactoryFailure } from './errors';
import type { FactoryResult, RunId, TicketKey } from './reads';

type Schemas = components['schemas'];
type Accepted = Schemas['CommandAccepted'];

export type IdempotencyKey = NonNullable<
	NonNullable<operations['retryTicket']['parameters']['header']>['idempotency-key']
>;

type ClientResult = { data?: unknown; error?: unknown; response: Response };

/** Run one command call; a 202 is accepted only with a documented body. */
async function command(call: () => Promise<ClientResult>): Promise<FactoryResult<Accepted>> {
	try {
		const result = await call();
		if (result.response.ok) {
			const accepted = result.response.status === 202 && parseCommandAccepted(result.data);
			if (accepted) return { ok: true, data: accepted };
			return {
				ok: false,
				failure: {
					status: 502,
					type: CONTRACT_ERROR,
					title: 'Unexpected response from the factory API',
					detail: `The factory responded with HTTP ${result.response.status} and a body that did not match the API contract.`,
					retryable: false
				}
			};
		}
		return { ok: false, failure: normalizeFactoryFailure(result) };
	} catch (thrown) {
		return { ok: false, failure: normalizeFactoryFailure(thrown) };
	}
}

const header = (key: IdempotencyKey) => ({ 'idempotency-key': key });

/** `POST /v1/tickets`: start a ticket from a ref, or from an id and text. */
export function start(
	client: FactoryClient,
	key: IdempotencyKey,
	body: Schemas['StartTicket']
): Promise<FactoryResult<Accepted>> {
	return command(() => client.POST('/v1/tickets', { params: { header: header(key) }, body }));
}

/** `POST /v1/tickets/{key}/replies`: answer the waiting agent. */
export function reply(
	client: FactoryClient,
	key: IdempotencyKey,
	ticket: TicketKey,
	body: Schemas['Reply']
): Promise<FactoryResult<Accepted>> {
	return command(() =>
		client.POST('/v1/tickets/{key}/replies', {
			params: { header: header(key), path: { key: ticket } },
			body
		})
	);
}

/** `POST /v1/tickets/{key}/retries`: retry the step that failed. */
export function retry(
	client: FactoryClient,
	key: IdempotencyKey,
	ticket: TicketKey
): Promise<FactoryResult<Accepted>> {
	return command(() =>
		client.POST('/v1/tickets/{key}/retries', {
			params: { header: header(key), path: { key: ticket } }
		})
	);
}

/** `POST /v1/tickets/{key}/complete`: mark a ticket ready for handoff as done. */
export function complete(
	client: FactoryClient,
	key: IdempotencyKey,
	ticket: TicketKey
): Promise<FactoryResult<Accepted>> {
	return command(() =>
		client.POST('/v1/tickets/{key}/complete', {
			params: { header: header(key), path: { key: ticket } }
		})
	);
}

/** `POST /v1/tickets/{key}/cancel`, with an optional reason. */
export function cancel(
	client: FactoryClient,
	key: IdempotencyKey,
	ticket: TicketKey,
	body?: Schemas['CancelTicket']
): Promise<FactoryResult<Accepted>> {
	return command(() =>
		client.POST('/v1/tickets/{key}/cancel', {
			params: { header: header(key), path: { key: ticket } },
			...(body !== undefined && { body })
		})
	);
}

/** `POST /v1/tickets/{key}/reruns`: run a finished ticket again. */
export function rerun(
	client: FactoryClient,
	key: IdempotencyKey,
	ticket: TicketKey
): Promise<FactoryResult<Accepted>> {
	return command(() =>
		client.POST('/v1/tickets/{key}/reruns', {
			params: { header: header(key), path: { key: ticket } }
		})
	);
}

/** `POST /v1/runs/{id}/stop`: stop a running agent. */
export function stop(
	client: FactoryClient,
	key: IdempotencyKey,
	run: RunId
): Promise<FactoryResult<Accepted>> {
	return command(() =>
		client.POST('/v1/runs/{id}/stop', { params: { header: header(key), path: { id: run } } })
	);
}
