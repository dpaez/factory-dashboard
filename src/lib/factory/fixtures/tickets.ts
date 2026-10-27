/*
 * Ticket fixtures: one ticket summary per stage and execution status, ticket
 * details for each attention request kind, and a multi-execution (rerun)
 * ticket. Browser-safe data with type-only imports.
 */
import type { components } from '$lib/factory/generated/factory-api';

import { tasksOfEveryStatus } from './tasks.ts';

type Schemas = components['schemas'];

const pullRequestOpen = {
	mergedAt: null,
	number: 42,
	state: 'open',
	url: 'https://github.com/dpaez/factory-dashboard/pull/42'
} satisfies NonNullable<Schemas['TicketSummary']['pullRequest']>;

const pullRequestMerged = {
	mergedAt: '2026-10-12T18:04:00Z',
	number: 38,
	state: 'merged',
	url: 'https://github.com/dpaez/factory-dashboard/pull/38'
} satisfies NonNullable<Schemas['TicketSummary']['pullRequest']>;

const startedByDashboard = {
	client: 'dashboard',
	onBehalfOf: 'Diego'
} satisfies Schemas['Actor'];

const baseTicket = {
	createdAt: '2026-10-10T09:00:00Z',
	displayRef: 'dpaez/factory-dashboard#17',
	execution: 1,
	finishedAt: null,
	id: 'tkt_01',
	key: 'dpaez-factory-dashboard-17-e32797ab',
	needsUser: false,
	progress: { current: null, done: 0, next: null, total: 0 },
	pullRequest: null,
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/17',
	stage: 'plan',
	startedBy: startedByDashboard,
	status: 'queued',
	statusReason: null,
	title: 'API contract and typed server client',
	trackerWarnings: [],
	updatedAt: '2026-10-10T09:00:00Z'
} satisfies Schemas['TicketSummary'];

export const ticketQueuedInPlan = {
	...baseTicket
} satisfies Schemas['TicketSummary'];

export const ticketActiveInPlan = {
	...baseTicket,
	id: 'tkt_02',
	key: 'dpaez-factory-dashboard-18-1a2b3c4d',
	displayRef: 'dpaez/factory-dashboard#18',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/18',
	title: 'Storybook and component fixtures',
	status: 'active',
	startedBy: null,
	updatedAt: '2026-10-11T10:15:00Z'
} satisfies Schemas['TicketSummary'];

export const ticketActiveInWork = {
	...baseTicket,
	id: 'tkt_03',
	key: 'dpaez-factory-dashboard-21-5e6f7a8b',
	displayRef: 'dpaez/factory-dashboard#21',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/21',
	title: 'Switch routes to the factory API',
	stage: 'work',
	status: 'active',
	progress: {
		current: { label: 'Typed read operations and API fixtures', step: '03/05' },
		done: 2,
		next: null,
		total: 5
	},
	updatedAt: '2026-10-12T11:30:00Z'
} satisfies Schemas['TicketSummary'];

export const ticketActiveInQa = {
	...baseTicket,
	id: 'tkt_04',
	key: 'dpaez-factory-dashboard-22-9c0d1e2f',
	displayRef: 'dpaez/factory-dashboard#22',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/22',
	title: 'Live board updates over SSE',
	stage: 'qa',
	status: 'active',
	progress: {
		current: { label: 'Event stream proxy', step: '01/02' },
		done: 1,
		next: null,
		total: 2
	}
} satisfies Schemas['TicketSummary'];

/** Waiting for a reply to an `agent_question` attention request. */
export const ticketWaitingForAgentQuestion = {
	...baseTicket,
	id: 'tkt_05',
	key: 'dpaez-factory-dashboard-23-3a4b5c6d',
	displayRef: 'dpaez/factory-dashboard#23',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/23',
	title: 'Reply composer for attention requests',
	stage: 'review',
	status: 'waiting_for_user',
	needsUser: true,
	statusReason: 'The reviewer asked a question.',
	progress: {
		current: { label: 'Reply composer', step: '02/03' },
		done: 1,
		next: 'pi factory reply dpaez-factory-dashboard-23-3a4b5c6d',
		total: 3
	}
} satisfies Schemas['TicketSummary'];

