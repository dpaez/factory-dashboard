/**
 * A fake factory server for e2e and load tests. It serves the typed fixtures
 * for the GET routes the dashboard reads, checks the bearer token, and
 * answers 405 to anything but GET. Only the test probes change state: they
 * append events to the `/v1/events` stream and can add a ticket with them.
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
			...(fixtureDetails.get(ticket.key) ?? { ...ticket, attention: [], tasks: [] }),
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

export type FakeFactoryOptions = {
	token?: string;
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
	detail: 'The fake factory serves GET only.'
};

/** A fetch-shaped handler: usable as a fake `fetch` in tests, or behind the HTTP server. */
export function createFakeFactory(options: FakeFactoryOptions = {}) {
	const token = options.token ?? FAKE_FACTORY_TOKEN;
	const listed = [...(options.tickets ?? allTickets)];
	let backlog = options.backlog ?? backlogIssues;
	const requests: { method: string; path: string }[] = [];

	// The event stream: held events, open streams, and what each connection sent.
	const events: FakeEvent[] = [];
	let latest = options.eventRevision ?? 0;
	const streams = new Set<{ send(text: string): void; close(): void }>();
	const connections: FakeEventConnection[] = [];
	const addedDetails = new Map<string, Schemas['TicketDetail']>();
	const encoder = new TextEncoder();
	const detailOf = (key: string) => addedDetails.get(key) ?? ticketDetails.get(key);

	/** Append an event, add its ticket if any, and send it to every open stream. */
	function emit(input: FakeEventInput): FakeEvent {
		if (input.addTicket) {
			const { summary, detail } = input.addTicket;
			listed.push(summary);
			addedDetails.set(
				summary.key,
				detail ?? { ...summary, attention: [], tasks: [], usage: usageFor(0) }
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

	async function handle(request: Request): Promise<Response> {
		const url = new URL(request.url);
		requests.push({ method: request.method, path: `${url.pathname}${url.search}` });

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
			return json({
				fetchedAt: refreshed || FAKE_BACKLOG_FETCHED_AT,
				items: backlog.slice(start, end),
				nextCursor: end < backlog.length ? String(end) : null
			} satisfies Schemas['BacklogPage']);
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
		const abort = new AbortController();
		outgoing.once('close', () => abort.abort());
		const response = await fake.handle(
			new Request(`http://127.0.0.1:${port}${incoming.url ?? '/'}`, {
				method: incoming.method,
				headers,
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
