/**
 * A fake factory server for e2e and load tests. It serves the typed fixtures
 * for the GET routes the dashboard reads and the seven command routes, checks
 * the bearer token, and answers 405 to any other verb. A command answers 202
 * with the next revision and appends an event; a repeated `idempotency-key`
 * replays the first 202. The test probes append events to the `/v1/events`
 * stream and can add a ticket with them.
 *
 * Run it with `node test/fake-factory.ts` (Node strips the types). Env:
 * `FAKE_FACTORY_PORT` (default 7799) and `FAKE_FACTORY_TOKEN`.
 *
 * Imports use explicit `.ts` paths so Node can load them without a bundler.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { components } from '../src/lib/factory/generated/factory-api.d.ts';
import { backlogIssues, backlogPage } from '../src/lib/factory/fixtures/backlog.ts';
import { eventFrame } from '../src/lib/factory/fixtures/events.ts';
import {
	statsCompleteStages,
	statsCompleteSummary,
	statsConfigurations,
	statsTicketsComplete,
	statsTicketsMissingTimings,
	statsTicketsNoHandoffs,
	statsTicketsSmallSample,
	statsEmptyStages,
	statsEmptySummary,
	statsPartialStages,
	statsQaDisabledStages,
	statsZeroMergesSummary
} from '../src/lib/factory/fixtures/stats.ts';
import {
	statsExportComplete,
	statsExportEmpty,
	statsExportText,
	statsExportZeroMerges,
	type StatsExportFixture
} from '../src/lib/factory/fixtures/stats-export.ts';
import {
	agentList,
	executionList,
	runPage,
	runPageFirstExecution,
	runPageHistory
} from '../src/lib/factory/fixtures/runs.ts';
import {
	ticketDetailActiveInQa,
	ticketDetailActiveInWork,
	ticketDetailAgentQuestion,
	ticketDetailCancelled,
	ticketDetailComplete,
	ticketDetailFailed,
	ticketDetailManualApproval,
	ticketDetailMultiExecution,
	ticketDetailMultiExecutionFirst,
	ticketDetailPaused,
	ticketDetailPlanning,
	ticketDetailPolicyLimit,
	ticketDetailReadyForHandoff,
	ticketDetailTrackerWarnings,
	ticketSummaries
} from '../src/lib/factory/fixtures/tickets.ts';

export { agentList };

type Schemas = components['schemas'];
type Problem = Schemas['Problem'];

export const FAKE_FACTORY_PORT = Number(process.env.FAKE_FACTORY_PORT ?? 7799);
export const FAKE_FACTORY_TOKEN = process.env.FAKE_FACTORY_TOKEN ?? 'fake-factory-token-e2e';
export const FAKE_FACTORY_URL = `http://127.0.0.1:${FAKE_FACTORY_PORT}`;

/**
 * The fake pages at most this many tickets, whatever `limit` asks for, so a
 * handful of fixtures still exercises `nextCursor`.
 */
export const FAKE_PAGE_SIZE = 4;

/** Finished tickets have reached the done stage; every other ticket is open. */
const isOpen = (ticket: Schemas['TicketSummary']) => ticket.stage !== 'done';

export const allTickets: Schemas['TicketSummary'][] = ticketSummaries;
export const openTickets: Schemas['TicketSummary'][] = ticketSummaries.filter(isOpen);

/** A distinct, known usage per ticket, so sums are checkable. */
function usageFor(index: number): Schemas['Usage'] {
	const n = index + 1;
	return {
		costUsd: Math.round(n * 1.25 * 100) / 100,
		tokensCacheRead: n * 10_000,
		tokensCacheWrite: n * 1_000,
		tokensInput: n * 2_000,
		tokensOutput: n * 500,
		tokensTotal: n * 13_500
	};
}

const fixtureDetails = new Map<string, Schemas['TicketDetail']>(
	[
		ticketDetailActiveInQa,
		ticketDetailActiveInWork,
		ticketDetailAgentQuestion,
		ticketDetailCancelled,
		ticketDetailComplete,
		ticketDetailFailed,
		ticketDetailManualApproval,
		ticketDetailMultiExecution,
		ticketDetailPaused,
		ticketDetailPlanning,
		ticketDetailPolicyLimit,
		ticketDetailReadyForHandoff,
		ticketDetailTrackerWarnings
	]
		.map((detail): Schemas['TicketDetail'] => detail)
		.map((detail) => [detail.key, detail])
);

