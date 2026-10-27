import { describe, expect, it } from 'vitest';

import {
	statsExportComplete,
	statsExportCompleteText,
	statsExportEmpty,
	statsExportMalformedText,
	statsExportOf,
	statsExportText,
	statsExportTruncatedText,
	statsExportZeroMerges,
	type StatsExportFixture
} from './fixtures';
import { formatCost } from './format';
import {
	CATEGORIES_UNAVAILABLE,
	DEFINITIONS,
	parseCohortWindow,
	toCohort,
	toTokensByStage
} from './stats';
import {
	EXPORT_INCOMPLETE,
	NO_MERGES,
	reconcileExport,
	SUMMARY_COUNT_MISMATCH,
	toEfficiencySignals,
	toExportEnvelope,
	toExportStatus,
	toNoReturnsToWork
} from './stats-efficiency';
import { createStatsExportParser, type StatsExportParse } from './stats-export';
import { NO_HANDOFFS } from './stats-tickets';
import { statsCompleteStages, statsCompleteSummary } from './fixtures';

const cohort = { id: '2026-09-24T00:00:00Z/2026-10-24T00:00:00Z' };

function parse(text: string): StatsExportParse {
	const parser = createStatsExportParser();
	parser.push(text);
	return parser.end();
}

const parsed = (fixture: StatsExportFixture) => parse(statsExportText(fixture));

const MINUTE = 60_000;

describe('toEfficiencySignals: complete export', () => {
	const complete = parse(statsExportCompleteText);
	const signals = toEfficiencySignals(complete, cohort);

	it('is complete with no diagnostics', () => {
		expect(signals.status).toEqual({
			complete: true,
			diagnostics: 0,
			malformedLines: 0,
			endedEarly: false,
			reason: null
		});
		expect(signals.executions).toMatchObject({ value: 26, availability: 'complete' });
	});

	it('blended cost per merged ticket is $48.20 / 16 = 3.0125, shown as $3.01', () => {
		const metric = signals.blendedCostPerMerged;
		expect(metric.availability).toBe('complete');
		expect(metric.unit).toBe('USD');
		expect(metric.numerator).toBeCloseTo(48.2, 10);
		expect(metric.denominator).toBe(16);
		expect(metric.value).toBeCloseTo(3.0125, 10);
		expect(formatCost(metric.value)).toBe('$3.01');
		expect(metric.label).toMatch(/blended/i);
		expect(metric.definition).toMatch(/blended/i);
		expect(metric.sampleSize).toBe(26);
	});

	it('waiting share is Σ waiting before handoff over Σ start → handoff, over the eligible sample', () => {
		const eligible = complete.tickets.filter(
			(line) => line.startToHandoffMs !== null && line.factoryMs !== null
		);
		const waiting = eligible.reduce(
			(sum, line) => sum + (line.startToHandoffMs ?? 0) - (line.factoryMs ?? 0),
			0
		);
		const elapsed = eligible.reduce((sum, line) => sum + (line.startToHandoffMs ?? 0), 0);
		expect(waiting).toBe(245 * MINUTE);
		expect(signals.waitingShare).toMatchObject({
			availability: 'complete',
			unit: 'ratio',
			numerator: waiting,
			denominator: elapsed,
			sampleSize: 20,
			excludedCount: 6
		});
		expect(signals.waitingShare.value).toBeCloseTo(waiting / elapsed, 12);
	});

	it('rework token share counts only return-to-work and validation-correction runs', () => {
		const tokens = (purposes: string[]) =>
			complete.runs
				.filter((run) => run.tokensInput !== null && purposes.includes(run.purpose))
				.reduce((sum, run) => sum + run.tokens, 0);
		const knownRuns = complete.runs.filter((run) => run.tokensInput !== null);
		const knownTokens = knownRuns.reduce((sum, run) => sum + run.tokens, 0);
		const rework = tokens(['return_to_work', 'validation_correction']);
		expect(rework).toBeGreaterThan(0);
		expect(signals.rework.share).toMatchObject({
			availability: 'complete',
			numerator: rework,
			denominator: knownTokens,
			sampleSize: knownRuns.length,
			excludedCount: 1
		});
		const [returns, corrections] = signals.rework.parts;
		expect(returns).toMatchObject({ purpose: 'return_to_work' });
		expect(returns?.runs.value).toBe(3);
		expect(returns?.tokens.value).toBe(tokens(['return_to_work']));
		expect(corrections).toMatchObject({ purpose: 'validation_correction' });
		expect(corrections?.runs.value).toBe(2);
		expect(corrections?.tokens.value).toBe(tokens(['validation_correction']));
		expect((returns?.tokens.value ?? 0) + (corrections?.tokens.value ?? 0)).toBe(rework);
		expect(DEFINITIONS.reworkTokenShare).toMatch(/return-to-work/);
		expect(DEFINITIONS.reworkTokenShare).toMatch(/validation-correction/);
		expect(DEFINITIONS.reworkTokenShare).toMatch(/repeat run alone .* is not rework/);
	});

	it('reports unknown-usage runs as coverage, not as 0 tokens', () => {
		expect(signals.usageCoverage).toMatchObject({
			availability: 'complete',
			numerator: complete.runs.length - 1,
			denominator: complete.runs.length,
			excludedCount: 1
		});
	});

	it('reports infrastructure-lost attempts and tokens with their overlap with rework', () => {
		const lost = complete.runs.filter((run) => run.infrastructureLost);
		const lostTokens = lost
			.filter((run) => run.tokensInput !== null)
			.reduce((sum, run) => sum + run.tokens, 0);
		const infra = signals.infrastructureLost;
		expect(infra.attempts.value).toBe(4);
		expect(infra.tokens.value).toBe(lostTokens);
		expect(infra.share.numerator).toBe(lostTokens);
		expect(infra.share.denominator).toBe(signals.rework.share.denominator);
		// One lost return to work is counted in both figures.
		const overlapRun = lost.find((run) => run.purpose === 'return_to_work');
		expect(infra.overlap.runs.value).toBe(1);
		expect(infra.overlap.tokens.value).toBe(overlapRun?.tokens);
		expect(DEFINITIONS.infrastructureLostShare).toMatch(/not a partition/);
	});
});

