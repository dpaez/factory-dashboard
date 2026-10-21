import { describe, expect, it } from 'vitest';

import {
	ticketDetailAgentQuestion,
	ticketDetailFailedWithQuestion,
	ticketDetailManualApproval,
	ticketDetailPolicyLimit,
	ticketFailed,
	ticketLongValues,
	ticketPaused,
	ticketReadyForHandoff,
	ticketResumeFailed,
	ticketWaitingForAgentQuestion,
	ticketWaitingForManualApproval,
	ticketWaitingForPolicyLimit
} from '$lib/factory/fixtures';
import type { components } from '$lib/factory/generated/factory-api';

import { attentionReasons, nextAttention, toAttention, type AttentionModel } from './attention';

type Schemas = components['schemas'];
type Attention = Schemas['Attention'];

function model(
	tickets: Schemas['TicketSummary'][],
	details: (Schemas['TicketDetail'] | null)[] = [],
	complete = true
): AttentionModel {
	return toAttention({ tickets, details, complete });
}

function request(kind: Attention['kind'], status: Attention['status']): Attention {
	return { id: `att_${kind}_${status}`, kind, status, question: 'Q?', replies: [], runId: null };
}

const waiting = { status: 'waiting_for_user' } as const;

describe('attentionReasons', () => {
	it.each([
		['agent_question', 'question'],
		['policy_limit', 'limit'],
		['manual_approval', 'approval']
	] as const)('maps an open %s to %s', (kind, reason) => {
		expect(attentionReasons(waiting, { attention: [request(kind, 'open')] })).toEqual([reason]);
	});

	it.each(['answered', 'resolved', 'resuming', 'cancelled'] as const)(
		'ignores %s requests',
		(status) => {
			const attention = (['agent_question', 'policy_limit', 'manual_approval'] as const).map(
				(kind) => request(kind, status)
			);
			expect(attentionReasons(waiting, { attention })).toEqual(['waiting']);
		}
	);

	it('reads the fixture details: open requests only', () => {
		expect(attentionReasons(ticketWaitingForAgentQuestion, ticketDetailAgentQuestion)).toEqual([
			'question'
		]);
		expect(attentionReasons(ticketWaitingForPolicyLimit, ticketDetailPolicyLimit)).toEqual([
			'limit'
		]);
		expect(attentionReasons(ticketWaitingForManualApproval, ticketDetailManualApproval)).toEqual([
			'approval'
		]);
	});

	it('maps statuses', () => {
		expect(attentionReasons(ticketPaused, null)).toEqual(['paused']);
		expect(attentionReasons(ticketFailed, null)).toEqual(['failed']);
		expect(attentionReasons(ticketResumeFailed, null)).toEqual(['failed']);
		expect(attentionReasons(ticketReadyForHandoff, null)).toEqual(['handoff']);
	});

	it('falls back to waiting when nothing applies', () => {
		expect(attentionReasons(ticketLongValues, null)).toEqual(['waiting']);
		expect(attentionReasons(ticketWaitingForAgentQuestion, undefined)).toEqual(['waiting']);
		expect(attentionReasons({ status: 'hibernating' }, { attention: [] })).toEqual(['waiting']);
		expect(
			attentionReasons(waiting, {
				attention: [{ ...request('agent_question', 'open'), kind: 'telepathy' }]
			})
		).toEqual(['waiting']);
	});

	it('de-duplicates and keeps the fixed order', () => {
		expect(
			attentionReasons(
				{ status: 'paused' },
				{
					attention: [
						request('manual_approval', 'open'),
						request('agent_question', 'open'),
						request('agent_question', 'open')
					]
				}
			)
		).toEqual(['question', 'approval', 'paused']);
		expect(attentionReasons(ticketFailed, ticketDetailFailedWithQuestion)).toEqual([
			'question',
			'failed'
		]);
	});
});