/** One detail per ticket: the fixture detail when there is one, with a distinct usage. */
export const ticketDetails = new Map<string, Schemas['TicketDetail']>(
	allTickets.map((ticket, index) => [
		ticket.key,
		{
			...(fixtureDetails.get(ticket.key) ?? { ...ticket, attention: [], source: null, tasks: [] }),
			usage: usageFor(index)
		} satisfies Schemas['TicketDetail']
	])
);

/**
 * Older executions the fake serves for `?execution=n`: the multi-execution
 * ticket's first one, with its own detail and runs.
 */
const pastExecutions = new Map<
	string,
	Map<number, { detail: Schemas['TicketDetail']; runs: Schemas['RunPage'] }>
>([
	[
		ticketDetailMultiExecution.key,
		new Map([[1, { detail: ticketDetailMultiExecutionFirst, runs: runPageFirstExecution }]])
	]
]);

/** Current-execution run pages by ticket key; every other key serves `runPage`. */
const runPagesByKey = new Map<string, Schemas['RunPage']>([
	[ticketDetailActiveInWork.key, runPageHistory]
]);

/** The current execution's runs for a ticket key. */
export function runPageFor(key: string): Schemas['RunPage'] {
	return runPagesByKey.get(key) ?? runPage;
}

/** Every run the fake serves, by id, for `GET /v1/runs/{id}`. */
const runsById = new Map<string, Schemas['Run']>(
	[
		runPage,
		...runPagesByKey.values(),
		...[...pastExecutions.values()].flatMap((byGeneration) =>
			[...byGeneration.values()].map((past) => past.runs)
		)
	].flatMap((page) => page.items.map((run): [string, Schemas['Run']] => [run.id, run]))
);

/** A ticket's executions: the fixture list for the multi-execution ticket, else its current one. */
export function executionsFor(key: string): Schemas['ExecutionList'] {
	if (key === ticketDetailMultiExecution.key) return executionList;
	const detail = ticketDetails.get(key);
	if (!detail) return { items: [] };
	return {
		items: [
			{
				createdAt: detail.createdAt,
				current: true,
				finishedAt: detail.finishedAt,
				generation: detail.execution,
				stage: detail.stage,
				status: detail.status,
				statusReason: detail.statusReason
			}
		]
	};
}

/** The stats fixture cohorts the fake can serve for `/v1/stats/*`. */
export const FAKE_STATS_COHORTS = {
	complete: { summary: statsCompleteSummary, stages: statsCompleteStages },
	empty: { summary: statsEmptySummary, stages: statsEmptyStages },
	zeroMerges: { summary: statsZeroMergesSummary, stages: statsCompleteStages },
	qaDisabled: { summary: statsCompleteSummary, stages: statsQaDisabledStages },
	partial: { summary: statsCompleteSummary, stages: statsPartialStages },
	/** The stages come from another factory than the summary. */
	mismatch: {
		summary: statsCompleteSummary,
		stages: { ...statsCompleteStages, factoryId: 'factory-geut-02' }
	}
} satisfies Record<string, { summary: Schemas['StatsSummary']; stages: Schemas['StatsStages'] }>;

export type FakeStatsCohort = keyof typeof FAKE_STATS_COHORTS;

/** The ticket fact cohorts the fake can serve for `/v1/stats/tickets`. */
export const FAKE_STATS_TICKETS_COHORTS = {
	complete: statsTicketsComplete,
	smallSample: statsTicketsSmallSample,
	missingTimings: statsTicketsMissingTimings,
	noHandoffs: statsTicketsNoHandoffs,
	empty: { ...statsTicketsComplete, items: [] }
} satisfies Record<string, Schemas['StatsTickets']>;

export type FakeStatsTicketsCohort = keyof typeof FAKE_STATS_TICKETS_COHORTS;

/** The export cohorts the fake can stream for `/v1/stats/export`. */
export const FAKE_STATS_EXPORT_COHORTS = {
	complete: statsExportComplete,
	zeroMerges: statsExportZeroMerges,
	empty: statsExportEmpty,
	/** Every line comes from another factory than the summary. */
	mismatch: {
		tickets: statsExportComplete.tickets.map((line) => ({ ...line, factoryId: 'factory-geut-02' })),
		runs: statsExportComplete.runs.map((line) => ({ ...line, factoryId: 'factory-geut-02' }))
	}
} satisfies Record<string, StatsExportFixture>;

export type FakeStatsExportCohort = keyof typeof FAKE_STATS_EXPORT_COHORTS;

/** How many writes the fake splits an export body into (at arbitrary byte offsets). */
export const FAKE_STATS_EXPORT_CHUNKS = 5;

