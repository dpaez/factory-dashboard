import { describe, expect, it } from 'vitest';

import {
	executionList,
	statsCompleteSummary,
	statsConfigurations,
	statsTicketMultiExecutionRow,
	statsTicketWaitingRow,
	statsTicketsComplete,
	statsTicketsMissingTimings,
	statsTicketsNoHandoffs,
	statsTicketsSmallSample
} from './fixtures';
import {
	CHANGES_REQUESTED_UNAVAILABLE,
	CONTRIBUTOR_MEASURES,
	NO_HANDOFFS,
	TICKET_FACTS_INCOMPLETE,
	executionHref,
	median,
	p90,
	parseConfiguration,
	toConfigurationComparison,
	toContributors,
	toTicketsQuality,
	toTimeBreakdown,
	type StatsTicketRow
} from './stats-tickets';

const cohort = { id: '2026-10-01T00:00:00Z/2026-10-31T00:00:00Z' };
const MINUTE = 60_000;
const rows: StatsTicketRow[] = statsTicketsComplete.items;

describe('quantiles', () => {
	it('P90 is nearest-rank: the 9th of 10, the 18th of 20, the only value of 1', () => {
		const ten = [10, 3, 7, 1, 9, 2, 8, 4, 6, 5];
		expect(p90(ten)).toBe(9);
		const twenty = Array.from({ length: 20 }, (_, index) => 20 - index);
		expect(p90(twenty)).toBe(18);
		expect(p90([42])).toBe(42);
	});

	it('an empty sample is null, never 0', () => {
		expect(p90([])).toBeNull();
		expect(median([])).toBeNull();
	});

	it('median matches the factory: middle value, or the mean of the two middles', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});

	it('P90 over the complete fixture is its 9th sorted start → handoff', () => {
		const durations = rows
			.map((row) => row.startToHandoffMs)
			.filter((value): value is number => value !== null)
			.sort((left, right) => left - right);
		expect(durations).toHaveLength(10);
		const time = toTimeBreakdown(rows, true, cohort);
		expect(time.startToHandoff.p90.value).toBe(durations[8]);
		expect(time.startToHandoff.p90.value).toBe(480 * MINUTE);
	});
});