describe('toEfficiencySignals: inline exports', () => {
	it('waiting share is weighted, not the mean of per-execution ratios', () => {
		const fixture = statsExportOf([
			{ outcome: 'merged', costUsd: 1, toHandoff: 100, waitingBefore: 50 },
			{ outcome: 'merged', costUsd: 1, toHandoff: 900, waitingBefore: 0 }
		]);
		const share = toEfficiencySignals(parsed(fixture), cohort).waitingShare;
		const unweighted = (50 / 100 + 0 / 900) / 2;
		expect(share.value).toBeCloseTo(50 / 1000, 12);
		expect(share.value).not.toBeCloseTo(unweighted, 3);
	});

	it('repeated initial, reentry and infrastructure-retry runs are not rework', () => {
		const fixture = statsExportOf([
			{
				outcome: 'merged',
				costUsd: 2,
				toHandoff: 120,
				extraRuns: [
					{ stage: 'work', purpose: 'initial', passed: true },
					{ stage: 'work', purpose: 'reentry', passed: true },
					{
						stage: 'work',
						purpose: 'infrastructure_retry',
						infrastructureLost: true,
						passed: true
					},
					{ stage: 'work', purpose: 'human_reply', passed: true },
					{ stage: 'work', purpose: 'manual_continue', passed: true }
				]
			}
		]);
		const signals = toEfficiencySignals(parsed(fixture), cohort);
		expect(signals.rework.share).toMatchObject({
			availability: 'complete',
			value: 0,
			numerator: 0
		});
		expect(signals.rework.parts.map((part) => part.runs.value)).toEqual([0, 0]);
		// The retry is infrastructure-lost, yet nothing is added to or taken from rework.
		expect(signals.infrastructureLost.attempts.value).toBe(1);
		expect(signals.infrastructureLost.overlap.runs.value).toBe(0);
	});

	it('infrastructure-lost rework stays in rework: the overlap is disclosed, not subtracted', () => {
		const fixture = statsExportOf([
			{
				outcome: 'merged',
				costUsd: 2,
				toHandoff: 120,
				extraRuns: [
					{
						stage: 'work',
						purpose: 'validation_correction',
						infrastructureLost: true,
						passed: null
					}
				]
			}
		]);
		const { runs } = fixture;
		const lostRun = runs.find((run) => run.infrastructureLost);
		const signals = toEfficiencySignals(parsed(fixture), cohort);
		expect(signals.rework.share.numerator).toBe(lostRun?.tokens);
		expect(signals.infrastructureLost.tokens.value).toBe(lostRun?.tokens);
		expect(signals.infrastructureLost.overlap.tokens.value).toBe(lostRun?.tokens);
		expect(signals.infrastructureLost.overlap.runs.value).toBe(1);
	});

	it('a run with unknown usage is excluded from token shares even if it reports tokens', () => {
		const fixture = statsExportOf([{ outcome: 'merged', costUsd: 1, toHandoff: 60 }]);
		const known = fixture.runs.reduce((sum, run) => sum + run.tokens, 0);
		const extra = {
			...fixture.runs[0]!,
			run: 'unknown-usage-run',
			purpose: 'return_to_work' as const,
			tokens: 999_999,
			tokensInput: null
		};
		const signals = toEfficiencySignals(
			parse(statsExportText({ tickets: fixture.tickets, runs: [...fixture.runs, extra] })),
			cohort
		);
		expect(signals.rework.share).toMatchObject({
			numerator: 0,
			denominator: known,
			excludedCount: 1
		});
		expect(signals.rework.parts[0]?.runs.value).toBe(1);
		expect(signals.rework.parts[0]?.tokens.value).toBe(0);
		expect(signals.usageCoverage).toMatchObject({ numerator: 4, denominator: 5, excludedCount: 1 });
	});

	it('zero merged executions: blended cost per merge is Unavailable, never 0', () => {
		const signals = toEfficiencySignals(parsed(statsExportZeroMerges), cohort);
		expect(signals.blendedCostPerMerged).toMatchObject({
			value: null,
			availability: 'unavailable',
			unavailableReason: NO_MERGES,
			denominator: 0
		});
		expect(signals.blendedCostPerMerged.numerator).toBeCloseTo(7.45, 10);
	});

	it('no handoffs: waiting share and no returns to work are Unavailable', () => {
		const fixture = statsExportOf([
			{ outcome: 'open', costUsd: 1 },
			{ outcome: 'cancelled', costUsd: 0.5 }
		]);
		const parse = parsed(fixture);
		expect(toEfficiencySignals(parse, cohort).waitingShare).toMatchObject({
			value: null,
			availability: 'unavailable',
			unavailableReason: NO_HANDOFFS,
			sampleSize: 0,
			excludedCount: 2
		});
		expect(toNoReturnsToWork(parse, cohort)).toMatchObject({
			value: null,
			availability: 'unavailable',
			unavailableReason: NO_HANDOFFS,
			denominator: 0
		});
	});

	it('an empty export has every share Unavailable and counts of 0', () => {
		const signals = toEfficiencySignals(parsed(statsExportEmpty), cohort);
		expect(signals.status.complete).toBe(true);
		expect(signals.executions).toMatchObject({ value: 0, availability: 'complete' });
		for (const metric of [
			signals.waitingShare,
			signals.blendedCostPerMerged,
			signals.rework.share,
			signals.usageCoverage,
			signals.infrastructureLost.share
		]) {
			expect(metric).toMatchObject({ value: null, availability: 'unavailable' });
		}
	});
});

