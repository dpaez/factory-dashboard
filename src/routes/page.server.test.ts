import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Board, BoardCard } from '$lib/factory/board';
import {
	agentList,
	ticketActiveInQa,
	ticketActiveInWork,
	ticketCancelled,
	ticketPaused,
	ticketReadyForHandoff
} from '$lib/factory/fixtures';

import {
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	openTickets,
	ticketDetails,
	type FakeFactoryOptions
} from '../../test/fake-factory';
import { load } from './+page.server';

vi.mock('$env/dynamic/private', () => ({
	env: {
		get FACTORY_API_URL() {
			return process.env.FACTORY_API_URL;
		},
		get FACTORY_API_TOKEN() {
			return process.env.FACTORY_API_TOKEN;
		},
		get FACTORY_OPERATOR_NAME() {
			return process.env.FACTORY_OPERATOR_NAME;
		}
	}
}));

const FACTORY_HOST = 'factory.overview-test.internal';
const FACTORY_URL = `http://${FACTORY_HOST}:7731`;

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
});

async function run(options: FakeFactoryOptions = {}) {
	const fake = createFakeFactory(options);
	// No `url`: the load must not read the search params, so selection never refetches.
	const event = { fetch: fake.handle } as unknown as Parameters<typeof load>[0];
	const data = (await load(event)) as { board: Board };
	return { data, requests: fake.requests };
}

async function pageError(options: FakeFactoryOptions = {}) {
	try {
		await run(options);
	} catch (cause) {
		if (isHttpError(cause)) return cause;
		throw cause;
	}
	throw new Error('load did not throw');
}

const cards = (board: Board): BoardCard[] => board.lanes.flatMap((lane) => lane.cards);
const laneOf = (board: Board, key: string) =>
	board.lanes.find((lane) => lane.cards.some((card) => card.key === key))?.id;

/** Open, non-terminal tickets: the ones the board shows. */
const onBoard = openTickets.filter(
	(ticket) => !['complete', 'cancelled'].includes(ticket.status) && ticket.stage !== 'done'
);

describe('/ load', () => {
	it('reads open tickets, agents and each open ticket, and builds the board', async () => {
		const { data, requests } = await run();
		const { board } = data;

		expect(requests.every((request) => request.method === 'GET')).toBe(true);
		expect(
			requests.some((r) => r.path.startsWith('/v1/tickets?') && r.path.includes('status=open'))
		).toBe(true);
		expect(requests.some((r) => r.path === '/v1/agents')).toBe(true);
		for (const ticket of openTickets) {
			expect(requests.some((r) => r.path === `/v1/tickets/${ticket.key}`)).toBe(true);
		}

		expect(board.lanes.map((lane) => lane.label)).toEqual([
			'Plan',
			'Work',
			'QA',
			'Review',
			'Handoff'
		]);
		expect(
			cards(board)
				.map((card) => card.key)
				.sort()
		).toEqual(onBoard.map((ticket) => ticket.key).sort());
		expect(laneOf(board, ticketActiveInQa.key)).toBe('qa');
		expect(laneOf(board, ticketPaused.key)).toBe('work');
		expect(laneOf(board, ticketReadyForHandoff.key)).toBe('handoff');
		expect(laneOf(board, ticketCancelled.key)).toBeUndefined();

		expect(board.summary).toEqual({
			inProgress: onBoard.length,
			inProgressComplete: true,
			agentsRunning: agentList.items.length,
			readyToStart: null
		});
		for (const card of cards(board)) {
			expect(card.costUsd).toBe(ticketDetails.get(card.key)?.usage.costUsd);
		}
	});

	it('shows empty lanes when nothing is open', async () => {
		const { data } = await run({ tickets: [] });
		expect(cards(data.board)).toEqual([]);
		expect(data.board.summary.inProgress).toBe(0);
	});

	it.each([
		['401', { status: 401, title: 'Unauthorized', type: 'unauthorized' }],
		['403', { status: 403, title: 'Forbidden', type: 'insufficient_scope' }]
	] as const)('a %s on the ticket read is the configuration error', async (_, problem) => {
		const error = await pageError({ failTickets: problem });
		expect(error.status).toBe(503);
		expect(error.body.kind).toBe('configuration');
	});

	it('a wrong token is the configuration error, not an empty board', async () => {
		process.env.FACTORY_API_TOKEN = 'not-the-token';
		const error = await pageError();
		expect(error.status).toBe(503);
		expect(error.body.kind).toBe('configuration');
	});

	it('a 401 on a detail read is still the configuration error', async () => {
		const error = await pageError({
			failDetail: {
				keys: [ticketActiveInWork.key],
				problem: { status: 401, title: 'Unauthorized', type: 'unauthorized' }
			}
		});
		expect(error.body.kind).toBe('configuration');
	});

	it.each([['FACTORY_API_URL'], ['FACTORY_API_TOKEN']])(
		'missing %s is the configuration error naming it',
		async (name) => {
			delete process.env[name];
			const error = await pageError();
			expect(error.status).toBe(503);
			expect(error.body.kind).toBe('configuration');
			expect(error.body.detail).toContain(name);
		}
	);

	it('a failing agents read makes only agents running unavailable', async () => {
		const { data } = await run({
			failAgents: { status: 500, title: 'Internal error', type: 'internal_error' }
		});
		expect(data.board.summary.agentsRunning).toBeNull();
		expect(cards(data.board)).toHaveLength(onBoard.length);
		expect(cards(data.board).every((card) => card.costUsd !== null)).toBe(true);
	});

	it('one failing detail read makes only that card cost unavailable', async () => {
		const { data } = await run({
			failDetail: {
				keys: [ticketActiveInWork.key],
				problem: { status: 500, title: 'Internal error', type: 'internal_error' }
			}
		});
		const board = cards(data.board);
		expect(board).toHaveLength(onBoard.length);
		expect(board.find((card) => card.key === ticketActiveInWork.key)?.costUsd).toBeNull();
		expect(
			board.filter((card) => card.key !== ticketActiveInWork.key).every((c) => c.costUsd !== null)
		).toBe(true);
		expect(data.board.summary.agentsRunning).toBe(agentList.items.length);
	});

	it('serialized page data has no token, factory URL or host', async () => {
		const { data } = await run();
		const serialized = JSON.stringify(data);
		expect(serialized).not.toContain(FAKE_FACTORY_TOKEN);
		expect(serialized).not.toContain(FACTORY_URL);
		expect(serialized).not.toContain(FACTORY_HOST);
	});

	it('the configuration error body has no token, factory URL or host', async () => {
		const error = await pageError({
			failTickets: { status: 401, title: 'Unauthorized', type: 'unauthorized' }
		});
		const serialized = JSON.stringify(error.body);
		expect(serialized).not.toContain(FAKE_FACTORY_TOKEN);
		expect(serialized).not.toContain(FACTORY_HOST);
	});
});
