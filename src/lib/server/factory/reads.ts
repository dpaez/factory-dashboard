import type { components, operations } from '$lib/factory/generated/factory-api';

import type { FactoryClient } from './client';
import { normalizeFactoryFailure, type FactoryApiFailure } from './errors';

type Schemas = components['schemas'];

/** A read either returns the documented 200 body or a normalized failure. */
export type FactoryResult<T> = { ok: true; data: T } | { ok: false; failure: FactoryApiFailure };

type Query<Op extends keyof operations> = NonNullable<operations[Op]['parameters']['query']>;

export type ListTicketsParams = Query<'listTickets'>;
export type GetTicketParams = Query<'getTicket'>;
export type ListRunsParams = Query<'listTicketRuns'>;
export type GetBacklogParams = Query<'listBacklog'>;
export type StatsSummaryParams = Query<'getStatsSummary'>;
export type StatsStagesParams = Query<'getStatsStages'>;
export type StatsConfigurationsParams = Query<'getStatsConfigurations'>;
export type StatsTicketsParams = Query<'getStatsTickets'>;
export type StatsExportParams = Query<'exportStats'>;
export type TicketKey = Schemas['TicketKey'];
export type RunId = operations['getRun']['parameters']['path']['id'];

type ClientResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * Run one client call and turn every outcome into a `FactoryResult`. A 2xx
 * response without a body is a contract failure; a thrown value (network,
 * invalid JSON) is normalized too, so reads never throw.
 */
async function read<T>(call: () => Promise<ClientResult<T>>): Promise<FactoryResult<T>> {
	try {
		const result = await call();
		if (result.response.ok && result.data !== undefined) return { ok: true, data: result.data };
		return { ok: false, failure: normalizeFactoryFailure(result) };
	} catch (thrown) {
		return { ok: false, failure: normalizeFactoryFailure(thrown) };
	}
}

/** `GET /v1/me`: the API client behind the token. */
export function getMe(client: FactoryClient): Promise<FactoryResult<Schemas['Me']>> {
	return read(() => client.GET('/v1/me'));
}

/** `GET /v1/tickets`. `stage` and `state` take one value or several (repeated keys). */
export function listTickets(
	client: FactoryClient,
	query: ListTicketsParams = {}
): Promise<FactoryResult<Schemas['TicketPage']>> {
	return read(() => client.GET('/v1/tickets', { params: { query } }));
}

/** `GET /v1/tickets/{key}`, optionally for an older execution. */
export function getTicket(
	client: FactoryClient,
	key: TicketKey,
	query: GetTicketParams = {}
): Promise<FactoryResult<Schemas['TicketDetail']>> {
	return read(() => client.GET('/v1/tickets/{key}', { params: { path: { key }, query } }));
}

/** `GET /v1/tickets/{key}/executions`: the ticket's executions, oldest first. */
export function listExecutions(
	client: FactoryClient,
	key: TicketKey
): Promise<FactoryResult<Schemas['ExecutionList']>> {
	return read(() => client.GET('/v1/tickets/{key}/executions', { params: { path: { key } } }));
}

/** `GET /v1/tickets/{key}/runs`. */
export function listRuns(
	client: FactoryClient,
	key: TicketKey,
	query: ListRunsParams = {}
): Promise<FactoryResult<Schemas['RunPage']>> {
	return read(() => client.GET('/v1/tickets/{key}/runs', { params: { path: { key }, query } }));
}

/** `GET /v1/runs/{id}`. */
export function getRun(client: FactoryClient, id: RunId): Promise<FactoryResult<Schemas['Run']>> {
	return read(() => client.GET('/v1/runs/{id}', { params: { path: { id } } }));
}

/** `GET /v1/agents`: active agents. */
export function listAgents(client: FactoryClient): Promise<FactoryResult<Schemas['AgentList']>> {
	return read(() => client.GET('/v1/agents'));
}

/** `GET /v1/backlog`. `refresh: 'true'` asks the tracker instead of the cache. */
export function getBacklog(
	client: FactoryClient,
	query: GetBacklogParams = {}
): Promise<FactoryResult<Schemas['BacklogPage']>> {
	return read(() => client.GET('/v1/backlog', { params: { query } }));
}

/** `GET /v1/stats/summary`. */
export function getStatsSummary(
	client: FactoryClient,
	query: StatsSummaryParams = {}
): Promise<FactoryResult<Schemas['StatsSummary']>> {
	return read(() => client.GET('/v1/stats/summary', { params: { query } }));
}

/** `GET /v1/stats/stages`. */
export function getStatsStages(
	client: FactoryClient,
	query: StatsStagesParams = {}
): Promise<FactoryResult<Schemas['StatsStages']>> {
	return read(() => client.GET('/v1/stats/stages', { params: { query } }));
}

/** `GET /v1/stats/configurations`. */
export function getStatsConfigurations(
	client: FactoryClient,
	query: StatsConfigurationsParams = {}
): Promise<FactoryResult<Schemas['StatsConfigurations']>> {
	return read(() => client.GET('/v1/stats/configurations', { params: { query } }));
}

/** `GET /v1/stats/tickets`: one fact row per ticket, paged. */
export function getStatsTickets(
	client: FactoryClient,
	query: StatsTicketsParams = {}
): Promise<FactoryResult<Schemas['StatsTickets']>> {
	return read(() => client.GET('/v1/stats/tickets', { params: { query } }));
}