describe('toNoReturnsToWork', () => {
	it('is handoff-reached executions without a return-to-work run over handoff-reached executions', () => {
		const metric = toNoReturnsToWork(parse(statsExportCompleteText), cohort);
		// 20 reached handoff; 3 of them had a return to work (corrections do not count).
		expect(metric).toMatchObject({
			availability: 'complete',
			numerator: 17,
			denominator: 20,
			sampleSize: 20,
			excludedCount: 6
		});
		expect(metric.value).toBeCloseTo(17 / 20, 12);
	});

	it('only return_to_work excludes an execution', () => {
		const fixture = statsExportOf([
			{
				outcome: 'merged',
				costUsd: 1,
				toHandoff: 60,
				extraRuns: [
					{ stage: 'work', purpose: 'validation_correction' },
					{ stage: 'work', purpose: 'infrastructure_retry', infrastructureLost: true },
					{ stage: 'work', purpose: 'reentry' }
				]
			},
			{
				outcome: 'merged',
				costUsd: 1,
				toHandoff: 60,
				extraRuns: [{ stage: 'work', purpose: 'return_to_work', returnedFrom: 'review' }]
			},
			// A return to work before handoff is never reached: not in the denominator.
			{
				outcome: 'open',
				costUsd: 1,
				extraRuns: [{ stage: 'work', purpose: 'return_to_work', returnedFrom: 'qa' }]
			}
		]);
		expect(toNoReturnsToWork(parsed(fixture), cohort)).toMatchObject({
			numerator: 1,
			denominator: 2,
			value: 0.5,
			excludedCount: 1
		});
	});
});