describe('toAttention', () => {
	it('counts a ticket with two reasons once, queues it once, and counts it in each group', () => {
		const result = model(
			[ticketFailed, ticketWaitingForAgentQuestion],
			[ticketDetailFailedWithQuestion, ticketDetailAgentQuestion]
		);
		expect(result.headline).toEqual({ count: 2, complete: true });
		expect(result.queue.filter((item) => item.key === ticketFailed.key)).toHaveLength(1);
		expect(result.groups).toEqual([
			{ reason: 'question', label: 'Question', signal: 'wait', count: 2 },
			{ reason: 'failed', label: 'Failed', signal: 'fault', count: 1 }
		]);
	});

	it('keeps a ticket with no derivable reason as Waiting for a reply', () => {
		const result = model([ticketLongValues]);
		expect(result.queue.map((item) => [item.key, item.reasons])).toEqual([
			[ticketLongValues.key, ['waiting']]
		]);
		expect(result.groups).toEqual([
			{ reason: 'waiting', label: 'Waiting for a reply', signal: 'wait', count: 1 }
		]);
	});

	it('projects the item fields, with since from updatedAt', () => {
		const [item] = model([ticketReadyForHandoff]).queue;
		expect(item).toEqual({
			key: ticketReadyForHandoff.key,
			displayRef: ticketReadyForHandoff.displayRef,
			title: ticketReadyForHandoff.title,
			reasons: ['handoff'],
			priority: 1,
			since: ticketReadyForHandoff.updatedAt
		});
	});

	it('orders decisions, waiting, paused and failed before handoff-only, oldest first, ties by key', () => {
		const older = { ...ticketReadyForHandoff, key: 'a-handoff', updatedAt: '2026-01-01T00:00:00Z' };
		const newest = { ...ticketPaused, key: 'z-paused', updatedAt: '2026-12-01T00:00:00Z' };
		const tickets = [
			older,
			newest,
			ticketWaitingForManualApproval,
			ticketFailed,
			ticketPaused,
			ticketLongValues,
			ticketReadyForHandoff
		];
		// The fixtures share `updatedAt`; only key separates them.
		expect(ticketFailed.updatedAt).toBe(ticketPaused.updatedAt);
		const keys = model(tickets, [ticketDetailManualApproval]).queue.map((item) => item.key);
		expect(keys).toEqual([
			...[
				ticketWaitingForManualApproval.key,
				ticketPaused.key,
				ticketFailed.key,
				ticketLongValues.key
			]
				.slice()
				.sort(),
			newest.key,
			older.key,
			ticketReadyForHandoff.key
		]);
	});

	it('puts a handoff ticket with an open request in the first group', () => {
		const handoffWithApproval = { ...ticketDetailManualApproval, ...ticketReadyForHandoff };
		const [item] = model(
			[ticketReadyForHandoff],
			[{ ...handoffWithApproval, attention: ticketDetailManualApproval.attention }]
		).queue;
		expect(item?.reasons).toEqual(['approval', 'handoff']);
		expect(item?.priority).toBe(0);
	});

	it('is independent of input order', () => {
		const tickets = [ticketPaused, ticketReadyForHandoff, ticketFailed, ticketLongValues];
		expect(model(tickets).queue).toEqual(model([...tickets].reverse()).queue);
	});

	it('marks a partial headline', () => {
		expect(model([ticketPaused], [], false).headline).toEqual({ count: 1, complete: false });
	});

	it('is empty with no tickets', () => {
		expect(model([])).toEqual({ headline: { count: 0, complete: true }, groups: [], queue: [] });
	});
});

describe('nextAttention', () => {
	const queue = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
	const none = new Set<string>();

	it('returns null for an empty queue', () => {
		expect(nextAttention([], null, none)).toBeNull();
		expect(nextAttention([], 'a', new Set(['a']))).toBeNull();
	});

	it('returns the first unvisited item that is not the current selection', () => {
		expect(nextAttention(queue, null, none)?.key).toBe('a');
		expect(nextAttention(queue, 'a', none)?.key).toBe('b');
		expect(nextAttention(queue, 'b', new Set(['a']))?.key).toBe('c');
	});

	it('advances through the queue on repeated calls, then wraps', () => {
		let current: string | null = null;
		let visited: ReadonlySet<string> = none;
		const targets: string[] = [];
		for (let i = 0; i < 5; i++) {
			const next = nextAttention(queue, current, visited);
			if (!next) throw new Error('expected a target');
			targets.push(next.key);
			current = next.key;
			visited = next.visited;
		}
		expect(targets).toEqual(['a', 'b', 'c', 'a', 'b']);
	});

	it('wraps to the first item that is not current', () => {
		const next = nextAttention(queue, 'a', new Set(['a', 'b', 'c']));
		expect(next?.key).toBe('b');
		expect([...(next?.visited ?? [])]).toEqual(['b']);
	});

	it('re-selects a lone item that is already current', () => {
		expect(nextAttention([{ key: 'a' }], 'a', new Set(['a']))?.key).toBe('a');
		expect(nextAttention([{ key: 'a' }], 'a', none)?.key).toBe('a');
	});

	it('does not mutate the visited set', () => {
		const visited = new Set(['a']);
		nextAttention(queue, null, visited);
		expect([...visited]).toEqual(['a']);
	});

	it('never returns an item that left the queue, and forgets it', () => {
		const next = nextAttention([{ key: 'b' }, { key: 'c' }], 'b', new Set(['a', 'b']));
		expect(next?.key).toBe('c');
		expect([...(next?.visited ?? [])].sort()).toEqual(['b', 'c']);
	});

	it('keeps the target stable when items are added or reordered without a call', () => {
		// The selection only moves through a call; new data just changes the next target.
		const first = nextAttention(queue, null, none);
		expect(first?.key).toBe('a');
		const grown = [{ key: 'z' }, ...queue];
		const second = nextAttention(grown, first!.key, first!.visited);
		expect(second?.key).toBe('z');
		const reordered = [{ key: 'c' }, { key: 'a' }, { key: 'b' }];
		expect(nextAttention(reordered, 'a', new Set(['a']))?.key).toBe('c');
	});
});
