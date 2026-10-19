/**
 * Display formatting shared by the ticket pages. Browser-safe and pure.
 * Unavailable figures render as "—", never as 0 or $0.00.
 */
import type { Actor, StageSummary } from './models';
import { TASK_STAGE_LABELS } from './status';

export const UNAVAILABLE = '—';

/** `2026-10-13 09:01 UTC`, or "—" for a missing or unparsable timestamp. */
export function formatTimestamp(value: string | null | undefined): string {
	if (value == null) return UNAVAILABLE;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return UNAVAILABLE;
	const iso = date.toISOString();
	return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** `$3.42`, or "—" when the factory has no number. */
export function formatCost(costUsd: number | null | undefined): string {
	if (costUsd == null || !Number.isFinite(costUsd)) return UNAVAILABLE;
	return `$${costUsd.toFixed(2)}`;
}

/** `1,034,700`, or "—". */
export function formatCount(count: number | null | undefined): string {
	if (count == null || !Number.isFinite(count)) return UNAVAILABLE;
	return count.toLocaleString('en-US');
}

/** Enum values as words: `changes_requested` → `changes requested`. */
export function words(value: string): string {
	return value.replaceAll('_', ' ');
}

/** Stage names as GLOSSARY spells them; unknown stages pass through. */
export function stageLabel(stage: string): string {
	return Object.hasOwn(TASK_STAGE_LABELS, stage)
		? TASK_STAGE_LABELS[stage as keyof typeof TASK_STAGE_LABELS]
		: stage;
}

/** Counts known to read best in this order; any others follow in API order. */
const COUNT_ORDER = ['findings', 'blocking', 'tested', 'gaps'];

/**
 * `review round 2 · changes requested · findings 3 · blocking 1`, or
 * `QA round 1 · passed · tested 5 · gaps 6`. Unknown stages render generically.
 */
export function summaryText(summary: StageSummary): string {
	const counts = Object.entries(summary.counts);
	const ordered = [
		...COUNT_ORDER.flatMap((name) => counts.filter(([key]) => key === name)),
		...counts.filter(([key]) => !COUNT_ORDER.includes(key))
	];
	return [
		`${stageLabel(summary.stage)} round ${summary.round}`,
		words(summary.label),
		...ordered.map(([name, count]) => `${words(name)} ${count}`)
	].join(' · ');
}

/** `dashboard (Diego)`, `cli`, or "—" when the reply has no actor. */
export function actorText(actor: Actor | null): string {
	if (actor === null) return UNAVAILABLE;
	return actor.onBehalfOf ? `${actor.client} (${actor.onBehalfOf})` : actor.client;
}