/** Waiting for a person after hitting a `policy_limit`. */
export const ticketWaitingForPolicyLimit = {
	...baseTicket,
	id: 'tkt_06',
	key: 'dpaez-factory-dashboard-24-7e8f9a0b',
	displayRef: 'dpaez/factory-dashboard#24',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/24',
	title: 'Stats page cohorts',
	stage: 'work',
	status: 'waiting_for_user',
	needsUser: true,
	statusReason: 'The work stage reached its review round limit.',
	progress: {
		current: { label: 'Cohort filter', step: '01/04' },
		done: 0,
		next: 'pi factory retry dpaez-factory-dashboard-24-7e8f9a0b',
		total: 4
	}
} satisfies Schemas['TicketSummary'];

/** Waiting for a `manual_approval` before wrap-up continues. */
export const ticketWaitingForManualApproval = {
	...baseTicket,
	id: 'tkt_07',
	key: 'dpaez-factory-dashboard-25-1c2d3e4f',
	displayRef: 'dpaez/factory-dashboard#25',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/25',
	title: 'Inspector drawer',
	stage: 'wrapup',
	status: 'waiting_for_user',
	needsUser: true,
	statusReason: 'Wrap-up needs approval to push.',
	progress: { current: null, done: 3, next: null, total: 3 }
} satisfies Schemas['TicketSummary'];

export const ticketPaused = {
	...baseTicket,
	id: 'tkt_08',
	key: 'dpaez-factory-dashboard-26-5a6b7c8d',
	displayRef: 'dpaez/factory-dashboard#26',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/26',
	title: 'Keyboard navigation on the flow board',
	stage: 'work',
	status: 'paused',
	needsUser: true,
	statusReason: 'Paused by the operator.'
} satisfies Schemas['TicketSummary'];

export const ticketResuming = {
	...baseTicket,
	id: 'tkt_09',
	key: 'dpaez-factory-dashboard-27-9e0f1a2b',
	displayRef: 'dpaez/factory-dashboard#27',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/27',
	title: 'Lane collapse state',
	stage: 'qa',
	status: 'resuming'
} satisfies Schemas['TicketSummary'];

export const ticketResumeFailed = {
	...baseTicket,
	id: 'tkt_10',
	key: 'dpaez-factory-dashboard-28-3c4d5e6f',
	displayRef: 'dpaez/factory-dashboard#28',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/28',
	title: 'Typed commands with idempotency keys',
	stage: 'review',
	status: 'resume_failed',
	needsUser: true,
	statusReason: 'The agent session could not be resumed.',
	trackerWarnings: ['Could not update the issue label: tracker_unavailable']
} satisfies Schemas['TicketSummary'];

export const ticketFailed = {
	...baseTicket,
	id: 'tkt_11',
	key: 'kai-12-7a8b9c0d',
	displayRef: 'KAI-12',
	sourceRef: 'KAI-12',
	title: 'Import Linear backlog',
	stage: 'plan',
	status: 'failed',
	needsUser: true,
	statusReason: 'Planning validation failed twice.',
	startedBy: { client: 'cli', onBehalfOf: null },
	finishedAt: '2026-10-09T16:40:00Z'
} satisfies Schemas['TicketSummary'];

export const ticketReadyForHandoff = {
	...baseTicket,
	id: 'tkt_12',
	key: 'dpaez-factory-dashboard-14-1e2f3a4b',
	displayRef: 'dpaez/factory-dashboard#14',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/14',
	title: 'Design tokens',
	stage: 'wrapup',
	status: 'ready_for_handoff',
	needsUser: true,
	pullRequest: pullRequestOpen,
	progress: { current: null, done: 4, next: null, total: 4 }
} satisfies Schemas['TicketSummary'];