describe('toTimeBreakdown', () => {
	it('excludes rows without a handoff from every time figure', () => {
		const time = toTimeBreakdown(rows, true, cohort);
		expect(time.sampleSize).toBe(10);
		expect(time.excludedCount).toBe(2);
		expect(time.excludedByOutcome).toEqual([
			{ outcome: 'open', count: 1 },
			{ outcome: 'cancelled', count: 1 }
		]);
		for (const metric of [
			time.startToHandoff.mean,
			time.startToHandoff.median,
			time.startToHandoff.p90,
			time.waitingBeforeHandoff,
			time.factoryTime,
			time.agentTime
		]) {
			expect(metric.sampleSize).toBe(10);
			expect(metric.excludedCount).toBe(2);
			expect(metric.availability).toBe('complete');
		}
		expect(time.executions.value).toBe(12);
		expect(time.reachedHandoff.value).toBe(10);
		expect(time.startToHandoff.mean.value).toBe(258 * MINUTE);
		expect(time.startToHandoff.median.value).toBe(210 * MINUTE);
	});

	it('does not count waiting twice: waiting before + factory = start → handoff', () => {
		const row = statsTicketWaitingRow;
		// The row waited before and after handoff.
		expect(row.waitingMs).toBe(150 * MINUTE);
		const time = toTimeBreakdown([row], true, cohort);
		expect(time.waitingBeforeHandoff.value).toBe(60 * MINUTE);
		expect((time.waitingBeforeHandoff.value ?? 0) + (time.factoryTime.value ?? 0)).toBe(
			time.startToHandoff.mean.value
		);
		// The 90 minutes after handoff appear in no time figure.
		const after = row.waitingMs - (time.waitingBeforeHandoff.value ?? 0);
		const figures = [
			time.startToHandoff.mean.value,
			time.waitingBeforeHandoff.value,
			time.factoryTime.value
		];
		expect(figures).not.toContain(row.waitingMs);
		expect(time.startToHandoff.mean.value).toBe(row.startToHandoffMs);
		expect(after).toBe(90 * MINUTE);
	});

	it('means over the cohort keep waiting before + factory = start → handoff', () => {
		const time = toTimeBreakdown(rows, true, cohort);
		expect(time.waitingBeforeHandoff.value).toBe(15 * MINUTE);
		expect(time.factoryTime.value).toBe(243 * MINUTE);
	});

	it('no handoffs: headline, median and P90 Unavailable, excluded = all rows', () => {
		const items = statsTicketsNoHandoffs.items;
		const time = toTimeBreakdown(items, true, cohort);
		expect(time.sampleSize).toBe(0);
		expect(time.excludedCount).toBe(items.length);
		for (const metric of Object.values(time.startToHandoff)) {
			expect(metric.value).toBeNull();
			expect(metric.availability).toBe('unavailable');
			expect(metric.unavailableReason).toBe(NO_HANDOFFS);
		}
		expect(time.factoryTime.value).toBeNull();
		expect(time.overhead.value).toBeNull();
		expect(time.stages.every((stage) => stage.mean.value === null && stage.scale === 0)).toBe(true);
	});

	it('an incomplete load makes means and quantiles Unavailable, counts partial', () => {
		const time = toTimeBreakdown(rows, false, cohort);
		for (const metric of [
			...Object.values(time.startToHandoff),
			time.waitingBeforeHandoff,
			time.factoryTime,
			time.agentTime,
			time.overhead,
			time.unattributed,
			...time.stages.map((stage) => stage.mean)
		]) {
			expect(metric.value).toBeNull();
			expect(metric.unavailableReason).toBe(TICKET_FACTS_INCOMPLETE);
		}
		expect(time.executions).toMatchObject({ value: 12, availability: 'partial' });
		expect(time.reachedHandoff).toMatchObject({ value: 10, availability: 'partial' });
	});

	it('discloses n on a small sample', () => {
		const time = toTimeBreakdown(statsTicketsSmallSample.items, true, cohort);
		expect(time.sampleSize).toBe(3);
		expect(time.startToHandoff.p90.sampleSize).toBe(3);
		expect(time.startToHandoff.p90.value).toBe(600 * MINUTE);
	});

	it('stage bars: STAGE_ORDER, one shared scale, absent stages count as 0', () => {
		const time = toTimeBreakdown(rows, true, cohort);
		expect(time.stages.map((stage) => stage.stage)).toEqual([
			'plan',
			'work',
			'qa',
			'review',
			'wrapup'
		]);
		const work = time.stages.find((stage) => stage.stage === 'work');
		expect(work?.scale).toBe(1);
		const qa = time.stages.find((stage) => stage.stage === 'qa');
		// QA ran on 3 of 10 executions: (40 + 15 + 30) / 10 minutes.
		expect(qa?.mean.value).toBe(8.5 * MINUTE);
		expect(qa?.scale).toBeCloseTo((qa?.mean.value ?? 0) / (work?.mean.value ?? 1));
	});

	it('shows an unattributed remainder when stage means fall short of factory time', () => {
		const time = toTimeBreakdown(rows, true, cohort);
		const stageSum = time.stages.reduce((sum, stage) => sum + (stage.mean.value ?? 0), 0);
		expect(time.unattributed.value).toBeCloseTo((time.factoryTime.value ?? 0) - stageSum);
		expect(time.unattributed.value).toBeGreaterThan(0);
		expect(time.inconsistencyMs).toBeNull();
	});

	it('flags stage time over factory time rather than clamping it', () => {
		const row = {
			...statsTicketMultiExecutionRow,
			factoryMs: 60 * MINUTE,
			startToHandoffMs: 90 * MINUTE
		};
		const time = toTimeBreakdown([row], true, cohort);
		// Stages sum to 170 minutes.
		expect(time.inconsistencyMs).toBe(110 * MINUTE);
		expect(time.unattributed.value).toBeNull();
		expect(time.unattributed.availability).toBe('unavailable');
	});

	it('discloses clamped factory time', () => {
		const row = { ...statsTicketMultiExecutionRow, factoryMs: 0 };
		expect(toTimeBreakdown([row], true, cohort).clampedCount).toBe(1);
	});

	it('missing timings: stage time keeps every eligible execution, overhead its own n', () => {
		const time = toTimeBreakdown(statsTicketsMissingTimings.items, true, cohort);
		expect(time.sampleSize).toBe(3);
		expect(time.startToHandoff.mean.availability).toBe('complete');
		expect(time.overhead).toMatchObject({
			sampleSize: 1,
			excludedCount: 2,
			availability: 'partial'
		});
		expect(time.overhead.value).toBe(statsTicketMultiExecutionRow.overheadMs);
		// Empty stage maps count as 0: work's mean is its 100 minutes over 3.
		const work = time.stages.find((stage) => stage.stage === 'work');
		expect(work?.mean).toMatchObject({ sampleSize: 3, availability: 'complete' });
		expect(work?.mean.value).toBeCloseTo((100 * MINUTE) / 3);
		const stageSum = time.stages.reduce((sum, stage) => sum + (stage.mean.value ?? 0), 0);
		expect(time.unattributed.sampleSize).toBe(3);
		expect(time.unattributed.value).toBeCloseTo((time.factoryTime.value ?? 0) - stageSum);
		expect(time.agentTime.sampleSize).toBe(3);
	});

	it('agent time is a mean per execution, overhead over non-null rows', () => {
		const time = toTimeBreakdown(rows, true, cohort);
		const agent = rows
			.filter((row) => row.startToHandoffMs !== null)
			.reduce((sum, row) => sum + row.agentMs, 0);
		expect(time.agentTime.value).toBe(agent / 10);
		expect(time.overhead.sampleSize).toBe(10);
	});
});