/**
 * The fake pages stats ticket rows at most this many at a time, whatever
 * `limit` asks for, so the complete cohort spans several pages.
 */
export const FAKE_STATS_TICKETS_PAGE_SIZE = 5;

export type FakeFactoryOptions = {
	token?: string;
	/** The cohort `/v1/stats/summary` and `/v1/stats/stages` serve (default `complete`). */
	statsCohort?: FakeStatsCohort;
	/** Answer this problem for `GET /v1/stats/summary`. */
	failStatsSummary?: Problem;
	/** Answer this problem for `GET /v1/stats/stages`. */
	failStatsStages?: Problem;
	/** The rows `/v1/stats/tickets` pages through (default `complete`, three pages). */
	statsTicketsCohort?: FakeStatsTicketsCohort;
	/**
	 * Answer this problem for `GET /v1/stats/tickets`: every page, or only the
	 * page at this offset (`cursor`, `0` for the first).
	 */
	failStatsTickets?: Problem | { atCursor: number; problem: Problem };
	/** Answer this problem for `GET /v1/stats/configurations`. */
	failStatsConfigurations?: Problem;
	/** The lines `/v1/stats/export` streams (default `complete`). */
	statsExportCohort?: FakeStatsExportCohort;
	/** Answer this problem for `GET /v1/stats/export`. */
	failStatsExport?: Problem;
	/** Inject two malformed lines (not JSON, unknown `type`) after the first export line. */
	statsExportMalformed?: boolean;
	/** Cut the export body in the middle of its last line and end it cleanly. */
	statsExportTruncate?: boolean;
	/** Answer this problem for `GET /v1/tickets/{key}` of these keys. */
	failDetail?: { keys: string[]; problem: Problem };
	/** Answer this problem for `GET /v1/agents`. */
	failAgents?: Problem;
	/** Answer this problem for `GET /v1/tickets`. */
	failTickets?: Problem;
	/** Answer this problem for `GET /v1/tickets?needsUser=true` only: the attention read. */
	failAttention?: Problem;
	/** Answer this problem for `GET /v1/tickets/{key}/runs`. */
	failRuns?: Problem;
	/** Answer this problem for `GET /v1/runs/{id}`. */
	failRun?: Problem;
	/** Answer this problem for `GET /v1/tickets/{key}/executions`. */
	failExecutions?: Problem;
	/** Tickets `GET /v1/tickets?status=all` lists (default: every fixture). */
	tickets?: Schemas['TicketSummary'][];
	/** Issues `GET /v1/backlog` lists (default: every backlog fixture). */
	backlog?: Schemas['BacklogIssue'][];
	/** Answer this problem for `GET /v1/backlog`. */
	failBacklog?: Problem;
	/** Answer this problem for `GET /v1/backlog?refresh=true` only. */
	failBacklogOnRefresh?: Problem;
	/** The `fetchedAt` a `?refresh=true` page answers (default: the fixed time). */
	backlogRefreshedAt?: string;
	/** Issues a `?refresh=true` read lists, and every read after it (default: `backlog`). */
	backlogOnRefresh?: Schemas['BacklogIssue'][];
	/** Answer this problem for `GET /v1/events`. */
	failEvents?: Problem;
	/** The revision before the first appended event (default 0). */
	eventRevision?: number;
	/** Interval of the `: heartbeat` comment on open streams (default 15 s). */
	heartbeatMs?: number;
	/** `false`: the token lacks the `act` scope, so every command is 403 `insufficient_scope`. */
	canAct?: boolean;
	/** Answer this problem for these commands (every command when `commands` is omitted). */
	failCommand?: { commands?: FakeCommand[]; problem: Problem };
	/** Answer this 202 body to every command instead of a `CommandAccepted`. */
	commandBody?: unknown;
	/**
	 * Fields an accepted command sets on its ticket's detail before its event,
	 * so the dashboard's reread after the command shows the change.
	 */
	commandEffects?: Partial<Record<FakeCommand, Partial<Schemas['TicketDetail']>>>;
	/** Wait this long before answering an accepted command, so it stays pending. */
	commandDelayMs?: number;
	/**
	 * An accepted start adds its ticket (plan, queued) before its event and
	 * drops the started backlog issue after it, as the factory does.
	 */
	startAddsTicket?: boolean;
	/**
	 * With `startAddsTicket`: the next backlog read still lists the started
	 * issue, as the factory's tracker cache may, and the read after drops it.
	 */
	startKeepsBacklogIssue?: boolean;
};