export const ticketCompleteInDone = {
	...baseTicket,
	id: 'tkt_13',
	key: 'dpaez-factory-dashboard-12-5c6d7e8f',
	displayRef: 'dpaez/factory-dashboard#12',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/12',
	title: 'Initial flow board',
	stage: 'done',
	status: 'complete',
	pullRequest: pullRequestMerged,
	progress: { current: null, done: 6, next: null, total: 6 },
	finishedAt: '2026-10-12T18:04:00Z'
} satisfies Schemas['TicketSummary'];

export const ticketCancelled = {
	...baseTicket,
	id: 'tkt_14',
	key: 'ticket-3f4a5b6c',
	displayRef: 'ticket',
	sourceRef: 'notes/ticket.md',
	title: 'Spike: drag and drop lanes',
	stage: 'work',
	status: 'cancelled',
	statusReason: 'Cancelled: superseded by #26.',
	pullRequest: {
		mergedAt: null,
		number: 31,
		state: 'closed',
		url: 'https://github.com/dpaez/factory-dashboard/pull/31'
	},
	finishedAt: '2026-10-08T12:00:00Z'
} satisfies Schemas['TicketSummary'];

/** A rerun ticket: its current execution is the second generation. */
export const ticketMultiExecution = {
	...baseTicket,
	id: 'tkt_15',
	key: 'dpaez-factory-dashboard-9-9a0b1c2d',
	displayRef: 'dpaez/factory-dashboard#9',
	sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/9',
	title: 'Ticket workspace timeline',
	execution: 2,
	stage: 'review',
	status: 'active',
	progress: {
		current: { label: 'Timeline grouping', step: '02/02' },
		done: 1,
		next: null,
		total: 2
	},
	createdAt: '2026-10-05T08:00:00Z',
	updatedAt: '2026-10-13T09:45:00Z'
} satisfies Schemas['TicketSummary'];

export const ticketSummaries = [
	ticketQueuedInPlan,
	ticketActiveInPlan,
	ticketActiveInWork,
	ticketActiveInQa,
	ticketWaitingForAgentQuestion,
	ticketWaitingForPolicyLimit,
	ticketWaitingForManualApproval,
	ticketPaused,
	ticketResuming,
	ticketResumeFailed,
	ticketFailed,
	ticketReadyForHandoff,
	ticketCompleteInDone,
	ticketCancelled,
	ticketMultiExecution
] satisfies Schemas['TicketSummary'][];

export const ticketPage = {
	items: ticketSummaries,
	nextCursor: 'cursor-page-2'
} satisfies Schemas['TicketPage'];

export const ticketPageLast = {
	items: [ticketCompleteInDone],
	nextCursor: null
} satisfies Schemas['TicketPage'];

const usageEmpty = {
	costUsd: 0,
	tokensCacheRead: 0,
	tokensCacheWrite: 0,
	tokensInput: 0,
	tokensOutput: 0,
	tokensTotal: 0
} satisfies Schemas['Usage'];

const usageInWork = {
	costUsd: 3.42,
	tokensCacheRead: 812_000,
	tokensCacheWrite: 64_000,
	tokensInput: 120_500,
	tokensOutput: 38_200,
	tokensTotal: 1_034_700
} satisfies Schemas['Usage'];

export const ticketDetailQueued = {
	...ticketQueuedInPlan,
	attention: [],
	source: null,
	tasks: [],
	usage: usageEmpty
} satisfies Schemas['TicketDetail'];

/** An active ticket whose tasks cover every task status. */
export const ticketDetailActiveInWork = {
	...ticketActiveInWork,
	attention: [],
	source: null,
	tasks: tasksOfEveryStatus,
	usage: usageInWork
} satisfies Schemas['TicketDetail'];