describe('incomplete exports', () => {
	const cases: Array<[string, StatsExportParse, RegExp]> = [
		['malformed', parse(statsExportMalformedText), /2 malformed lines/],
		['truncated', parse(statsExportTruncatedText), /1 malformed line, export ended early/],
		[
			'failed mid-stream',
			(() => {
				const parser = createStatsExportParser();
				parser.push(statsExportCompleteText.slice(0, 2000));
				return parser.fail('read failed');
			})(),
			/export ended early/
		]
	];

	it.each(cases)(
		'%s: every share, ratio and per-merge figure is Unavailable',
		(_name, read, reason) => {
			const signals = toEfficiencySignals(read, cohort);
			expect(signals.status.complete).toBe(false);
			expect(signals.status.reason).toMatch(new RegExp(`^${EXPORT_INCOMPLETE} — `));
			expect(signals.status.reason).toMatch(reason);
			const ratios = [
				signals.waitingShare,
				signals.blendedCostPerMerged,
				signals.rework.share,
				...signals.rework.parts.map((part) => part.share),
				signals.usageCoverage,
				signals.infrastructureLost.share,
				toNoReturnsToWork(read, cohort)
			];
			for (const metric of ratios) {
				expect(metric.value).toBeNull();
				expect(metric.availability).toBe('unavailable');
				expect(metric.unavailableReason).toBe(signals.status.reason);
			}
			const counts = [
				signals.executions,
				signals.runs,
				signals.infrastructureLost.attempts,
				signals.infrastructureLost.tokens,
				signals.infrastructureLost.overlap.runs,
				...signals.rework.parts.map((part) => part.runs)
			];
			for (const metric of counts) {
				expect(metric.availability).toBe('partial');
				expect(metric.value).not.toBeNull();
			}
		}
	);

	it('reports the malformed-line count', () => {
		expect(toExportStatus(parse(statsExportMalformedText))).toMatchObject({
			complete: false,
			diagnostics: 2,
			malformedLines: 2,
			endedEarly: false,
			reason: `${EXPORT_INCOMPLETE} — 2 malformed lines`
		});
	});

	it('an order violation is incomplete even though every line parsed', () => {
		const [ticket, ...others] = statsExportComplete.tickets;
		const text =
			statsExportText({ tickets: others, runs: [] }) +
			statsExportText({ tickets: [], runs: statsExportComplete.runs.slice(0, 1) }) +
			statsExportText({ tickets: [ticket!], runs: [] });
		const signals = toEfficiencySignals(parse(text), cohort);
		expect(signals.status.complete).toBe(false);
		expect(signals.blendedCostPerMerged.availability).toBe('unavailable');
	});
});

describe('cohort and token categories', () => {
	it('the export envelope joins toCohort so a mismatch is flagged', () => {
		const window = parseCohortWindow(new URLSearchParams(), new Date('2026-10-24T00:00:00Z'));
		const same = toExportEnvelope(parse(statsExportCompleteText));
		const other = toExportEnvelope(
			parsed(statsExportOf([{ outcome: 'open', costUsd: 1 }], 'factory-geut-02'))
		);
		expect(toCohort([statsCompleteSummary, same], window, '').mismatch).toBe(false);
		expect(toCohort([statsCompleteSummary, other], window, '').mismatch).toBe(true);
		expect(toExportEnvelope(parsed(statsExportEmpty))).toBeNull();
	});

	it('token categories by stage stay Unavailable', () => {
		const tokens = toTokensByStage(statsCompleteStages, statsCompleteSummary, cohort);
		expect(tokens.categories).toMatchObject({
			availability: 'unavailable',
			unavailableReason: CATEGORIES_UNAVAILABLE
		});
	});
});

describe('reconcileExport', () => {
	const complete = parse(statsExportCompleteText);

	it('keeps the export when the summary counts the same executions', () => {
		expect(reconcileExport(complete, statsCompleteSummary)).toBe(complete);
	});

	it('a different started count is not complete, and not a malformed line', () => {
		const status = toExportStatus(
			reconcileExport(complete, { ...statsCompleteSummary, started: 27 })
		);
		expect(status).toMatchObject({
			complete: false,
			malformedLines: 0,
			reason: `${EXPORT_INCOMPLETE} — ${SUMMARY_COUNT_MISMATCH}`
		});
	});

	it('is skipped without a summary or across envelopes', () => {
		expect(reconcileExport(complete, null)).toBe(complete);
		const other = { ...statsCompleteSummary, factoryId: 'factory-geut-02', started: 1 };
		expect(reconcileExport(complete, other)).toBe(complete);
	});
});