/** The factory command an upstream `POST` route names. */
export type FakeCommand = 'start' | 'reply' | 'retry' | 'complete' | 'cancel' | 'rerun' | 'stop';

/** One command the fake received, with what it saw of the headers that matter. */
export type FakeCommandRequest = {
	method: string;
	path: string;
	command: FakeCommand;
	body: unknown;
	idempotencyKey: string | null;
	onBehalfOf: string | null;
	authorization: boolean;
};

/** One event held by the fake, as `/v1/events` frames it. */
export type FakeEvent = { revision: number; kind: string; payload: Schemas['EventPayload'] };

/** What one `/v1/events` connection sent, and whether it is still open. */
export type FakeEventConnection = {
	lastEventId: string | null;
	since: string | null;
	open: boolean;
};

/** `POST /__fake/events`: an event to append, and optionally a ticket the reads then include. */
export type FakeEventInput = {
	kind: string;
	payload: Schemas['EventPayload'];
	addTicket?: { summary: Schemas['TicketSummary']; detail?: Schemas['TicketDetail'] };
};

/** The fixed time the fake says it last asked the tracker. */
export const FAKE_BACKLOG_FETCHED_AT = backlogPage.fetchedAt;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function problem(body: Problem): Response {
	return new Response(JSON.stringify(body), {
		status: body.status,
		headers: { 'content-type': 'application/problem+json' }
	});
}

const unauthorized: Problem = { status: 401, title: 'Unauthorized', type: 'unauthorized' };
const methodNotAllowed: Problem = {
	status: 405,
	title: 'Method not allowed',
	type: 'method_not_allowed',
	detail: 'The fake factory serves GET, and POST on command routes only.'
};
const insufficientScope: Problem = {
	status: 403,
	title: 'Insufficient scope',
	type: 'insufficient_scope',
	detail: 'The token lacks the act scope.'
};

const TICKET_COMMANDS: Record<string, FakeCommand> = {
	replies: 'reply',
	retries: 'retry',
	complete: 'complete',
	cancel: 'cancel',
	reruns: 'rerun'
};

/** The command a `POST` path names, and its target, or null for any other path. */
function commandRoute(
	path: string
): { command: FakeCommand; ticket?: string; run?: string } | null {
	if (path === '/v1/tickets') return { command: 'start' };
	const ticket = path.match(/^\/v1\/tickets\/([^/]+)\/(replies|retries|complete|cancel|reruns)$/);
	if (ticket) {
		return {
			command: TICKET_COMMANDS[ticket[2] ?? ''] as FakeCommand,
			ticket: decodeURIComponent(ticket[1] ?? '')
		};
	}
	const run = path.match(/^\/v1\/runs\/([^/]+)\/stop$/);
	if (run) return { command: 'stop', run: decodeURIComponent(run[1] ?? '') };
	return null;
}