export const ticketDetailAgentQuestion = {
	...ticketWaitingForAgentQuestion,
	attention: [
		{
			id: 'att_01',
			kind: 'agent_question',
			question: 'Should the reply composer submit on Enter or on Cmd+Enter?',
			replies: [],
			runId: 'run_review_changes',
			status: 'open'
		},
		{
			id: 'att_00',
			kind: 'agent_question',
			question: 'Is the composer allowed to use a modal?',
			replies: [
				{
					actor: startedByDashboard,
					answer: 'No, keep it inline.',
					createdAt: '2026-10-12T08:00:00Z',
					current: true,
					version: 1
				}
			],
			runId: 'run_plan_passed',
			status: 'resolved'
		}
	],
	source: null,
	tasks: [],
	usage: usageInWork
} satisfies Schemas['TicketDetail'];

export const ticketDetailPolicyLimit = {
	...ticketWaitingForPolicyLimit,
	attention: [
		{
			id: 'att_02',
			kind: 'policy_limit',
			question: 'The work stage reached 3 review rounds. Retry or complete by hand?',
			replies: [],
			runId: null,
			status: 'open'
		}
	],
	source: null,
	tasks: [],
	usage: usageInWork
} satisfies Schemas['TicketDetail'];

export const ticketDetailManualApproval = {
	...ticketWaitingForManualApproval,
	attention: [
		{
			id: 'att_03',
			kind: 'manual_approval',
			question: 'Push factory/dpaez-factory-dashboard-25-1c2d3e4f and open the pull request?',
			replies: [
				{
					actor: null,
					answer: 'Not yet.',
					createdAt: '2026-10-13T07:00:00Z',
					current: false,
					version: 1
				}
			],
			runId: 'run_wrapup_prepared',
			status: 'open'
		}
	],
	source: null,
	tasks: [],
	usage: usageInWork
} satisfies Schemas['TicketDetail'];

export const ticketDetailMultiExecution = {
	...ticketMultiExecution,
	attention: [],
	source: null,
	tasks: [],
	usage: usageInWork
} satisfies Schemas['TicketDetail'];

/**
 * The failed ticket with an open `agent_question` and a cancelled approval: two
 * attention reasons (Question and Failed) on one ticket. Not served by the fake.
 */
export const ticketDetailFailedWithQuestion = {
	...ticketFailed,
	attention: [
		{
			id: 'att_04',
			kind: 'agent_question',
			question: 'Planning failed twice. Split the import into two tickets?',
			replies: [],
			runId: null,
			status: 'open'
		},
		{
			id: 'att_05',
			kind: 'manual_approval',
			question: 'Import every Linear issue?',
			replies: [],
			runId: null,
			status: 'cancelled'
		}
	],
	source: null,
	tasks: [],
	usage: usageEmpty
} satisfies Schemas['TicketDetail'];

/** A ticket with long values, for layout stories. Not part of `ticketSummaries`. */
export const ticketLongValues = {
	...baseTicket,
	id: 'tkt_16',
	key: 'very-long-organisation-name-very-long-repository-name-1234-0f1e2d3c',
	displayRef: 'very-long-organisation-name/very-long-repository-name#1234',
	sourceRef: 'https://github.com/very-long-organisation-name/very-long-repository-name/issues/1234',
	title:
		'Make the dashboard show every ticket the factory server knows about, including finished and cancelled ones, with their stage and progress',
	stage: 'work',
	status: 'waiting_for_user',
	needsUser: true,
	progress: {
		current: { label: 'A task with a long title', step: '17/128' },
		done: 17,
		next: null,
		total: 128
	}
} satisfies Schemas['TicketSummary'];

/**
 * A ticket in a stage the contract does not list yet, as a newer factory
 * might send. The schema's stage enum rejects `'triage'`, so only `stage` is
 * cast; every other field is still checked against the schema. Not part of
 * `ticketSummaries`, so the fake factory and its e2e counts stay unchanged.
 */
