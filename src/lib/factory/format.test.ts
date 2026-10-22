import { describe, expect, it } from 'vitest';

import {
	actorText,
	formatCost,
	formatCount,
	formatDuration,
	formatElapsed,
	formatTimestamp,
	stageLabel,
	summaryText
} from './format';

describe('formatCost', () => {
	it('renders unavailable cost as —, never $0.00', () => {
		expect(formatCost(null)).toBe('—');
		expect(formatCost(undefined)).toBe('—');
		expect(formatCost(Number.NaN)).toBe('—');
	});

	it('keeps a known zero as $0.00', () => {
		expect(formatCost(0)).toBe('$0.00');
		expect(formatCost(3.421)).toBe('$3.42');
	});
});

describe('formatCount and formatTimestamp', () => {
	it('render missing values as —', () => {
		expect(formatCount(null)).toBe('—');
		expect(formatCount(1_034_700)).toBe('1,034,700');
		expect(formatTimestamp(null)).toBe('—');
		expect(formatTimestamp('not a date')).toBe('—');
		expect(formatTimestamp('2026-10-13T09:01:30Z')).toBe('2026-10-13 09:01 UTC');
	});
});

describe('summaryText', () => {
	it('formats a review summary with findings before blocking', () => {
		expect(
			summaryText({
				stage: 'review',
				round: 2,
				label: 'changes_requested',
				counts: { blocking: 1, findings: 3 }
			})
		).toBe('review round 2 · changes requested · findings 3 · blocking 1');
	});

	it('formats a QA summary with tested before gaps', () => {
		expect(
			summaryText({ stage: 'qa', round: 1, label: 'passed', counts: { gaps: 6, tested: 5 } })
		).toBe('QA round 1 · passed · tested 5 · gaps 6');
	});

	it('renders other stages and counts generically', () => {
		expect(
			summaryText({ stage: 'deploy', round: 3, label: 'rolled_back', counts: { pods: 2 } })
		).toBe('deploy round 3 · rolled back · pods 2');
		expect(stageLabel('qa')).toBe('QA');
	});
});

describe('actorText', () => {
	it('names the client and who it acted for', () => {
		expect(actorText({ client: 'dashboard', onBehalfOf: 'Diego' })).toBe('dashboard (Diego)');
		expect(actorText({ client: 'cli', onBehalfOf: null })).toBe('cli');
		expect(actorText(null)).toBe('—');
	});
});

describe('formatDuration', () => {
	it('shows milliseconds, seconds and minutes, or "—"', () => {
		expect(formatDuration(4)).toBe('4 ms');
		expect(formatDuration(2_100)).toBe('2.1 s');
		expect(formatDuration(18_250)).toBe('18.3 s');
		expect(formatDuration(125_000)).toBe('2 m 5 s');
		expect(formatDuration(0)).toBe('0 ms');
		expect(formatDuration(null)).toBe('—');
		expect(formatDuration(Number.NaN)).toBe('—');
	});
});

describe('formatElapsed', () => {
	const at = (seconds: number) =>
		new Date(Date.UTC(2026, 9, 13, 9) + seconds * 1_000).toISOString();
	const start = at(0);

	it('picks seconds, minutes or hours by length', () => {
		expect(formatElapsed(start, at(0.2))).toBe('<1 s');
		expect(formatElapsed(start, at(42))).toBe('42 s');
		expect(formatElapsed(start, at(60))).toBe('1 m');
		expect(formatElapsed(start, at(690))).toBe('11 m 30 s');
		expect(formatElapsed(start, at(3_600))).toBe('1 h');
		expect(formatElapsed(start, at(7_500))).toBe('2 h 5 m');
		expect(formatElapsed(start, at(90_000))).toBe('25 h');
	});

	it('is unavailable, never 0, without both ends or with bad times', () => {
		expect(formatElapsed(null, at(10))).toBe('—');
		expect(formatElapsed(start, null)).toBe('—');
		expect(formatElapsed(undefined, undefined)).toBe('—');
		expect(formatElapsed('not a date', at(10))).toBe('—');
		expect(formatElapsed(at(10), start)).toBe('—');
	});
});
