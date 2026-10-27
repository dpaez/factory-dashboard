/*
 * Execution and run fixtures. Runs cover every run status, validation passed
 * and failed with checks, every review verdict, findings of each severity,
 * and both `usage: null` and a populated usage. `runPageHistory` is one
 * ticket's multi-task history: corrections, returns to work, re-entry, a run
 * lost to infrastructure and its retry, and an unknown purpose.
 */
import type { components } from '$lib/factory/generated/factory-api';

import { ticketActiveInWork, ticketMultiExecution } from './tickets.ts';

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
	outcomeKind: 'running',
	purpose: 'initial',
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
	outcomeKind: 'planned',
	sessionFile: '/home/agent/.pi/sessions/plan-01.jsonl',
	status: 'terminal',
	terminalKind: 'subagent_done',
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
	sequence: 2,
	stage: 'work',
	task: '01',
	startedAt: '2026-10-13T09:13:00Z',
	endedAt: '2026-10-13T09:40:00Z',
	outcome: 'Validation failed',
	outcomeKind: 'correcting',
	status: 'terminal',
	terminalKind: 'subagent_done',
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
	sequence: 3,
	stage: 'review',
	task: '01',
	model: 'gpt-6',
	startedAt: '2026-10-13T09:41:00Z',
	endedAt: '2026-10-13T09:52:00Z',
	outcome: 'Changes requested',
	outcomeKind: 'changes_requested',
	status: 'terminal',
	terminalKind: 'subagent_done',
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
	purpose: 'reentry',
	sequence: 5,
	round: 2,
	stage: 'review',
	task: '01',
	startedAt: '2026-10-13T10:20:00Z',
	endedAt: '2026-10-13T10:28:00Z',
	outcome: 'Approved',
	outcomeKind: 'approved',
	status: 'terminal',
	terminalKind: 'subagent_done',
	review: { findings: [], round: 2, summary: 'All findings addressed.', verdict: 'approve' }
} satisfies Schemas['Run'];

export const runReviewBlocked = {
	...baseRun,
	id: 'run_review_blocked',
	sequence: 6,
	stage: 'review',
	task: '02',
	startedAt: '2026-10-13T10:30:00Z',
	endedAt: '2026-10-13T10:33:00Z',
	outcome: 'Blocked',
	outcomeKind: 'blocked',
	status: 'terminal',
	terminalKind: 'subagent_done',
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
	sequence: 9,
	stage: 'wrapup'
} satisfies Schemas['Run'];

export const runQaStarting = {
	...baseRun,
	id: 'run_qa_starting',
	sequence: 7,
	stage: 'qa',
	task: '02',
	status: 'starting',
	startedAt: '2026-10-13T10:40:00Z'
} satisfies Schemas['Run'];