export const ticketUnknownStage = {
	...({
		...baseTicket,
		id: 'tkt_17',
		key: 'dpaez-factory-dashboard-29-2b3c4d5e',
		displayRef: 'dpaez/factory-dashboard#29',
		sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/29',
		title: 'Triage incoming issues',
		status: 'active',
		updatedAt: '2026-10-13T12:00:00Z'
	} satisfies Schemas['TicketSummary']),
	stage: 'triage' as unknown as Schemas['TicketSummary']['stage']
} satisfies Schemas['TicketSummary'];

/** Tasks with the live summary shapes. Typed wide so stage keys stay open. */
const qaTicketTasks: Schemas['Task'][] = [
	{
		blockedBy: [],
		id: '01',
		ordinal: 1,
		stage: null,
		status: 'done',
		summaries: {
			review: { counts: { blocking: 0, findings: 2 }, label: 'approve', round: 2 },
			qa: { counts: { gaps: 1, tested: 4 }, label: 'passed', round: 1 }
		},
		title: 'Event stream proxy'
	},
	{
		blockedBy: ['01'],
		id: '02',
		ordinal: 2,
		stage: 'qa',
		status: 'active',
		summaries: {
			review: { counts: { blocking: 1, findings: 3 }, label: 'changes_requested', round: 2 }
		},
		title: 'Board live updates'
	},
	{
		blockedBy: ['01', '02'],
		id: '03',
		ordinal: 3,
		stage: null,
		status: 'pending',
		summaries: {},
		title: 'Reconnect banner'
	}
];

/**
 * A ticket in QA whose tasks carry the live summary shapes: review
 * `{findings, blocking}` and QA `{tested, gaps}` counts.
 */
export const ticketDetailActiveInQa = {
	...ticketActiveInQa,
	pullRequest: pullRequestOpen,
	statusReason: 'QA is exercising the event stream against a real browser.',
	attention: [
		{
			id: 'att_10',
			kind: 'manual_approval',
			question: [
				'Approve the QA plan before it runs?',
				'',
				'| check                  | result  |',
				'| ---------------------- | ------- |',
				'| reconnect after 30s    | pending |',
				'| replays missed events  | pending |'
			].join('\n'),
			replies: [
				{
					actor: startedByDashboard,
					answer: 'Run the reconnect check first.',
					createdAt: '2026-10-14T08:00:00Z',
					current: false,
					version: 1
				},
				{
					actor: { client: 'cli', onBehalfOf: null },
					answer: 'Approved as written.',
					createdAt: '2026-10-14T08:30:00Z',
					current: true,
					version: 2
				}
			],
			runId: null,
			status: 'resolved'
		},
		{
			id: 'att_11',
			kind: 'agent_question',
			question: 'Should the stream reconnect forever, or give up after 5 tries?',
			replies: [],
			runId: null,
			status: 'open'
		}
	],
	source: null,
	tasks: qaTicketTasks,
	usage: usageInWork
} satisfies Schemas['TicketDetail'];

/** The first, finished execution of the multi-execution ticket. */
export const ticketDetailMultiExecutionFirst = {
	...ticketDetailMultiExecution,
	execution: 1,
	stage: 'done',
	status: 'complete',
	pullRequest: pullRequestMerged,
	finishedAt: '2026-10-07T17:20:00Z',
	updatedAt: '2026-10-07T17:20:00Z',
	progress: { current: null, done: 1, next: null, total: 1 },
	source: null,
	tasks: [
		{
			blockedBy: [],
			id: '01',
			ordinal: 1,
			stage: null,
			status: 'done',
			summaries: { review: { counts: { blocking: 0, findings: 0 }, label: 'approve', round: 1 } },
			title: 'Timeline grouping, first attempt'
		}
	],
	usage: {
		costUsd: 1.17,
		tokensCacheRead: 240_000,
		tokensCacheWrite: 21_000,
		tokensInput: 41_000,
		tokensOutput: 12_300,
		tokensTotal: 314_300
	}
} satisfies Schemas['TicketDetail'];

