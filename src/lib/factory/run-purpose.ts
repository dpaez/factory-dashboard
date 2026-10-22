/**
 * Why the factory launched a run, in words. The factory API types `purpose` as
 * a string; the values come from factory-skills `RunPurpose`. Any other value
 * keeps its raw text and is marked unknown, so components can style it as
 * standby. Browser-safe: no imports.
 */

export const RUN_PURPOSE_LABELS = {
	initial: 'First run',
	validation_correction: 'Correction',
	human_reply: 'Reply',
	return_to_work: 'Return to work',
	reentry: 'Re-entry',
	manual_continue: 'Continue',
	infrastructure_retry: 'Infrastructure retry'
} as const satisfies Record<string, string>;

export type RunPurpose = keyof typeof RUN_PURPOSE_LABELS;

export type RunPurposeLabel = { label: string; known: boolean };

const UNKNOWN_LABEL = 'Unknown';

/** The label for a known purpose; anything else is its raw value, marked unknown. */
export function runPurposeLabel(purpose: string): RunPurposeLabel {
	if (Object.hasOwn(RUN_PURPOSE_LABELS, purpose)) {
		return { label: RUN_PURPOSE_LABELS[purpose as RunPurpose], known: true };
	}
	return { label: purpose.trim() === '' ? UNKNOWN_LABEL : purpose, known: false };
}
