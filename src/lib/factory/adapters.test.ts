import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	agentList,
	executionList,
	runPage,
	runPlanPassed,
	runWorkValidationFailed,
	ticketActiveInQa,
	ticketActiveInWork,
	ticketDetailActiveInWork,
	ticketDetailAgentQuestion,
	ticketDetailManualApproval,
	ticketDetailMultiExecution,
	ticketDetailQueued,
	ticketSummaries
} from '$lib/factory/fixtures';
import type { components } from '$lib/factory/generated/factory-api';

import {
	toAttention,
	toExecutions,
	toRun,
	toTasks,
	toTicketDetail,
	toTicketList,
	toTicketRow
} from './adapters';

type Schemas = components['schemas'];

describe('toTicketRow', () => {
	it('maps a summary to a row with cost unavailable by default', () => {
		expect(toTicketRow(ticketActiveInWork)).toEqual({
			key: 'dpaez-factory-dashboard-21-5e6f7a8b',
			displayRef: 'dpaez/factory-dashboard#21',
			title: 'Switch routes to the factory API',
			stage: 'work',
			status: 'active',
			needsUser: false,
			progress: { done: 2, total: 5, current: 'Typed read operations and API fixtures' },
			updatedAt: '2026-10-12T11:30:00Z',
			costUsd: null
		});
	});

	it('keeps a qa-stage ticket in qa', () => {
		const row = toTicketRow(ticketActiveInQa);
		expect(row.stage).toBe('qa');
		expect(row.progress).toEqual({ done: 1, total: 2, current: 'Event stream proxy' });
	});

	it('passes unknown enum strings through', () => {
		const drifted = {
			...ticketActiveInWork,
			stage: 'triage',
			status: 'hibernating'
		} as unknown as Schemas['TicketSummary'];
		const row = toTicketRow(drifted);
		expect(row.stage).toBe('triage');
		expect(row.status).toBe('hibernating');
	});

	it('keeps a known zero cost as zero', () => {
		expect(toTicketRow(ticketActiveInWork, 0).costUsd).toBe(0);
	});
});

describe('toTicketList', () => {
	it('maps every summary and carries completeness', () => {
		const list = toTicketList({ items: ticketSummaries, complete: false });
		expect(list.complete).toBe(false);
		expect(list.rows.map((row) => row.key)).toEqual(ticketSummaries.map((t) => t.key));
		expect(list.rows.every((row) => row.costUsd === null)).toBe(true);
	});
});

describe('toTasks', () => {
	const tasks = toTasks(ticketDetailActiveInWork.tasks);

	it('flags blockers that are not done', () => {
		const byId = Object.fromEntries(tasks.map((task) => [task.id, task]));
		expect(byId['02']?.blockedBy).toEqual([{ id: '01', open: false }]);
		expect(byId['04']?.blockedBy).toEqual([
			{ id: '02', open: true },
			{ id: '03', open: true }
		]);
		expect(byId['01']?.blockedBy).toEqual([]);
	});

	it('flags a blocker missing from the execution as open', () => {
		const [task] = toTasks([{ ...ticketDetailActiveInWork.tasks[0]!, blockedBy: ['99'] }]);
		expect(task?.blockedBy).toEqual([{ id: '99', open: true }]);
	});

	it('puts review and qa summaries first with round, label and counts', () => {
		const byId = Object.fromEntries(tasks.map((task) => [task.id, task]));
		expect(byId['02']?.summaries).toEqual([
			{
				stage: 'review',
				round: 1,
				label: 'Changes requested',
				counts: { critical: 0, major: 2, minor: 1 }
			},
			{ stage: 'work', round: 1, label: 'Work', counts: { tests: 32 } }
		]);
		expect(byId['04']?.summaries).toEqual([
			{ stage: 'qa', round: 1, label: 'QA failed', counts: { passed: 3, failed: 1 } }
		]);
		expect(byId['03']?.summaries).toEqual([]);
	});

	it('orders review before qa before other stages', () => {
		const [task] = toTasks([
			{
				...ticketDetailActiveInWork.tasks[0]!,
				summaries: {
					work: { counts: {}, label: 'Work', round: 1 },
					qa: { counts: { tested: 3, gaps: 0 }, label: 'passed', round: 2 },
					review: { counts: { findings: 1, blocking: 0 }, label: 'approve', round: 3 }
				}
			}
		]);
		expect(task?.summaries.map((summary) => summary.stage)).toEqual(['review', 'qa', 'work']);
	});

	it('keeps task status and stage, with null stage when absent', () => {
		expect(tasks.map(({ id, status, stage }) => ({ id, status, stage }))).toEqual([
			{ id: '01', status: 'done', stage: null },
			{ id: '02', status: 'active', stage: 'review' },
			{ id: '03', status: 'pending', stage: null },
			{ id: '04', status: 'blocked', stage: 'qa' },
			{ id: '05', status: 'cancelled', stage: 'work' }
		]);
	});
});

