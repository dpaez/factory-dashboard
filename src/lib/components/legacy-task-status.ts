// TODO(#21): delete — the routes migrate to the API task vocabulary.
/*
 * Temporary adapter from the SQLite task vocabulary to the API `{ status, stage }`
 * pair that `tasks-table-status-cell` expects. Types only from `$lib/server`.
 */
import type { components } from '$lib/factory/generated/factory-api';
import type { TaskStatus as LegacyTaskStatus } from '$lib/server/types';

type Task = components['schemas']['Task'];

export type ApiTaskStatus = { status: Task['status'] | (string & {}); stage: Task['stage'] };

export function legacyTaskStatus(status: LegacyTaskStatus | 'unknown'): ApiTaskStatus {
	switch (status) {
		case 'working':
			return { status: 'active', stage: 'work' };
		case 'ready_for_review':
		case 'reviewing':
			return { status: 'active', stage: 'review' };
		default:
			// pending, done, blocked, cancelled pass through; `unknown` hits the fallback.
			return { status, stage: null };
	}
}
