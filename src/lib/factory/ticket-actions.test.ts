import { describe, expect, it } from 'vitest';

import { commandTarget, type CommandPhase } from './commands';
import type { AttentionView, RunView, TicketDetailView } from './models';
import {
	ACTION_REASONS,
	TICKET_ACTIONS,
	ticketActions,
	type ActionAvailability,
	type TicketAction,
	type TicketActionsInput
} from './ticket-actions';

const KEY = 'dpaez-factory-dashboard-29-b8d88146';

function run(id: string, status: RunView['status'], sequence = 1): RunView {
	return {
		id,
		sequence,
		stage: 'work',
		task: '01',
		purpose: 'initial',
		round: 1,
		model: 'model',
		thinking: 'low',
		status,
		terminalKind: status === 'terminal' ? 'subagent_done' : null,
		outcome: '',
		validationStatus: null,
		review: null,
		usage: null,
		costUsd: null,
		startedAt: null,
		endedAt: null,
		activity: null
	};
}

function attention(overrides: Partial<AttentionView> = {}): AttentionView {
	return {
		id: 'att_01',
		kind: 'agent_question',
		status: 'open',
		question: 'Enter or Cmd+Enter?',
		runId: 'run_a',
		replies: [],
		...overrides
	};
}

type Shape = {
	status: string;
	stage?: string;
	current?: boolean;
	runs?: RunView[];
	attention?: AttentionView[];
};

function detail({
	status,
	stage = 'work',
	current = true,
	runs = [],
	attention = []
}: Shape): TicketDetailView {
	return {
		header: {
			key: KEY,
			displayRef: 'dpaez/factory-dashboard#29',
			sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/29',
			source: { ref: 'dpaez/factory-dashboard#29', href: null },
			title: 'Ticket commands',
			stage,
			status,
			statusReason: null,
			needsUser: false,
			execution: 1,
			current,
			pullRequest: null,
			trackerWarnings: [],
			progress: { done: 0, total: 1, current: null },
			currentTask: null,
			updatedAt: '2026-10-23T00:00:00Z'
		},
		tasks: [],
		attention,
		usage: null,
		executions: [],
		runs,
		latestActivity: null
	};
}

const idle = () => 'idle' as CommandPhase;

function select(shape: Shape, extra: Partial<TicketActionsInput> = {}) {
	return ticketActions({ detail: detail(shape), access: 'unknown', phaseFor: idle, ...extra });
}

/** H hidden, E enabled, D disabled. */
type Code = 'H' | 'E' | 'D';
const code = (a: ActionAvailability): Code =>
	a.kind === 'hidden' ? 'H' : a.kind === 'enabled' ? 'E' : 'D';
const codes = (actions: Record<TicketAction, ActionAvailability>) =>
	Object.fromEntries(TICKET_ACTIONS.map((action) => [action, code(actions[action])]));

const ONE_RUN = [run('run_a', 'running')];
const OPEN = [attention()];