export const runWorkRunning = {
	...baseRun,
	id: 'run_work_running',
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

/** Two agents running at once in one execution: Stop must ask which. */
export const runsTwoActive = [runQaStarting, runWorkRunning] satisfies Schemas['Run'][];

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

/** The runs of the multi-execution ticket's first, finished execution. */
export const runPageFirstExecution = {
	items: [
		{
			...runPlanPassed,
			id: 'run_gen1_plan',
			activity: 'Planned one task for the first attempt.',
			startedAt: '2026-10-05T08:01:00Z',
			endedAt: '2026-10-05T08:10:00Z',
			outcome: 'Planned 1 task',
			outcomeKind: 'planned'
		},
		{
			...runReviewApproved,
			id: 'run_gen1_review',
			sequence: 2,
			round: 1,
			startedAt: '2026-10-07T16:00:00Z',
			endedAt: '2026-10-07T16:20:00Z'
		}
	],
	nextCursor: null
} satisfies Schemas['RunPage'];

const historyTicket = ticketActiveInWork.key;

const usage = (n: number): Schemas['Usage'] => ({
	costUsd: Math.round(n * 0.31 * 100) / 100,
	tokensCacheRead: n * 40_000,
	tokensCacheWrite: n * 4_000,
	tokensInput: n * 6_000,
	tokensOutput: n * 1_500,
	tokensTotal: n * 51_500
});

/** The history's plan run. */
export const runHistoryPlan = {
	...runPlanPassed,
	id: 'run_hist_plan',
	ticket: historyTicket,
	sequence: 1,
	startedAt: '2026-10-12T08:00:00Z',
	endedAt: '2026-10-12T08:09:00Z'
} satisfies Schemas['Run'];

/** A purpose the dashboard does not know: shown as its raw value. */
export const runHistoryUnknownPurpose = {
	...baseRun,
	id: 'run_hist_nudge',
	ticket: historyTicket,
	// Cast: the contract enumerates purposes; this fixture simulates a newer factory.
	purpose: 'operator_nudge' as Schemas['Run']['purpose'],
	sequence: 2,
	stage: 'plan',
	status: 'terminal',
	terminalKind: 'subagent_done',
	outcome: 'planned',
	outcomeKind: 'planned',
	startedAt: '2026-10-12T08:10:00Z',
	endedAt: '2026-10-12T08:12:00Z',
	activity: 'Adjusted the task order after the nudge.',
	usage: usage(1)
} satisfies Schemas['Run'];

/** Task 01, first work run: validation failed. */
export const runHistoryWorkInitial = {
	...runWorkValidationFailed,
	id: 'run_hist_01_work_initial',
	ticket: historyTicket,
	purpose: 'initial',
	sequence: 3,
	round: 1,
	outcome: 'correcting',
	outcomeKind: 'correcting',
	startedAt: '2026-10-12T08:15:00Z',
	endedAt: '2026-10-12T08:40:00Z',
	activity: 'Implemented the client; tests not yet green.',
	usage: usage(2)
} satisfies Schemas['Run'];

/** Task 01, the correction after the failed validation: passed. */
export const runHistoryWorkCorrection = {
	...baseRun,
	id: 'run_hist_01_work_correction',
	ticket: historyTicket,
	purpose: 'validation_correction',
	sequence: 4,
	round: 1,
	stage: 'work',
	task: '01',
	status: 'terminal',
	terminalKind: 'subagent_done',
	outcome: 'ready for review',
	outcomeKind: 'ready_for_review',
	startedAt: '2026-10-12T08:41:00Z',
	endedAt: '2026-10-12T08:55:00Z',
	activity: 'Fixed the failing test.',
	sessionFile: '/home/agent/.pi/sessions/work-01-correction.jsonl',
	usage: usage(1),
	validation: {
		attempt: 3,
		checks: [
			{
				command: 'pnpm test',
				durationMs: 17_900,
				exitCode: 0,
				kind: 'command',
				name: 'test',
				status: 'passed'
			},
			{
				command: 'pnpm run lint',
				durationMs: 2_050,
				exitCode: 0,
				kind: 'command',
				name: 'lint',
				status: 'passed'
			}
		],
		status: 'passed',
		summary: 'All checks passed.'
	}
} satisfies Schemas['Run'];

/** Task 01, first review: changes requested with findings. */
export const runHistoryReviewChanges = {
	...runReviewChangesRequested,
	id: 'run_hist_01_review_changes',
	ticket: historyTicket,
	purpose: 'initial',
	sequence: 5,
	round: 1,
	outcome: 'changes requested',
	outcomeKind: 'changes_requested',
	startedAt: '2026-10-12T09:00:00Z',
	endedAt: '2026-10-12T09:12:00Z',
	usage: usage(1)
} satisfies Schemas['Run'];

/** Task 02, first work run: lost to infrastructure, retried. No usage was recorded. */
export const runHistoryWorkCrashed = {
	...baseRun,
	id: 'run_hist_02_work_crashed',
	ticket: historyTicket,
	purpose: 'initial',
	sequence: 6,
	round: 1,
	stage: 'work',
	task: '02',
	status: 'terminal',
	terminalKind: 'crashed',
	outcome: 'retrying',
	outcomeKind: 'retrying',
	startedAt: '2026-10-12T09:05:00Z',
	endedAt: '2026-10-12T09:06:00Z',
	usage: null
} satisfies Schemas['Run'];

/** Task 01, back in work to fix the review's findings. */
export const runHistoryReturnToWork = {
	...runHistoryWorkCorrection,
	id: 'run_hist_01_work_return',
	purpose: 'return_to_work',
	sequence: 7,
	round: 2,
	startedAt: '2026-10-12T09:15:00Z',
	endedAt: '2026-10-12T09:35:00Z',
	activity: 'Removed the token log and added the HTML failure test.',
	sessionFile: '/home/agent/.pi/sessions/work-01-return.jsonl',
	usage: usage(2),
	validation: { ...runHistoryWorkCorrection.validation, attempt: 1 }
} satisfies Schemas['Run'];

/** Task 01, review again on the returned task: approved. */
export const runHistoryReviewReentry = {
	...runReviewApproved,
	id: 'run_hist_01_review_reentry',
	ticket: historyTicket,
	purpose: 'reentry',
	sequence: 8,
	round: 2,
	outcome: 'approved',
	outcomeKind: 'approved',
	startedAt: '2026-10-12T09:40:00Z',
	endedAt: '2026-10-12T09:48:00Z',
	usage: usage(1)
} satisfies Schemas['Run'];

/** Task 02, the retry of the run lost to infrastructure: running. */
export const runHistoryInfrastructureRetry = {
	...runWorkRunning,
	id: 'run_hist_02_work_retry',
	ticket: historyTicket,
	purpose: 'infrastructure_retry',
	sequence: 9,
	round: 1,
	startedAt: '2026-10-12T09:50:00Z',
	activity: 'Running pnpm test…'
} satisfies Schemas['Run'];

export const runsHistory = [
	runHistoryPlan,
	runHistoryUnknownPurpose,
	runHistoryWorkInitial,
	runHistoryWorkCorrection,
	runHistoryReviewChanges,
	runHistoryWorkCrashed,
	runHistoryReturnToWork,
	runHistoryReviewReentry,
	runHistoryInfrastructureRetry
] satisfies Schemas['Run'][];

/** The runs of `ticketDetailActiveInWork`: a multi-task history. */
export const runPageHistory = {
	items: runsHistory,
	nextCursor: null
} satisfies Schemas['RunPage'];
