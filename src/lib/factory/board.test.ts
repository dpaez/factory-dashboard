import { describe, expect, it } from 'vitest';

import {
	agentList,
	ticketActiveInPlan,
	ticketActiveInQa,
	ticketActiveInWork,
	ticketCancelled,
	ticketCompleteInDone,
	ticketDetailActiveInQa,
	ticketDetailActiveInWork,
	ticketDetailQueued,
	ticketFailed,
	ticketPaused,
	ticketQueuedInPlan,
	ticketReadyForHandoff,
	ticketSummaries,
	ticketUnknownStage,
	ticketWaitingForAgentQuestion,
	ticketWaitingForManualApproval,
	ticketWaitingForPolicyLimit
} from '$lib/factory/fixtures';
import type { components } from '$lib/factory/generated/factory-api';

import { toBoard, type Board, type BoardLane } from './board';
import { EXECUTION_STATUS_SIGNALS, PREPARING_HANDOFF } from './status';

type Schemas = components['schemas'];

function board(
	tickets: Schemas['TicketSummary'][],
	details: (Schemas['TicketDetail'] | null)[] = [],
	options: { complete?: boolean; agents?: Schemas['AgentList'] | null } = {}
): Board {
	return toBoard({
		tickets,
		complete: options.complete ?? true,
		agents: options.agents === undefined ? agentList : options.agents,
		details
	});
}

function lane(result: Board, id: BoardLane['id']): BoardLane {
	const found = result.lanes.find((l) => l.id === id);
	if (!found) throw new Error(`no ${id} lane`);
	return found;
}

function laneOfKey(result: Board, key: string): string | undefined {
	return result.lanes.find((l) => l.cards.some((card) => card.key === key))?.id;
}

describe('toBoard lanes', () => {
	it('maps each known stage to its lane in Plan, Work, QA, Review, Handoff order', () => {
		const result = board(ticketSummaries);
		expect(result.lanes.map(({ id, label }) => ({ id, label }))).toEqual([
			{ id: 'plan', label: 'Plan' },
			{ id: 'work', label: 'Work' },
			{ id: 'qa', label: 'QA' },
			{ id: 'review', label: 'Review' },
			{ id: 'handoff', label: 'Handoff' }
		]);
		expect(laneOfKey(result, ticketActiveInPlan.key)).toBe('plan');
		expect(laneOfKey(result, ticketActiveInWork.key)).toBe('work');
		expect(laneOfKey(result, ticketActiveInQa.key)).toBe('qa');
		expect(laneOfKey(result, ticketWaitingForAgentQuestion.key)).toBe('review');
		expect(laneOfKey(result, ticketReadyForHandoff.key)).toBe('handoff');
	});

	it('appends an Other lane only for an unknown stage, with the raw stage label', () => {
		const result = board([ticketActiveInWork, ticketUnknownStage]);
		expect(result.lanes.map((l) => l.id)).toEqual([
			'plan',
			'work',
			'qa',
			'review',
			'handoff',
			'other'
		]);
		const other = lane(result, 'other');
		expect(other.label).toBe('Other');
		expect(other.cards).toHaveLength(1);
		expect(other.cards[0]).toMatchObject({
			key: ticketUnknownStage.key,
			stage: 'triage',
			rawStage: 'triage'
		});
		expect(lane(result, 'work').cards[0]?.stage).toBe('Work');
	});

	it('keeps paused, failed and waiting tickets in their stage lane', () => {
		const result = board([ticketPaused, ticketWaitingForPolicyLimit, ticketFailed]);
		expect(laneOfKey(result, ticketPaused.key)).toBe('work');
		expect(laneOfKey(result, ticketWaitingForPolicyLimit.key)).toBe('work');
		expect(laneOfKey(result, ticketFailed.key)).toBe('plan');
		expect(lane(result, 'work').cards.find((c) => c.key === ticketPaused.key)?.badge).toEqual(
			EXECUTION_STATUS_SIGNALS.paused
		);
	});

	it('leaves complete, cancelled and done-stage tickets off the board', () => {
		const doneButOpen = {
			...ticketActiveInWork,
			key: 'done-but-open',
			stage: 'done'
		} satisfies Schemas['TicketSummary'];
		const completeInReview = {
			...ticketActiveInWork,
			key: 'complete-in-review',
			stage: 'review',
			status: 'complete'
		} satisfies Schemas['TicketSummary'];
		const result = board([
			ticketCompleteInDone,
			ticketCancelled,
			doneButOpen,
			completeInReview,
			ticketActiveInWork
		]);
		const keys = result.lanes.flatMap((l) => l.cards.map((card) => card.key));
		expect(keys).toEqual([ticketActiveInWork.key]);
		expect(result.summary.inProgress).toBe(1);
	});

	it('orders cards within a lane by ticket key, not by updatedAt', () => {
		const a = { ...ticketActiveInWork, key: 'a-ticket', updatedAt: '2026-10-01T00:00:00Z' };
		const b = { ...ticketActiveInWork, key: 'b-ticket', updatedAt: '2026-10-20T00:00:00Z' };
		const c = { ...ticketActiveInWork, key: 'c-ticket', updatedAt: '2026-10-10T00:00:00Z' };
		const expected = ['a-ticket', 'b-ticket', 'c-ticket'];
		for (const order of [
			[c, a, b],
			[b, c, a]
		]) {
			expect(board(order).lanes[1]?.cards.map((card) => card.key)).toEqual(expected);
		}
	});
});