describe('toTicketsQuality', () => {
	it('needed a person over all executions, with the six intervention kinds', () => {
		const quality = toTicketsQuality(rows, null, true, cohort);
		expect(quality.neededAPerson).toMatchObject({ numerator: 6, denominator: 12, value: 0.5 });
		expect(quality.interventions.map((item) => [item.kind, item.count.value])).toEqual([
			['questions', 4],
			['limitPauses', 1],
			['replies', 3],
			['manualRetries', 1],
			['manualCompletes', 1],
			['stops', 1]
		]);
		expect(quality.reconciled).toBeNull();
	});

	it('reconciles against a summary', () => {
		expect(toTicketsQuality(rows, statsCompleteSummary, true, cohort).reconciled).toBe(false);
		const summary = {
			...statsCompleteSummary,
			started: 12,
			neededAPerson: 6,
			interventions: {
				questions: 4,
				limitPauses: 1,
				replies: 3,
				manualRetries: 1,
				manualCompletes: 1,
				stops: 1
			}
		};
		expect(toTicketsQuality(rows, summary, true, cohort).reconciled).toBe(true);
	});

	it('external review rounds keep the stats.v1 definition over merged or abandoned rows', () => {
		const quality = toTicketsQuality(rows, null, true, cohort);
		const rounds = quality.externalReviewRounds;
		expect(rounds.sampleSize).toBe(9);
		// KAI-23's open pull request is outside the sample.
		expect(rounds.total.value).toBe(8);
		expect(rounds.human.value).toBe(4);
		expect(rounds.bot.value).toBe(4);
		expect(rounds.median.value).toBe(1);
		expect(rounds.total.definition).toMatch(/comment with a body/);
	});

	it('external changes requested is Unavailable and cites geut/factory-skills#63', () => {
		const metric = toTicketsQuality(rows, null, true, cohort).externalChangesRequested;
		expect(metric.availability).toBe('unavailable');
		expect(metric.value).toBeNull();
		expect(metric.unavailableReason).toBe(CHANGES_REQUESTED_UNAVAILABLE);
		expect(metric.unavailableReason).toContain('geut/factory-skills#63');
	});

	it('follow-up commits sum over handed-off rows', () => {
		const metric = toTicketsQuality(rows, null, true, cohort).followUpCommits;
		expect(metric).toMatchObject({ value: 3, sampleSize: 10 });
	});

	it('an incomplete load leaves shares and medians Unavailable, counts partial', () => {
		const quality = toTicketsQuality(rows, null, false, cohort);
		expect(quality.neededAPerson.value).toBeNull();
		expect(quality.neededAPerson.unavailableReason).toBe(TICKET_FACTS_INCOMPLETE);
		expect(quality.externalReviewRounds.median.value).toBeNull();
		expect(quality.followUpCommits.availability).toBe('partial');
	});
});

