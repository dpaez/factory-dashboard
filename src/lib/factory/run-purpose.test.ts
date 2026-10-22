import { describe, expect, it } from 'vitest';

import { runsHistory } from './fixtures';
import { RUN_PURPOSE_LABELS, runPurposeLabel } from './run-purpose';

describe('runPurposeLabel', () => {
	it.each([
		['initial', 'First run'],
		['validation_correction', 'Correction'],
		['human_reply', 'Reply'],
		['return_to_work', 'Return to work'],
		['reentry', 'Re-entry'],
		['manual_continue', 'Continue'],
		['infrastructure_retry', 'Infrastructure retry']
	])('labels %s as %s', (purpose, label) => {
		expect(runPurposeLabel(purpose)).toEqual({ label, known: true });
	});

	it('covers every factory purpose in one table', () => {
		expect(Object.keys(RUN_PURPOSE_LABELS)).toHaveLength(7);
	});

	it('returns an unknown purpose as its raw value, marked unknown', () => {
		expect(runPurposeLabel('operator_nudge')).toEqual({ label: 'operator_nudge', known: false });
		expect(runPurposeLabel('Implement task 01')).toEqual({
			label: 'Implement task 01',
			known: false
		});
	});

	it('does not treat object prototype keys as known', () => {
		expect(runPurposeLabel('toString')).toEqual({ label: 'toString', known: false });
		expect(runPurposeLabel('__proto__')).toEqual({ label: '__proto__', known: false });
	});

	it('never returns an empty label', () => {
		expect(runPurposeLabel('')).toEqual({ label: 'Unknown', known: false });
	});

	it('the history fixture has exactly one unknown purpose', () => {
		const unknown = runsHistory.filter((run) => !runPurposeLabel(run.purpose).known);
		expect(unknown.map((run) => run.purpose)).toEqual(['operator_nudge']);
	});
});
