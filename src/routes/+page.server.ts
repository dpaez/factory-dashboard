import { toAttention, type AttentionModel } from '$lib/factory/attention';
import { toBoard } from '$lib/factory/board';
import { readBacklog } from '$lib/server/factory/backlog';
import { factoryClientFromEnv, type FactoryClient } from '$lib/server/factory/client';
import { isConfigurationFailure, listAllTickets, throwPageError } from '$lib/server/factory/pages';
import { getTicket, listAgents, type FactoryResult } from '$lib/server/factory/reads';
import type { PageServerLoad } from './$types';

/** The attention strip's data: the model, or a safe failure with no upstream body. */
export type AttentionResult =
	| { ok: true; model: AttentionModel }
	| { ok: false; failure: { title: string; retryable: boolean } };

/**
 * A secondary read's data, or null when it failed. Auth and configuration
 * failures still become the page-level configuration error.
 */
function secondary<T>(result: FactoryResult<T>): T | null {
	if (result.ok) return result.data;
	if (isConfigurationFailure(result.failure)) throwPageError(result.failure);
	return null;
}

/**
 * The Flow board. The selected ticket (`?ticket=`) lives in the page, not
 * here: this load never reads `url.search*`, so selecting a card does not
 * refetch the board.
 *
 * The backlog is returned unawaited, so it streams: a slow or failing tracker
 * never delays or breaks the stage lanes. It always resolves to a safe
 * `BacklogResult`, never rejects, and contains configuration and auth
 * failures too (unlike `secondary()`): the ticket read decides the page error.
 *
 * The attention read (`needsUser=true`) is awaited: it is the same factory as
 * the ticket read. Its reasons use the details already read for the board, so
 * there is no extra detail fetch. A failure stays in `attention`, except a
 * configuration or auth failure, which is the page error.
 */
export const load: PageServerLoad = async ({ fetch }) => {
	let client: FactoryClient;
	try {
		client = factoryClientFromEnv(fetch);
	} catch (cause) {
		throwPageError(cause);
	}

	const backlog = readBacklog(fetch).then((read) => read.result);

	// Agents do not depend on the ticket list: read them alongside it.
	const agentsRead = listAgents(client);
	const attentionRead = listAllTickets(client, { status: 'open', needsUser: 'true' });
	const tickets = await listAllTickets(client, { status: 'open' });
	if (!tickets.ok) throwPageError(tickets.failure);

	// One detail per open ticket, for its card's token usage. A failed read blanks only that card.
	const [agents, needsAttention, detailReads] = await Promise.all([
		agentsRead,
		attentionRead,
		Promise.all(tickets.data.items.map((ticket) => getTicket(client, ticket.key)))
	]);
	const details = detailReads.map(secondary);

	let attention: AttentionResult;
	if (needsAttention.ok) {
		attention = {
			ok: true,
			model: toAttention({
				tickets: needsAttention.data.items,
				complete: needsAttention.data.complete,
				details
			})
		};
	} else {
		if (isConfigurationFailure(needsAttention.failure)) throwPageError(needsAttention.failure);
		const { title, retryable } = needsAttention.failure;
		attention = { ok: false, failure: { title, retryable } };
	}

	return {
		backlog,
		attention,
		board: toBoard({
			tickets: tickets.data.items,
			complete: tickets.data.complete,
			agents: secondary(agents),
			details
		})
	};
};
