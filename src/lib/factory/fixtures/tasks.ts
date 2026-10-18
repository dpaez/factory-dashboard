/* Task fixtures covering every task status, with blockers and per-stage summaries. */
import type { components } from '$lib/factory/generated/factory-api';

type Task = components['schemas']['Task'];

export const taskDone = {
	blockedBy: [],
	id: '01',
	ordinal: 1,
	stage: null,
	status: 'done',
	summaries: {
		work: { counts: { tests: 14 }, label: 'Work', round: 1 },
		review: { counts: { critical: 0, major: 0, minor: 1 }, label: 'Approved', round: 2 }
	},
	title: 'Contract pipeline'
} satisfies Task;

export const taskActive = {
	blockedBy: ['01'],
	id: '02',
	ordinal: 2,
	stage: 'review',
	status: 'active',
	summaries: {
		work: { counts: { tests: 32 }, label: 'Work', round: 1 },
		review: { counts: { critical: 0, major: 2, minor: 1 }, label: 'Changes requested', round: 1 }
	},
	title: 'Client and errors'
} satisfies Task;

export const taskPending = {
	blockedBy: ['02'],
	id: '03',
	ordinal: 3,
	stage: null,
	status: 'pending',
	summaries: {},
	title: 'Typed read operations and API fixtures'
} satisfies Task;

export const taskBlocked = {
	blockedBy: ['02', '03'],
	id: '04',
	ordinal: 4,
	stage: 'qa',
	status: 'blocked',
	summaries: {
		qa: { counts: { passed: 3, failed: 1 }, label: 'QA failed', round: 1 }
	},
	title: 'Route switch'
} satisfies Task;

export const taskCancelled = {
	blockedBy: [],
	id: '05',
	ordinal: 5,
	stage: 'work',
	status: 'cancelled',
	summaries: {},
	title: 'Drop SQLite reader'
} satisfies Task;

export const tasksOfEveryStatus = [
	taskDone,
	taskActive,
	taskPending,
	taskBlocked,
	taskCancelled
] satisfies Task[];