async function bodyOf(request: Request): Promise<unknown> {
	const text = await request.text();
	if (text === '') return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/** A fetch-shaped handler: usable as a fake `fetch` in tests, or behind the HTTP server. */
export function createFakeFactory(options: FakeFactoryOptions = {}) {
	const token = options.token ?? FAKE_FACTORY_TOKEN;
	const listed = [...(options.tickets ?? allTickets)];
	let backlog = options.backlog ?? backlogIssues;
	/** Started issue ids the next backlog read still lists (`startKeepsBacklogIssue`). */
	const droppedAfterRead = new Set<string>();
	const requests: { method: string; path: string }[] = [];
	/** The `from`/`to` of every `/v1/stats/export` read, in order. */
	const exportRequests: { from: string | null; to: string | null }[] = [];
	const commands: FakeCommandRequest[] = [];
	/** The first 202 body per `idempotency-key`. */
	const replays = new Map<string, unknown>();
	let started = 0;

	// The event stream: held events, open streams, and what each connection sent.
	const events: FakeEvent[] = [];
	let latest = options.eventRevision ?? 0;
	const streams = new Set<{ send(text: string): void; close(): void }>();
	const connections: FakeEventConnection[] = [];
	const addedDetails = new Map<string, Schemas['TicketDetail']>();
	const encoder = new TextEncoder();
	/** Details changed by `commandEffects`, by ticket key. */
	const changedDetails = new Map<string, Schemas['TicketDetail']>();
	const detailOf = (key: string) =>
		changedDetails.get(key) ?? addedDetails.get(key) ?? ticketDetails.get(key);

	/** Append an event, add its ticket if any, and send it to every open stream. */
	function emit(input: FakeEventInput): FakeEvent {
		if (input.addTicket) {
			const { summary, detail } = input.addTicket;
			listed.push(summary);
			addedDetails.set(
				summary.key,
				detail ?? { ...summary, attention: [], source: null, tasks: [], usage: usageFor(0) }
			);
		}
		const event = { revision: ++latest, kind: input.kind, payload: input.payload };
		events.push(event);
		for (const stream of streams)
			stream.send(eventFrame(event.revision, event.kind, event.payload));
		return event;
	}

	/** Close every open stream, as a dropped connection would. */
	function dropStreams() {
		for (const stream of [...streams]) stream.close();
	}

	function streamEvents(request: Request, url: URL): Response {
		const lastEventId = request.headers.get('last-event-id');
		const since = url.searchParams.get('since');
		const connection: FakeEventConnection = { lastEventId, since, open: true };
		connections.push(connection);
		const cursor = lastEventId ?? since;
		const from = cursor === null ? latest : Number(cursor);
		let stream: { send(text: string): void; close(): void };
		let heartbeat: ReturnType<typeof setInterval>;
		const cleanup = () => {
			connection.open = false;
			clearInterval(heartbeat);
			streams.delete(stream);
		};
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				stream = {
					send: (text) => controller.enqueue(encoder.encode(text)),
					close: () => {
						cleanup();
						controller.close();
					}
				};
				streams.add(stream);
				stream.send(`: from revision ${from}\n\n`);
				for (const event of events) {
					if (event.revision > from)
						stream.send(eventFrame(event.revision, event.kind, event.payload));
				}
				heartbeat = setInterval(
					() => stream.send(': heartbeat\n\n'),
					options.heartbeatMs ?? 15_000
				);
				request.signal.addEventListener('abort', () => {
					if (!connection.open) return;
					cleanup();
					controller.error(request.signal.reason);
				});
			},
			cancel: cleanup
		});
		return new Response(body, {
			headers: {
				'cache-control': 'no-store',
				'content-type': 'text/event-stream',
				'x-accel-buffering': 'no'
			}
		});
	}

	/** The selected export as NDJSON, written in several chunks split at arbitrary bytes. */
	function streamExport(): Response {
		const fixture = FAKE_STATS_EXPORT_COHORTS[options.statsExportCohort ?? 'complete'];
		let text = statsExportText(fixture);
		if (options.statsExportMalformed) {
			const first = text.indexOf('\n') + 1;
			text = `${text.slice(0, first)}{"type":"ticket",\n{"type":"stage"}\n${text.slice(first)}`;
		}
		if (options.statsExportTruncate) {
			// Drop the final newline and the last 40 characters: a mid-line cut.
			text = text.slice(0, Math.max(0, text.length - 41));
		}
		const bytes = encoder.encode(text);
		const size = Math.ceil(bytes.length / FAKE_STATS_EXPORT_CHUNKS) || 1;
		const chunks: Uint8Array[] = [];
		for (let start = 0; start < bytes.length; start += size) {
			chunks.push(bytes.subarray(start, start + size));
		}
		const body = new ReadableStream<Uint8Array>({
			async pull(controller) {
				const chunk = chunks.shift();
				if (!chunk) return controller.close();
				controller.enqueue(chunk);
				// Yield between writes, so each one reaches the client separately.
				await new Promise((resolve) => setTimeout(resolve, 1));
			}
		});
		return new Response(body, {
			headers: { 'cache-control': 'no-store', 'content-type': 'application/x-ndjson' }
		});
	}

	/**
	 * The ticket a start adds: from the backlog issue whose `displayRef` is the
	 * `ref` (its id becomes the ticket's id), else from the written brief.
	 */
	function startedTicketFor(key: string, body: unknown) {
		const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<
			string,
			unknown
		>;
		const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
		const ref = text(fields.ref);
		const issue = ref === '' ? undefined : backlog.find((item) => item.displayRef === ref);
		const id = issue?.id ?? (text(fields.id) || ref || key);
		const now = new Date().toISOString();
		const summary: Schemas['TicketSummary'] = {
			createdAt: now,
			displayRef: issue?.displayRef ?? (ref || id),
			execution: 1,
			finishedAt: null,
			id,
			key,
			needsUser: false,
			progress: { current: null, done: 0, next: null, total: 0 },
			pullRequest: null,
			sourceRef: issue?.url ?? (ref || id),
			stage: 'plan',
			startedBy: { client: 'dashboard', onBehalfOf: null },
			status: 'queued',
			statusReason: null,
			title: issue?.title ?? (text(fields.text).split('\n')[0] || id),
			trackerWarnings: [],
			updatedAt: now
		};
		return { summary, issue };
	}

	/** A `POST` to a command route: check, record, replay or accept, and emit its event. */
	async function handleCommand(
		request: Request,
		url: URL,
		route: NonNullable<ReturnType<typeof commandRoute>>
	): Promise<Response> {
		const idempotencyKey = request.headers.get('idempotency-key');
		const onBehalfOf = request.headers.get('x-factory-on-behalf-of');
		const authorized = request.headers.get('authorization') === `Bearer ${token}`;
		const body = await bodyOf(request);
		commands.push({
			method: request.method,
			path: url.pathname,
			command: route.command,
			body,
			idempotencyKey,
			onBehalfOf,
			authorization: request.headers.has('authorization')
		});
		if (!authorized) return problem(unauthorized);
		if (options.canAct === false) return problem(insufficientScope);
		const failure = options.failCommand;
		if (failure && (!failure.commands || failure.commands.includes(route.command))) {
			return problem(failure.problem);
		}
		if (idempotencyKey !== null && replays.has(idempotencyKey)) {
			return json(replays.get(idempotencyKey), 202);
		}

		let ticket: string;
		let startedTicket: ReturnType<typeof startedTicketFor> | undefined;
		if (route.command === 'start') {
			ticket = `fake-started-${String(++started).padStart(8, '0')}`;
			if (options.startAddsTicket) {
				startedTicket = startedTicketFor(ticket, body);
			}
		} else if (route.run !== undefined) {
			const run = runsById.get(route.run);
			if (!run) {
				return problem({
					status: 404,
					title: 'Not found',
					type: 'not_found',
					detail: `No run has the id ${route.run}.`
				});
			}
			ticket = run.ticket;
		} else {
			ticket = route.ticket ?? '';
			if (!detailOf(ticket)) {
				return problem({
					status: 404,
					title: 'Ticket not found',
					type: 'ticket_not_found',
					detail: `No ticket has the key ${ticket}.`
				});
			}
		}

		if (options.commandDelayMs) {
			await new Promise((resolve) => setTimeout(resolve, options.commandDelayMs));
		}
		const effect = options.commandEffects?.[route.command];
		const current = detailOf(ticket);
		if (effect && current) changedDetails.set(ticket, { ...current, ...effect });

		const event = emit({
			...(startedTicket && { addTicket: { summary: startedTicket.summary } }),
			kind: route.command,
			payload: {
				actor: { client: 'dashboard', onBehalfOf },
				card: null,
				run: route.run ?? null,
				task: null,
				ticket
			}
		});
		const issue = startedTicket?.issue;
		if (issue) {
			if (options.startKeepsBacklogIssue) droppedAfterRead.add(issue.id);
			else backlog = backlog.filter((item) => item.id !== issue.id);
		}
		const answer =
			options.commandBody ??
			({
				message: `Fake factory accepted ${route.command}.`,
				revision: event.revision,
				ticket
			} satisfies Schemas['CommandAccepted']);
		if (idempotencyKey !== null) replays.set(idempotencyKey, answer);
		return json(answer, 202);
	}

	async function handle(request: Request): Promise<Response> {
		const url = new URL(request.url);
		requests.push({ method: request.method, path: `${url.pathname}${url.search}` });

		if (request.method === 'POST') {
			const route = commandRoute(url.pathname);
			if (route) return handleCommand(request, url, route);
		}
		if (request.method !== 'GET') return problem(methodNotAllowed);
		if (request.headers.get('authorization') !== `Bearer ${token}`) return problem(unauthorized);

		const path = url.pathname;
		if (path === '/v1/events') {
			return options.failEvents ? problem(options.failEvents) : streamEvents(request, url);
		}
		if (path === '/v1/agents') {
			return options.failAgents ? problem(options.failAgents) : json(agentList);
		}
		if (path === '/v1/tickets') {
			if (options.failTickets) return problem(options.failTickets);
			if (options.failAttention && url.searchParams.get('needsUser') === 'true') {
				return problem(options.failAttention);
			}
			const status = url.searchParams.get('status') ?? 'open';
			const byStatus =
				status === 'all'
					? listed
					: status === 'finished'
						? listed.filter((ticket) => !isOpen(ticket))
						: listed.filter(isOpen);
			const needsUser = url.searchParams.get('needsUser');
			const items =
				needsUser === 'true' || needsUser === 'false'
					? byStatus.filter((ticket) => ticket.needsUser === (needsUser === 'true'))
					: byStatus;
			const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), FAKE_PAGE_SIZE);
			const start = Number(url.searchParams.get('cursor') ?? 0);
			const end = start + limit;
			return json({
				items: items.slice(start, end),
				nextCursor: end < items.length ? String(end) : null
			} satisfies Schemas['TicketPage']);
		}
		if (path === '/v1/stats/summary') {
			if (options.failStatsSummary) return problem(options.failStatsSummary);
			return json(FAKE_STATS_COHORTS[options.statsCohort ?? 'complete'].summary);
		}
		if (path === '/v1/stats/stages') {
			if (options.failStatsStages) return problem(options.failStatsStages);
			return json(FAKE_STATS_COHORTS[options.statsCohort ?? 'complete'].stages);
		}
		if (path === '/v1/stats/tickets') {
			const start = Number(url.searchParams.get('cursor') ?? 0);
			const failure = options.failStatsTickets;
			if (failure && 'atCursor' in failure) {
				if (failure.atCursor === start) return problem(failure.problem);
			} else if (failure) {
				return problem(failure);
			}
			const cohort = FAKE_STATS_TICKETS_COHORTS[options.statsTicketsCohort ?? 'complete'];
			const limit = Math.min(
				Number(url.searchParams.get('limit') ?? 50),
				FAKE_STATS_TICKETS_PAGE_SIZE
			);
			const end = start + limit;
			return json({
				...cohort,
				items: cohort.items.slice(start, end),
				nextCursor: end < cohort.items.length ? String(end) : null
			} satisfies Schemas['StatsTickets']);
		}
		if (path === '/v1/stats/export') {
			exportRequests.push({
				from: url.searchParams.get('from'),
				to: url.searchParams.get('to')
			});
			if (options.failStatsExport) return problem(options.failStatsExport);
			return streamExport();
		}
		if (path === '/v1/stats/configurations') {
			if (options.failStatsConfigurations) return problem(options.failStatsConfigurations);
			return json(statsConfigurations);
		}
		if (path === '/v1/backlog') {
			if (options.failBacklog) return problem(options.failBacklog);
			if (options.failBacklogOnRefresh && url.searchParams.get('refresh') === 'true') {
				return problem(options.failBacklogOnRefresh);
			}
			const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), FAKE_PAGE_SIZE);
			const start = Number(url.searchParams.get('cursor') ?? 0);
			const end = start + limit;
			if (options.backlogOnRefresh && url.searchParams.get('refresh') === 'true') {
				backlog = options.backlogOnRefresh;
			}
			const refreshed = url.searchParams.get('refresh') === 'true' && options.backlogRefreshedAt;
			const page = json({
				fetchedAt: refreshed || FAKE_BACKLOG_FETCHED_AT,
				items: backlog.slice(start, end),
				nextCursor: end < backlog.length ? String(end) : null
			} satisfies Schemas['BacklogPage']);
			// One read is every page: drop the kept issues once its last page is served.
			if (droppedAfterRead.size > 0 && end >= backlog.length) {
				backlog = backlog.filter((item) => !droppedAfterRead.has(item.id));
				droppedAfterRead.clear();
			}
			return page;
		}

		const runMatch = path.match(/^\/v1\/runs\/([^/]+)$/);
		if (runMatch) {
			if (options.failRun) return problem(options.failRun);
			const id = decodeURIComponent(runMatch[1] ?? '');
			const run = runsById.get(id);
			if (!run) {
				return problem({
					status: 404,
					title: 'Not found',
					type: 'not_found',
					detail: `No run has the id ${id}.`
				});
			}
			return json(run);
		}

		const match = path.match(/^\/v1\/tickets\/([^/]+)(\/executions|\/runs)?$/);
		if (match) {
			const key = decodeURIComponent(match[1] ?? '');
			const detail = detailOf(key);
			if (!detail) {
				return problem({
					status: 404,
					title: 'Ticket not found',
					type: 'ticket_not_found',
					detail: `No ticket has the key ${key}.`
				});
			}
			if (match[2] === '/executions') {
				return options.failExecutions ? problem(options.failExecutions) : json(executionsFor(key));
			}

			// `?execution=n`: the current execution, a past one, or 404 `not_found`.
			const executionParam = url.searchParams.get('execution');
			let shown: { detail: Schemas['TicketDetail']; runs: Schemas['RunPage'] } = {
				detail,
				runs: runPageFor(key)
			};
			if (executionParam !== null && Number(executionParam) !== detail.execution) {
				const past = pastExecutions.get(key)?.get(Number(executionParam));
				if (!past) {
					return problem({
						status: 404,
						title: 'Not found',
						type: 'not_found',
						detail: `The ticket has no execution ${executionParam}.`
					});
				}
				shown = past;
			}

			if (match[2] === '/runs') {
				if (options.failRuns) return problem(options.failRuns);
				const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), FAKE_PAGE_SIZE);
				const start = Number(url.searchParams.get('cursor') ?? 0);
				const end = start + limit;
				return json({
					items: shown.runs.items.slice(start, end),
					nextCursor: end < shown.runs.items.length ? String(end) : null
				} satisfies Schemas['RunPage']);
			}
			if (options.failDetail?.keys.includes(key)) return problem(options.failDetail.problem);
			return json(shown.detail);
		}

		return problem({ status: 404, title: 'Not found', type: 'not_found' });
	}

	return {
		handle,
		requests,
		/** The query of every `/v1/stats/export` read. */
		exportRequests,
		/** Every command received, in order, replays and refusals included. */
		commands,
		emit,
		dropStreams,
		connections,
		/** How many `/v1/events` streams are open now. */
		openStreams: () => streams.size
	};
}

