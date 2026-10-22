import { describe, expect, it } from 'vitest';

import { toRun } from './adapters';
import { runsHistory } from './fixtures';
import type { RunView } from './models';
import { groupRuns } from './run-groups';

const run = (id: string, sequence: number, task: string | null, stage: string): RunView => ({
	...toRun(runsHistory[0]!),
	id,
	sequence,
	task,
	stage
});

const shape = (groups: ReturnType<typeof groupRuns>) =>
	groups.map((group) => ({
		label: group.label,
		task: group.task,
		stages: group.stages.map((stage) => [stage.stage, stage.runs.map((r) => r.id)])
	}));

describe('groupRuns', () => {
	it('groups the history by task, then stage, in first-seen order', () => {
		expect(shape(groupRuns(runsHistory.map(toRun)))).toEqual([
			{
				label: 'Ticket',
				task: null,
				stages: [['plan', ['run_hist_plan', 'run_hist_nudge']]]
			},
			{
				label: '01',
				task: '01',
				stages: [
					[
						'work',
						['run_hist_01_work_initial', 'run_hist_01_work_correction', 'run_hist_01_work_return']
					],
					['review', ['run_hist_01_review_changes', 'run_hist_01_review_reentry']]
				]
			},
			{
				label: '02',
				task: '02',
				stages: [['work', ['run_hist_02_work_crashed', 'run_hist_02_work_retry']]]
			}
		]);
	});

	it('keeps sequence order inside a group whatever the input order', () => {
		const groups = groupRuns([
			run('c', 3, '01', 'work'),
			run('a', 1, '01', 'work'),
			run('b', 2, '01', 'review')
		]);
		expect(shape(groups)).toEqual([
			{
				label: '01',
				task: '01',
				stages: [
					['work', ['a', 'c']],
					['review', ['b']]
				]
			}
		]);
	});

	it('puts task-less runs (plan, wrapup) in one Ticket group where they first appear', () => {
		const groups = groupRuns([
			run('w1', 2, '01', 'work'),
			run('p', 1, null, 'plan'),
			run('wrap', 9, null, 'wrapup')
		]);
		expect(shape(groups)).toEqual([
			{
				label: 'Ticket',
				task: null,
				stages: [
					['plan', ['p']],
					['wrapup', ['wrap']]
				]
			},
			{ label: '01', task: '01', stages: [['work', ['w1']]] }
		]);
	});

	it('is pure: the input is not reordered', () => {
		const input = [run('b', 2, '01', 'work'), run('a', 1, '01', 'work')];
		groupRuns(input);
		expect(input.map((r) => r.id)).toEqual(['b', 'a']);
		expect(groupRuns([])).toEqual([]);
	});
});