describe('ticketActions by execution status', () => {
	// One non-terminal run and one open attention with a run id, so Stop and
	// Reply are shown wherever the status allows them.
	const table: [string, string, Record<TicketAction, Code>][] = [
		[
			'queued',
			'plan',
			{ stop: 'E', reply: 'D', retry: 'H', cancel: 'E', complete: 'H', rerun: 'H' }
		],
		[
			'active',
			'work',
			{ stop: 'E', reply: 'D', retry: 'H', cancel: 'E', complete: 'H', rerun: 'H' }
		],
		[
			'waiting_for_user',
			'review',
			{ stop: 'E', reply: 'E', retry: 'H', cancel: 'E', complete: 'H', rerun: 'H' }
		],
		[
			'paused',
			'work',
			{ stop: 'E', reply: 'E', retry: 'E', cancel: 'E', complete: 'H', rerun: 'H' }
		],
		[
			'resuming',
			'work',
			{ stop: 'E', reply: 'D', retry: 'H', cancel: 'E', complete: 'H', rerun: 'H' }
		],
		[
			'resume_failed',
			'work',
			{ stop: 'E', reply: 'D', retry: 'E', cancel: 'E', complete: 'H', rerun: 'H' }
		],
		[
			'failed',
			'work',
			{ stop: 'E', reply: 'D', retry: 'E', cancel: 'E', complete: 'H', rerun: 'E' }
		],
		[
			'ready_for_handoff',
			'wrapup',
			{ stop: 'E', reply: 'D', retry: 'H', cancel: 'E', complete: 'E', rerun: 'H' }
		],
		[
			'complete',
			'done',
			{ stop: 'E', reply: 'D', retry: 'H', cancel: 'H', complete: 'H', rerun: 'E' }
		],
		[
			'cancelled',
			'work',
			{ stop: 'E', reply: 'D', retry: 'H', cancel: 'H', complete: 'H', rerun: 'E' }
		]
	];

	it.each(table)('%s (stage %s)', (status, stage, expected) => {
		const { actions } = select({ status, stage, runs: ONE_RUN, attention: OPEN });
		expect(codes(actions)).toEqual(expected);
	});

	it.each(table)(
		'%s (stage %s) without runs or attention hides Stop and Reply',
		(status, stage) => {
			const { actions } = select({ status, stage });
			expect(actions.stop).toEqual({ kind: 'hidden' });
			expect(actions.reply).toEqual({ kind: 'hidden' });
		}
	);

	it.each(table)('a past %s execution hides every action', (status, stage) => {
		const result = select({ status, stage, current: false, runs: ONE_RUN, attention: OPEN });
		expect(Object.values(codes(result.actions))).toEqual(TICKET_ACTIONS.map(() => 'H'));
		expect(result.stoppableRuns).toEqual([]);
		expect(result.stopRun).toBeNull();
		expect(result.reply).toBeNull();
	});

	it('an unknown status offers only Cancel while the stage is not done', () => {
		const shape = { status: 'hibernating', runs: ONE_RUN, attention: OPEN };
		expect(codes(select({ ...shape, stage: 'work' }).actions)).toEqual({
			stop: 'H',
			reply: 'H',
			retry: 'H',
			cancel: 'E',
			complete: 'H',
			rerun: 'H'
		});
		expect(Object.values(codes(select({ ...shape, stage: 'done' }).actions))).toEqual(
			TICKET_ACTIONS.map(() => 'H')
		);
	});

	it('Cancel is hidden once the stage is done', () => {
		expect(select({ status: 'active', stage: 'done' }).actions.cancel).toEqual({ kind: 'hidden' });
	});

	it('Mark complete is disabled in wrapup until the handoff is ready', () => {
		expect(select({ status: 'active', stage: 'wrapup' }).actions.complete).toEqual({
			kind: 'disabled',
			reason: ACTION_REASONS.preparingHandoff
		});
	});
});

describe('Stop', () => {
	it('lists only non-terminal runs, with id, sequence, stage and task', () => {
		const result = select({
			status: 'active',
			runs: [run('run_old', 'terminal', 1), run('run_a', 'running', 2)]
		});
		expect(result.stoppableRuns).toEqual([{ id: 'run_a', sequence: 2, stage: 'work', task: '01' }]);
		expect(result.stopRun).toBe('run_a');
		expect(result.actions.stop).toEqual({ kind: 'enabled' });
	});

	it('is hidden when every run is terminal', () => {
		expect(select({ status: 'active', runs: [run('run_a', 'terminal')] }).actions.stop).toEqual({
			kind: 'hidden'
		});
	});

	const SEVERAL = [run('run_a', 'running', 1), run('run_b', 'starting', 2)];

	it('asks for a run choice when several are active and none is chosen', () => {
		const result = select({ status: 'active', runs: SEVERAL });
		expect(result.stoppableRuns.map((r) => r.id)).toEqual(['run_a', 'run_b']);
		expect(result.stopRun).toBeNull();
		expect(result.actions.stop).toEqual({ kind: 'disabled', reason: ACTION_REASONS.chooseRun });
	});

	it('is enabled for the chosen run', () => {
		const result = select({ status: 'active', runs: SEVERAL }, { stopRun: 'run_b' });
		expect(result.stopRun).toBe('run_b');
		expect(result.actions.stop).toEqual({ kind: 'enabled' });
	});

	it('ignores a chosen run that is no longer stoppable', () => {
		const result = select({ status: 'active', runs: SEVERAL }, { stopRun: 'run_gone' });
		expect(result.stopRun).toBeNull();
		expect(result.actions.stop.kind).toBe('disabled');
	});

	it('shows "Stop requested." while the chosen run has a pending stop', () => {
		const target = commandTarget({ command: 'stop', run: 'run_a' });
		for (const phase of ['submitting', 'accepted'] as const) {
			const result = select(
				{ status: 'active', runs: ONE_RUN },
				{ phaseFor: (t) => (t === target ? phase : 'idle') }
			);
			expect(result.actions.stop).toEqual({
				kind: 'disabled',
				reason: ACTION_REASONS.stopRequested
			});
		}
	});
});