export type FakeFactory = ReturnType<typeof createFakeFactory>;

async function readJson(incoming: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of incoming) chunks.push(chunk as Buffer);
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Serve the fake over HTTP. Resolves once it listens. */
export async function startFakeFactory(
	port = FAKE_FACTORY_PORT,
	options: FakeFactoryOptions = {}
): Promise<{ server: Server; requests: { method: string; path: string }[]; fake: FakeFactory }> {
	const fake = createFakeFactory(options);
	const sendJson = (outgoing: ServerResponse, body: unknown) => {
		outgoing.writeHead(200, { 'content-type': 'application/json' });
		outgoing.end(JSON.stringify(body));
	};
	const server = createServer(async (incoming, outgoing) => {
		// Test-only probes, not factory routes: what the dashboard sent so far, and
		// the event stream's controls.
		if (incoming.url === '/__fake/requests') return sendJson(outgoing, fake.requests);
		if (incoming.url === '/__fake/stats-export')
			return sendJson(outgoing, fake.exportRequests);
		if (incoming.url === '/__fake/commands') return sendJson(outgoing, fake.commands);
		if (incoming.url === '/__fake/events/connections') return sendJson(outgoing, fake.connections);
		if (incoming.method === 'POST' && incoming.url === '/__fake/events/drop') {
			fake.dropStreams();
			return sendJson(outgoing, { dropped: true });
		}
		if (incoming.method === 'POST' && incoming.url === '/__fake/events') {
			return sendJson(outgoing, fake.emit((await readJson(incoming)) as FakeEventInput));
		}

		const headers = new Headers();
		for (const [name, value] of Object.entries(incoming.headers)) {
			if (typeof value === 'string') headers.set(name, value);
		}
		// The client going away aborts the request, and with it any stream.
		let body: string | undefined;
		if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
			const chunks: Buffer[] = [];
			for await (const chunk of incoming) chunks.push(chunk as Buffer);
			body = Buffer.concat(chunks).toString('utf8');
		}
		const abort = new AbortController();
		outgoing.once('close', () => abort.abort());
		const response = await fake.handle(
			new Request(`http://127.0.0.1:${port}${incoming.url ?? '/'}`, {
				method: incoming.method,
				headers,
				body,
				signal: abort.signal
			})
		);
		outgoing.writeHead(response.status, Object.fromEntries(response.headers));
		if (!response.body) return void outgoing.end();
		outgoing.flushHeaders();
		// Pipe the body chunk by chunk, so a stream reaches the client as it is written.
		const reader = response.body.getReader();
		outgoing.once('close', () => void reader.cancel().catch(() => {}));
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				outgoing.write(value);
			}
		} catch {
			// The stream was cancelled or errored: the socket is closing.
		}
		outgoing.end();
	});
	// Open event streams never end on their own: closing the server drops them first.
	const close = server.close.bind(server);
	server.close = (callback) => {
		fake.dropStreams();
		server.closeAllConnections();
		return close(callback);
	};
	await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
	return { server, requests: fake.requests, fake };
}

// `node test/fake-factory.ts` starts the server (Playwright's webServer does this).
if (import.meta.url === `file://${process.argv[1]}`) {
	await startFakeFactory();
	console.log(`fake factory listening on ${FAKE_FACTORY_URL}`);
}
