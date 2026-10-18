/*
 * Execution and run fixtures. Runs cover every run status, validation passed
 * and failed with checks, every review verdict, findings of each severity,
 * and both `usage: null` and a populated usage.
 */
import type { components } from '$lib/factory/generated/factory-api';

import { ticketMultiExecution } from './tickets';

type Schemas = components['schemas'];

const ticketKey = ticketMultiExecution.key;

export const executionList = {
	items: [
		{
			createdAt: '2026-10-05T08:00:00Z',
			current: false,
			finishedAt: '2026-10-07T17:20:00Z',
			generation: 1,
			stage: 'done',
			status: 'complete',
			statusReason: null
		},
		{
			createdAt: '2026-10-13T09:00:00Z',
			current: true,
			finishedAt: null,
			generation: 2,
			stage: 'review',
			status: 'active',
			statusReason: 'Rerun after the merged pull request was reverted.'
		}
	]
} satisfies Schemas['ExecutionList'];

const baseRun = {
	activity: null,
	endedAt: null,
	id: 'run_base',
	model: 'claude-opus-5-5',
	outcome: '',
	purpose: 'Plan the ticket',
	review: null,
	round: 1,
	sequence: 1,
	sessionFile: null,
	stage: 'plan',
	startedAt: null,
	status: 'prepared',
	task: null,
	terminalKind: null,
	thinking: 'high',
	ticket: ticketKey,
	usage: null,
	validation: null
} satisfies Schemas['Run'];

/** A terminal plan run whose validation passed. */
export const runPlanPassed = {
	...baseRun,
	id: 'run_plan_passed',
	activity: 'Wrote plan.md and three task files.',
	startedAt: '2026-10-13T09:01:00Z',
	endedAt: '2026-10-13T09:12:30Z',
	outcome: 'Planned 2 tasks',
	sessionFile: '/home/agent/.pi/sessions/plan-01.jsonl',
	status: 'terminal',
	terminalKind: 'completed',
	usage: {
		costUsd: 0.84,
		tokensCacheRead: 210_000,
		tokensCacheWrite: 18_000,
		tokensInput: 32_000,
		tokensOutput: 9_400,
		tokensTotal: 269_400
	},
	validation: {
		attempt: 1,
		checks: [
			{
				command: null,
				durationMs: 4,
				exitCode: null,
				kind: 'artifact',
				name: 'plan.md exists',
				status: 'passed'
			}
		],
		status: 'passed',
		summary: 'Plan artifacts are valid.'
	}
} satisfies Schemas['Run'];

/** A terminal work run whose validation failed, with no usage recorded. */
export const runWorkValidationFailed = {
	...baseRun,
	id: 'run_work_failed',
	purpose: 'Implement task 01',
	sequence: 2,
	stage: 'work',
	task: '01',
	startedAt: '2026-10-13T09:13:00Z',
	endedAt: '2026-10-13T09:40:00Z',
	outcome: 'Validation failed',
	status: 'terminal',
	terminalKind: 'completed',
	usage: null,
	validation: {
		attempt: 2,
		checks: [
			{
				command: 'pnpm test',
				durationMs: 18_250,
				exitCode: 1,
				kind: 'command',
				name: 'test',
				status: 'failed'
			},
			{
				command: 'pnpm run lint',
				durationMs: 2_100,
				exitCode: 0,
				kind: 'command',
				name: 'lint',
				status: 'passed'
			},
			{
				command: 'pnpm check',
				durationMs: null,
				exitCode: null,
				kind: 'command',
				name: 'check',
				status: 'skipped'
			},
			{
				command: null,
				durationMs: null,
				exitCode: null,
				kind: 'diff',
				name: 'worktree has a change',
				status: 'error'
			}
		],
		status: 'failed',
		summary: '1 of 4 checks failed.'
	}
} satisfies Schemas['Run'];