/*
 * Inspector details for the statuses the inspector stories need. None has an
 * open attention request or a QA summary, so serving them from the fake
 * leaves the board's attention reasons and its QA lane unchanged.
 */

/** Planning in progress: no tasks yet. */
export const ticketDetailPlanning = {
	...ticketActiveInPlan,
	attention: [],
	source: null,
	tasks: [],
	usage: usageEmpty
} satisfies Schemas['TicketDetail'];

/** Typed wide so the stage keys stay open. */
const pausedTicketTasks: Schemas['Task'][] = [
	{
		blockedBy: [],
		id: '01',
		ordinal: 1,
		stage: null,
		status: 'done',
		summaries: {
			review: { counts: { blocking: 0, findings: 1 }, label: 'approve', round: 1 }
		},
		title: 'Arrow keys move between cards'
	},
	{
		blockedBy: ['01'],
		id: '02',
		ordinal: 2,
		stage: 'work',
		status: 'active',
		summaries: { work: { counts: { tests: 6 }, label: 'Work', round: 2 } },
		title: 'Home and End jump to lane ends'
	}
];

/** Paused by the operator mid-work, with its work round recorded. */
export const ticketDetailPaused = {
	...ticketPaused,
	attention: [],
	source: null,
	tasks: pausedTicketTasks,
	usage: usageInWork
} satisfies Schemas['TicketDetail'];

/** Relaunching after a pause: no open attention request. */
export const ticketDetailResuming = {
	...ticketResuming,
	attention: [],
	source: null,
	tasks: [],
	usage: usageInWork
} satisfies Schemas['TicketDetail'];

/** Failed in planning, with no open attention request. */
export const ticketDetailFailed = {
	...ticketFailed,
	attention: [],
	source: null,
	tasks: [],
	usage: usageEmpty
} satisfies Schemas['TicketDetail'];

/** Every task done and an open pull request: ready for handoff. */
export const ticketDetailReadyForHandoff = {
	...ticketReadyForHandoff,
	attention: [],
	source: null,
	tasks: [
		{
			blockedBy: [],
			id: '01',
			ordinal: 1,
			stage: null,
			status: 'done',
			summaries: {
				review: { counts: { blocking: 0, findings: 0 }, label: 'approve', round: 1 }
			},
			title: 'Color tokens'
		},
		{
			blockedBy: ['01'],
			id: '02',
			ordinal: 2,
			stage: null,
			status: 'done',
			summaries: {
				review: { counts: { blocking: 0, findings: 2 }, label: 'approve', round: 2 }
			},
			title: 'Type scale'
		}
	],
	usage: usageInWork
} satisfies Schemas['TicketDetail'];

/** Finished with a merged pull request. */
export const ticketDetailComplete = {
	...ticketCompleteInDone,
	attention: [],
	source: null,
	tasks: [
		{
			blockedBy: [],
			id: '01',
			ordinal: 1,
			stage: null,
			status: 'done',
			summaries: {
				review: { counts: { blocking: 0, findings: 0 }, label: 'approve', round: 1 }
			},
			title: 'Lanes and cards'
		}
	],
	usage: usageInWork
} satisfies Schemas['TicketDetail'];

/** Cancelled mid-work; its source is a file, not a URL. */
export const ticketDetailCancelled = {
	...ticketCancelled,
	attention: [],
	source: null,
	tasks: [
		{
			blockedBy: [],
			id: '01',
			ordinal: 1,
			stage: 'work',
			status: 'cancelled',
			summaries: {},
			title: 'Drag a card between lanes'
		}
	],
	usage: usageEmpty
} satisfies Schemas['TicketDetail'];

/** Tracker warnings beside a failure (`resume_failed`), shown apart from it. */
export const ticketDetailTrackerWarnings = {
	...ticketResumeFailed,
	attention: [],
	source: null,
	tasks: [],
	usage: usageInWork
} satisfies Schemas['TicketDetail'];
