/**
 * Runs grouped for the run timeline: by task, then by stage, each in the
 * order it first appears, with runs in sequence order inside a group. Pure
 * and browser-safe.
 */
import type { RunView } from './models';

/** Runs with no task (plan, wrapup) belong to the ticket. */
export const TICKET_GROUP_LABEL = 'Ticket';

export type RunStageGroup<R extends RunView = RunView> = {
	stage: string;
	runs: R[];
};

export type RunTaskGroup<R extends RunView = RunView> = {
	/** Null for the ticket-level group. */
	task: string | null;
	label: string;
	stages: RunStageGroup<R>[];
};

/**
 * Group runs by task, then stage. "First seen" follows sequence order, so the
 * oldest run decides where its task and stage group sits.
 */
export function groupRuns<R extends RunView>(runs: readonly R[]): RunTaskGroup<R>[] {
	const ordered = [...runs].sort((a, b) => a.sequence - b.sequence);
	const groups: RunTaskGroup<R>[] = [];
	const byTask = new Map<string | null, RunTaskGroup<R>>();
	for (const run of ordered) {
		let group = byTask.get(run.task);
		if (!group) {
			group = {
				task: run.task,
				label: run.task === null ? TICKET_GROUP_LABEL : run.task,
				stages: []
			};
			byTask.set(run.task, group);
			groups.push(group);
		}
		let stage = group.stages.find((entry) => entry.stage === run.stage);
		if (!stage) {
			stage = { stage: run.stage, runs: [] };
			group.stages.push(stage);
		}
		stage.runs.push(run);
	}
	return groups;
}