describe('toContributors', () => {
	it('lists exactly the rows behind each figure', () => {
		const time = toTimeBreakdown(rows, true, cohort);
		const quality = toTicketsQuality(rows, null, true, cohort);
		expect(toContributors(rows, 'timeSample').rows).toHaveLength(time.sampleSize);
		expect(toContributors(rows, 'timeExcluded').rows).toHaveLength(time.excludedCount);
		expect(toContributors(rows, 'neededAPerson').rows).toHaveLength(
			quality.neededAPerson.numerator ?? -1
		);
		const rounds = toContributors(rows, 'externalReviewRounds').rows;
		expect(rounds.reduce((sum, row) => sum + (row.value ?? 0), 0)).toBe(
			quality.externalReviewRounds.total.value
		);
		const followUps = toContributors(rows, 'followUpCommits').rows;
		expect(followUps.reduce((sum, row) => sum + (row.value ?? 0), 0)).toBe(
			quality.followUpCommits.value
		);
	});

	it('every measure carries a drill-down href per execution', () => {
		for (const measure of CONTRIBUTOR_MEASURES) {
			for (const row of toContributors(rows, measure).rows) {
				expect(row.href).toBe(executionHref(row.key, row.startedAt));
			}
		}
	});

	it('the multi-execution row links to the resolver with generation 1 createdAt', () => {
		const [row] = toContributors([statsTicketMultiExecutionRow], 'timeSample').rows;
		expect(row?.startedAt).toBe(executionList.items[0]?.createdAt);
		const url = new URL(row?.href ?? '', 'http://dashboard.test');
		expect(url.pathname).toBe('/stats/execution');
		expect(url.searchParams.get('key')).toBe('dpaez-factory-dashboard-9-9a0b1c2d');
		expect(url.searchParams.get('startedAt')).toBe('2026-10-05T08:00:00Z');
	});

	it('values and reasons follow the measure', () => {
		const [needed] = toContributors([statsTicketWaitingRow], 'neededAPerson').rows;
		expect(needed).toMatchObject({ value: 5, reason: '2 questions, 1 limit pause, 2 replies' });
		const [excluded] = toContributors(statsTicketsNoHandoffs.items, 'timeExcluded').rows;
		expect(excluded).toMatchObject({ value: null, reason: 'open, no handoff' });
	});
});

describe('toConfigurationComparison', () => {
	it('keeps API order, parses stage=setup pairs and marks small samples', () => {
		const comparison = toConfigurationComparison(statsConfigurations, cohort);
		expect(comparison.factoryVersions).toEqual(['0.14.0', '0.15.1']);
		const [opus, gpt] = comparison.rows;
		expect(opus?.stages).toEqual([
			{ stage: 'plan', label: 'plan', setup: 'claude-opus-5-5:high' },
			{ stage: 'work', label: 'work', setup: 'claude-opus-5-5:high' },
			{ stage: 'review', label: 'review', setup: 'gpt-6:high' }
		]);
		expect(opus?.mergeRate).toMatchObject({ value: 0.75, sampleSize: 4 });
		expect(opus?.smallSample).toBe(true);
		expect(gpt?.mergeRate.availability).toBe('unavailable');
		expect(gpt?.mergeRate.value).toBeNull();
		expect(gpt?.medianFactoryTime.availability).toBe('unavailable');
		expect(gpt?.tickets.value).toBe(1);
	});

	it('five or more executions is not a small sample', () => {
		const configs = {
			...statsConfigurations,
			items: [{ ...statsConfigurations.items[0]!, tickets: 5 }]
		};
		expect(toConfigurationComparison(configs, cohort).rows[0]?.smallSample).toBe(false);
	});

	it('parseConfiguration keeps spaces inside a canonical model · thinking setup', () => {
		expect(parseConfiguration('plan=work-model · medium review=review-model · high')).toEqual([
			{ stage: 'plan', label: 'plan', setup: 'work-model · medium' },
			{ stage: 'review', label: 'review', setup: 'review-model · high' }
		]);
		expect(parseConfiguration(' plan=a:b  work=c:d ')).toEqual([
			{ stage: 'plan', label: 'plan', setup: 'a:b' },
			{ stage: 'work', label: 'work', setup: 'c:d' }
		]);
	});
});