describe('toBoard handoff badges', () => {
	it('reads Preparing handoff while wrapup runs and Ready for handoff when ready', () => {
		const running = ['active', 'queued', 'resuming'].map((status, index) => ({
			...ticketReadyForHandoff,
			key: `wrapup-${index}-${status}`,
			status: status as Schemas['TicketSummary']['status']
		}));
		const result = board([ticketReadyForHandoff, ticketWaitingForManualApproval, ...running]);
		const badges = Object.fromEntries(
			lane(result, 'handoff').cards.map((card) => [card.key, card.badge])
		);
		expect(badges[ticketReadyForHandoff.key]).toEqual({
			signal: 'wait',
			label: 'Ready for handoff'
		});
		expect(badges[ticketReadyForHandoff.key]).toEqual(EXECUTION_STATUS_SIGNALS.ready_for_handoff);
		for (const ticket of running) expect(badges[ticket.key]).toEqual(PREPARING_HANDOFF);
		expect(PREPARING_HANDOFF.label).toBe('Preparing handoff');
		expect(badges[ticketWaitingForManualApproval.key]).toEqual(
			EXECUTION_STATUS_SIGNALS.waiting_for_user
		);
	});

	it('keeps the normal status badge for an active ticket outside Handoff', () => {
		const card = lane(board([ticketActiveInWork]), 'work').cards[0];
		expect(card?.badge).toEqual(EXECUTION_STATUS_SIGNALS.active);
	});
});

describe('toBoard QA lane', () => {
	it('is optional when no visible ticket has QA activity', () => {
		const result = board([ticketActiveInWork], [ticketDetailQueued]);
		expect(lane(result, 'qa')).toMatchObject({ optional: true, cards: [] });
	});

	it('is not optional when a visible ticket is in stage qa', () => {
		expect(lane(board([ticketActiveInQa]), 'qa').optional).toBe(false);
	});

	it('is not optional when a read detail has a qa task summary', () => {
		const inReview = {
			...ticketDetailActiveInQa,
			stage: 'review'
		} satisfies Schemas['TicketDetail'];
		const result = board([inReview], [inReview]);
		expect(lane(result, 'qa').cards).toEqual([]);
		expect(lane(result, 'qa').optional).toBe(false);
	});

	it('ignores qa summaries on tickets that left the board', () => {
		const finished = {
			...ticketDetailActiveInQa,
			stage: 'done',
			status: 'complete'
		} satisfies Schemas['TicketDetail'];
		expect(lane(board([finished], [finished]), 'qa').optional).toBe(true);
	});
});

describe('toBoard cards', () => {
	it('takes cost from the ticket detail, and null only where the read failed', () => {
		const result = board(
			[ticketActiveInWork, ticketQueuedInPlan, ticketActiveInPlan],
			[ticketDetailActiveInWork, ticketDetailQueued, null]
		);
		const cost = Object.fromEntries(
			result.lanes.flatMap((l) => l.cards).map((card) => [card.key, card.costUsd])
		);
		expect(cost).toEqual({
			[ticketActiveInWork.key]: 3.42,
			[ticketQueuedInPlan.key]: 0,
			[ticketActiveInPlan.key]: null
		});
	});

	it('keeps done, total and current task, and represents total 0 as is', () => {
		const result = board([ticketActiveInWork, ticketPaused]);
		const [active, paused] = lane(result, 'work').cards;
		expect(active).toMatchObject({
			currentTask: 'Typed read operations and API fixtures',
			progress: { done: 2, total: 5, current: 'Typed read operations and API fixtures' }
		});
		expect(paused).toMatchObject({
			currentTask: null,
			progress: { done: 0, total: 0, current: null }
		});
		expect(Object.keys(paused!.progress).sort()).toEqual(['current', 'done', 'total']);
	});

	it('carries the ticket facts the card shows', () => {
		const card = lane(board([ticketReadyForHandoff]), 'handoff').cards[0];
		expect(card).toMatchObject({
			key: ticketReadyForHandoff.key,
			displayRef: ticketReadyForHandoff.displayRef,
			title: ticketReadyForHandoff.title,
			stage: 'Handoff',
			rawStage: 'wrapup',
			status: 'ready_for_handoff',
			needsUser: true,
			updatedAt: ticketReadyForHandoff.updatedAt
		});
	});
});

describe('toBoard summary', () => {
	it('counts board cards, agents, and leaves ready to start unavailable', () => {
		const result = board(ticketSummaries);
		const cards = result.lanes.flatMap((l) => l.cards).length;
		expect(result.summary).toEqual({
			inProgress: cards,
			inProgressComplete: true,
			agentsRunning: agentList.items.length,
			readyToStart: null
		});
		expect(cards).toBe(ticketSummaries.length - 2);
	});

	it('flags in progress as partial when the list is incomplete', () => {
		const result = board([ticketActiveInWork], [], { complete: false });
		expect(result.summary).toMatchObject({ inProgress: 1, inProgressComplete: false });
	});

	it('reports agents running as null when the agents read failed', () => {
		expect(board([], [], { agents: null }).summary.agentsRunning).toBeNull();
		expect(board([], [], { agents: { items: [] } }).summary.agentsRunning).toBe(0);
	});
});