describe('Reply', () => {
	it('names the open attention to reply to', () => {
		const result = select({
			status: 'waiting_for_user',
			attention: [attention({ id: 'att_00', status: 'resolved' }), attention()]
		});
		expect(result.reply).toEqual({ id: 'att_01', question: 'Enter or Cmd+Enter?', runId: 'run_a' });
		expect(result.actions.reply).toEqual({ kind: 'enabled' });
	});

	it('is hidden without an open attention', () => {
		const result = select({
			status: 'waiting_for_user',
			attention: [attention({ status: 'answered' })]
		});
		expect(result.reply).toBeNull();
		expect(result.actions.reply).toEqual({ kind: 'hidden' });
	});

	it.each(['waiting_for_user', 'paused'])(
		'is disabled with a reason when the open attention has no run (%s)',
		(status) => {
			const result = select({ status, attention: [attention({ runId: null })] });
			expect(result.reply?.runId).toBeNull();
			expect(result.actions.reply).toEqual({
				kind: 'disabled',
				reason: ACTION_REASONS.noWaitingRun
			});
		}
	);
});

describe('read-only access', () => {
	it.each([
		['paused', 'work'],
		['failed', 'work'],
		['ready_for_handoff', 'wrapup'],
		['complete', 'done']
	])('disables every shown action with the access reason (%s)', (status, stage) => {
		const shown = select({ status, stage, runs: ONE_RUN, attention: OPEN });
		const readOnly = select(
			{ status, stage, runs: ONE_RUN, attention: OPEN },
			{ access: 'read_only' }
		);
		for (const action of TICKET_ACTIONS) {
			if (shown.actions[action].kind === 'hidden') {
				expect(readOnly.actions[action]).toEqual({ kind: 'hidden' });
			} else {
				expect(readOnly.actions[action]).toEqual({
					kind: 'disabled',
					reason: ACTION_REASONS.readOnly
				});
			}
		}
		expect(ACTION_REASONS.readOnly).toMatch(/access/i);
	});

	it('wins over a pending intent', () => {
		const result = select(
			{ status: 'paused' },
			{ access: 'read_only', phaseFor: () => 'accepted' }
		);
		expect(result.actions.retry).toEqual({ kind: 'disabled', reason: ACTION_REASONS.readOnly });
	});
});

describe('pending intents', () => {
	const ticketTarget = (command: 'retry' | 'cancel' | 'complete' | 'rerun') =>
		commandTarget({ command, ticket: KEY });

	it.each([
		['submitting', ACTION_REASONS.sending],
		['accepted', ACTION_REASONS.accepted]
	] as const)('a %s intent disables only its own action', (phase, reason) => {
		const target = ticketTarget('retry');
		const result = select(
			{ status: 'failed', runs: ONE_RUN },
			{ phaseFor: (t) => (t === target ? phase : 'idle') }
		);
		expect(result.actions.retry).toEqual({ kind: 'disabled', reason });
		expect(result.actions.cancel).toEqual({ kind: 'enabled' });
		expect(result.actions.rerun).toEqual({ kind: 'enabled' });
		expect(result.actions.stop).toEqual({ kind: 'enabled' });
	});

	it('a pending reply disables Reply', () => {
		const target = commandTarget({ command: 'reply', ticket: KEY, answer: 'x' });
		const result = select(
			{ status: 'waiting_for_user', attention: OPEN },
			{ phaseFor: (t) => (t === target ? 'submitting' : 'idle') }
		);
		expect(result.actions.reply).toEqual({ kind: 'disabled', reason: ACTION_REASONS.sending });
	});

	it.each(['rejected', 'unconfirmed', 'confirmed', 'idle'] as const)(
		'a %s intent leaves the action enabled',
		(phase) => {
			const result = select(
				{ status: 'ready_for_handoff', stage: 'wrapup', runs: ONE_RUN, attention: OPEN },
				{ phaseFor: () => phase }
			);
			expect(result.actions.complete).toEqual({ kind: 'enabled' });
			expect(result.actions.cancel).toEqual({ kind: 'enabled' });
			expect(result.actions.stop).toEqual({ kind: 'enabled' });
		}
	);

	it('looks phases up by the coordinator targets', () => {
		const asked: string[] = [];
		select(
			{ status: 'failed', stage: 'work', runs: ONE_RUN, attention: OPEN },
			{
				phaseFor: (t) => {
					asked.push(t);
					return 'idle';
				}
			}
		);
		expect(asked.sort()).toEqual(
			[
				commandTarget({ command: 'stop', run: 'run_a' }),
				`reply:${KEY}`,
				ticketTarget('retry'),
				ticketTarget('cancel'),
				ticketTarget('rerun')
			].sort()
		);
	});
});