describe('toAttention', () => {
	it('maps an agent question with replies', () => {
		expect(toAttention(ticketDetailAgentQuestion.attention)).toEqual([
			{
				id: 'att_01',
				kind: 'agent_question',
				status: 'open',
				question: 'Should the reply composer submit on Enter or on Cmd+Enter?',
				replies: []
			},
			{
				id: 'att_00',
				kind: 'agent_question',
				status: 'resolved',
				question: 'Is the composer allowed to use a modal?',
				replies: [
					{
						actor: { client: 'dashboard', onBehalfOf: 'Diego' },
						answer: 'No, keep it inline.',
						current: true,
						createdAt: '2026-10-12T08:00:00Z'
					}
				]
			}
		]);
	});

	it('maps a manual approval with a reply without actor', () => {
		const [request] = toAttention(ticketDetailManualApproval.attention);
		expect(request).toMatchObject({ kind: 'manual_approval', status: 'open' });
		expect(request?.replies).toEqual([
			{ actor: null, answer: 'Not yet.', current: false, createdAt: '2026-10-13T07:00:00Z' }
		]);
	});
});

describe('toExecutions', () => {
	it('keeps API order and marks the selected execution', () => {
		expect(toExecutions(executionList, 1)).toEqual([
			{
				generation: 1,
				stage: 'done',
				status: 'complete',
				statusReason: null,
				current: false,
				createdAt: '2026-10-05T08:00:00Z',
				finishedAt: '2026-10-07T17:20:00Z',
				selected: true
			},
			{
				generation: 2,
				stage: 'review',
				status: 'active',
				statusReason: 'Rerun after the merged pull request was reverted.',
				current: true,
				createdAt: '2026-10-13T09:00:00Z',
				finishedAt: null,
				selected: false
			}
		]);
	});
});

describe('toRun', () => {
	it('maps null usage to null cost, never zero', () => {
		const run = toRun(runWorkValidationFailed);
		expect(run.usage).toBeNull();
		expect(run.costUsd).toBeNull();
	});

	it('maps populated usage and keeps times as ISO strings', () => {
		expect(toRun(runPlanPassed)).toEqual({
			id: 'run_plan_passed',
			sequence: 1,
			stage: 'plan',
			task: null,
			model: 'claude-opus-5-5',
			status: 'terminal',
			outcome: 'Planned 2 tasks',
			usage: runPlanPassed.usage,
			costUsd: 0.84,
			startedAt: '2026-10-13T09:01:00Z',
			endedAt: '2026-10-13T09:12:30Z',
			activity: 'Wrote plan.md and three task files.'
		});
	});

	it('treats a missing usage field as null', () => {
		const { usage: _usage, ...rest } = runPlanPassed;
		const run = toRun(rest as unknown as Schemas['Run']);
		expect(run.usage).toBeNull();
		expect(run.costUsd).toBeNull();
	});

	it('maps every run in a page', () => {
		const views = runPage.items.map(toRun);
		expect(views).toHaveLength(runPage.items.length);
		expect(views.filter((run) => run.costUsd !== null).map((run) => run.id)).toEqual([
			'run_plan_passed'
		]);
	});
});

describe('toTicketDetail', () => {
	it('builds the header, tasks, usage, executions and runs', () => {
		const view = toTicketDetail({
			detail: ticketDetailMultiExecution,
			executions: executionList,
			runs: runPage.items
		});
		expect(view.header).toMatchObject({
			key: ticketDetailMultiExecution.key,
			displayRef: 'dpaez/factory-dashboard#9',
			stage: 'review',
			status: 'active',
			statusReason: null,
			execution: 2,
			current: true,
			pullRequest: null,
			trackerWarnings: []
		});
		expect(view.executions.map((e) => e.selected)).toEqual([false, true]);
		expect(view.runs).toHaveLength(runPage.items.length);
		expect(view.usage).toEqual(ticketDetailMultiExecution.usage);
		expect(view.latestActivity).toBe('Running pnpm test…');
	});

	it('marks an older execution as not current', () => {
		const view = toTicketDetail({
			detail: { ...ticketDetailMultiExecution, execution: 1 },
			executions: executionList,
			runs: []
		});
		expect(view.header.current).toBe(false);
		expect(view.executions.find((e) => e.selected)?.generation).toBe(1);
		expect(view.latestActivity).toBeNull();
	});

	it('keeps a zero usage total as zero', () => {
		const view = toTicketDetail({
			detail: ticketDetailQueued,
			executions: { items: [] },
			runs: []
		});
		expect(view.usage.costUsd).toBe(0);
	});

	it('maps the active-in-work fixture tasks and attention', () => {
		const view = toTicketDetail({
			detail: ticketDetailActiveInWork,
			executions: { items: [] },
			runs: []
		});
		expect(view.tasks).toHaveLength(5);
		expect(view.attention).toEqual([]);
		expect(view.usage.costUsd).toBe(3.42);
	});
});

describe('browser safety', () => {
	it.each(['./models.ts', './adapters.ts'])(
		'%s has no runtime import from $lib/server or $env',
		(file) => {
			const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
			const imports = [...source.matchAll(/^import\s+(type\s+)?[\s\S]*?from\s+'([^']+)'/gm)];
			expect(imports.length).toBeGreaterThan(0);
			for (const [, typeOnly, specifier] of imports) {
				if (specifier?.startsWith('$lib/server') || specifier?.startsWith('$env')) {
					expect(typeOnly, `${file} imports ${specifier} at runtime`).toBeTruthy();
				}
				if (specifier?.includes('generated/')) expect(typeOnly).toBeTruthy();
			}
		}
	);
});