/** A review requesting changes, with findings of every severity. */
export const runReviewChangesRequested = {
	...baseRun,
	id: 'run_review_changes',
	purpose: 'Review task 01',
	sequence: 3,
	stage: 'review',
	task: '01',
	model: 'gpt-6',
	startedAt: '2026-10-13T09:41:00Z',
	endedAt: '2026-10-13T09:52:00Z',
	outcome: 'Changes requested',
	status: 'terminal',
	terminalKind: 'completed',
	review: {
		findings: [
			{
				blocking: true,
				evidence: 'src/lib/server/factory/client.ts:12 logs the token.',
				finding: 'The bearer token is written to the console.',
				id: 'R1-01',
				location: 'src/lib/server/factory/client.ts:12',
				number: 1,
				severity: 'critical',
				suggestion: 'Remove the log line.',
				title: 'Token leak'
			},
			{
				blocking: true,
				evidence: 'No test covers an HTML 502.',
				finding: 'Non-JSON error bodies are not tested.',
				id: 'R1-02',
				location: null,
				number: 2,
				severity: 'major',
				suggestion: null,
				title: 'Missing HTML failure test'
			},
			{
				blocking: false,
				evidence: 'errors.ts uses two spellings.',
				finding: 'Inconsistent naming.',
				id: 'R1-03',
				location: 'src/lib/server/factory/errors.ts',
				number: 3,
				severity: 'minor',
				suggestion: 'Use "failure" throughout.',
				title: 'Naming'
			}
		],
		round: 1,
		summary: 'One critical and one major finding.',
		verdict: 'changes_requested'
	}
} satisfies Schemas['Run'];

export const runReviewApproved = {
	...baseRun,
	id: 'run_review_approved',
	purpose: 'Review task 01',
	sequence: 5,
	round: 2,
	stage: 'review',
	task: '01',
	startedAt: '2026-10-13T10:20:00Z',
	endedAt: '2026-10-13T10:28:00Z',
	outcome: 'Approved',
	status: 'terminal',
	terminalKind: 'completed',
	review: { findings: [], round: 2, summary: 'All findings addressed.', verdict: 'approve' }
} satisfies Schemas['Run'];

export const runReviewBlocked = {
	...baseRun,
	id: 'run_review_blocked',
	purpose: 'Review task 02',
	sequence: 6,
	stage: 'review',
	task: '02',
	startedAt: '2026-10-13T10:30:00Z',
	endedAt: '2026-10-13T10:33:00Z',
	outcome: 'Blocked',
	status: 'terminal',
	terminalKind: 'completed',
	review: {
		findings: [],
		round: 1,
		summary: 'Task 02 depends on an unmerged upstream change.',
		verdict: 'blocked'
	}
} satisfies Schemas['Run'];

/** Prepared but not started: no times, no usage. */
export const runWrapupPrepared = {
	...baseRun,
	id: 'run_wrapup_prepared',
	purpose: 'Wrap up the ticket',
	sequence: 9,
	stage: 'wrapup'
} satisfies Schemas['Run'];

export const runQaStarting = {
	...baseRun,
	id: 'run_qa_starting',
	purpose: 'QA task 02',
	sequence: 7,
	stage: 'qa',
	task: '02',
	status: 'starting',
	startedAt: '2026-10-13T10:40:00Z'
} satisfies Schemas['Run'];

export const runWorkRunning = {
	...baseRun,
	id: 'run_work_running',
	purpose: 'Implement task 02',
	sequence: 8,
	stage: 'work',
	task: '02',
	status: 'running',
	startedAt: '2026-10-13T10:41:00Z',
	activity: 'Running pnpm test…',
	sessionFile: '/home/agent/.pi/sessions/work-02.jsonl',
	validation: { attempt: 1, checks: [], status: 'running', summary: null }
} satisfies Schemas['Run'];

export const runs = [
	runPlanPassed,
	runWorkValidationFailed,
	runReviewChangesRequested,
	runReviewApproved,
	runReviewBlocked,
	runQaStarting,
	runWorkRunning,
	runWrapupPrepared
] satisfies Schemas['Run'][];

export const runPage = {
	items: runs,
	nextCursor: null
} satisfies Schemas['RunPage'];

export const agentList = {
	items: [
		{
			activity: 'Running pnpm test…',
			model: runWorkRunning.model,
			paneName: 'work-02',
			runId: runWorkRunning.id,
			sessionFile: runWorkRunning.sessionFile,
			stage: 'work',
			startedAt: runWorkRunning.startedAt,
			task: '02',
			ticket: ticketKey
		},
		{
			activity: null,
			model: runQaStarting.model,
			paneName: null,
			runId: runQaStarting.id,
			sessionFile: null,
			stage: 'qa',
			startedAt: null,
			task: '02',
			ticket: ticketKey
		}
	]
} satisfies Schemas['AgentList'];
