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

/** `4 ms`, `18.3 s`, `2 m 5 s`, or "—" when the check has no duration. */
export function formatDuration(ms: number | null | undefined): string {
	if (ms == null || !Number.isFinite(ms)) return UNAVAILABLE;
	if (ms < 1_000) return `${Math.round(ms)} ms`;
	if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
	const seconds = Math.round(ms / 1_000);
	return `${Math.floor(seconds / 60)} m ${seconds % 60} s`;
}

/**
 * How long a run took, in the largest units that read well: `42 s`,
 * `11 m 30 s`, `2 h 5 m`, `<1 s`. "—" until both ends are known and valid.
 */
export function formatElapsed(
	startedAt: string | null | undefined,
	endedAt: string | null | undefined
): string {
	if (startedAt == null || endedAt == null) return UNAVAILABLE;
	const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
	if (!Number.isFinite(ms) || ms < 0) return UNAVAILABLE;
	const seconds = Math.round(ms / 1_000);
	if (seconds < 1) return '<1 s';
	if (seconds < 60) return `${seconds} s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		const rest = seconds % 60;
		return rest === 0 ? `${minutes} m` : `${minutes} m ${rest} s`;
	}
	const hours = Math.floor(minutes / 60);
	const restMinutes = minutes % 60;
	return restMinutes === 0 ? `${hours} h` : `${hours} h ${restMinutes} m`;
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
