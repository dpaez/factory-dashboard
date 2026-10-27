/*
 * `/v1/stats/export` fixtures: NDJSON ticket lines, then run lines, as
 * factory-skills `exportRoute` writes them. The complete export reconciles
 * with `statsCompleteSummary`: 26 ticket lines, 16 merged, Σ cost $48.20.
 * Each ticket's tokens and cost are the sum of its run lines.
 */
import type { components } from '$lib/factory/generated/factory-api';

import { reviewRounds, tokenCategories } from './stats.ts';

type Schemas = components['schemas'];
type TicketLine = Schemas['StatsExportTicketLine'];
type RunLine = Schemas['StatsExportRunLine'];
type Outcome = TicketLine['outcome'];
type Stage = RunLine['stage'];

const FACTORY_ID = 'factory-geut-01';
const MINUTE = 60_000;
const configuration = 'plan=claude-opus-5-5:high work=claude-opus-5-5:high review=gpt-6:high';

const noInterventions = {
	limitPauses: 0,
	manualCompletes: 0,
	manualRetries: 0,
	questions: 0,
	replies: 0,
	stops: 0
} satisfies Schemas['Interventions'];

/** One run of a ticket, before its tokens and cost are split from the ticket's. */
type RunSpec = {
	stage: Stage;
	purpose?: RunLine['purpose'];
	returnedFrom?: RunLine['returnedFrom'];
	infrastructureLost?: boolean;
	passed?: boolean | null;
	/** Usage was never recorded: 0 tokens, null categories, $0. */
	unknownUsage?: boolean;
};

type TicketSpec = {
	outcome: Outcome;
	costUsd: number;
	/** Minutes from start to handoff; omitted when the execution never reached handoff. */
	toHandoff?: number;
	waitingBefore?: number;
	displayRef?: string;
	/** Runs after the initial ones (plan, work, and for a handoff review and wrapup). */
	extraRuns?: RunSpec[];
};

const MODELS: Record<Stage, { model: string; thinking: string }> = {
	plan: { model: 'claude-opus-5-5', thinking: 'high' },
	work: { model: 'claude-opus-5-5', thinking: 'high' },
	qa: { model: 'claude-opus-5-5', thinking: 'medium' },
	review: { model: 'gpt-6', thinking: 'high' },
	wrapup: { model: 'claude-opus-5-5', thinking: 'low' }
};

/** Split `total` over `weights` in whole units; the last part takes the remainder. */
function split(total: number, weights: number[]): number[] {
	const sum = weights.reduce((a, b) => a + b, 0);
	if (sum === 0) return weights.map(() => 0);
	const parts = weights.map((weight) => Math.floor((total * weight) / sum));
	const last = weights.length - 1;
	parts[last] = (parts[last] ?? 0) + total - parts.reduce((a, b) => a + b, 0);
	return parts;
}

function iso(ms: number): string {
	return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
}

/** Build one execution's ticket line and run lines from a compact spec. */
function exportExecution(
	spec: TicketSpec,
	index: number,
	factoryId: string
): { ticket: TicketLine; runs: RunLine[] } {
	const n = String(index + 1).padStart(2, '0');
	const execution = `e7a0${n}00-0000-4000-8000-0000000000${n}`;
	const startedMs = Date.parse('2026-10-01T09:00:00Z') + index * 6 * 60 * MINUTE;
	const handedOff = spec.toHandoff !== undefined;
	const handoffRuns: RunSpec[] = [
		{ stage: 'review', passed: true },
		{ stage: 'wrapup', passed: true }
	];
	const runSpecs: RunSpec[] = [
		{ stage: 'plan', passed: true },
		{ stage: 'work', passed: handedOff ? true : null },
		...(handedOff ? handoffRuns : []),
		...(spec.extraRuns ?? [])
	];

	const cents = Math.round(spec.costUsd * 100);
	const tokens = cents * 1_000;
	const weights = runSpecs.map((run) => (run.unknownUsage ? 0 : run.stage === 'work' ? 4 : 1));
	const runTokens = split(tokens, weights);
	const runCents = split(cents, weights);
	const rounds = new Map<Stage, number>();

	const runs = runSpecs.map((run, i) => {
		const round = (rounds.get(run.stage) ?? 0) + 1;
		rounds.set(run.stage, round);
		const { model, thinking } = MODELS[run.stage];
		const known = !run.unknownUsage;
		const usage = known ? (runTokens[i] ?? 0) : null;
		return {
			agentMs: known ? 10 * MINUTE : null,
			configuration,
			costUsd: (runCents[i] ?? 0) / 100,
			definitions: 'stats.v1',
			execution,
			factoryId,
			factoryVersion: '0.15.1',
			infrastructureLost: run.infrastructureLost ?? false,
			model,
			passed: run.passed === undefined ? null : run.passed,
			purpose: run.purpose ?? 'initial',
			returnedFrom: run.returnedFrom ?? null,
			round,
			run: `${execution}-run-${String(i + 1).padStart(2, '0')}`,
			setup: `${model}:${thinking}`,
			stage: run.stage,
			task: run.stage === 'plan' || run.stage === 'wrapup' ? null : 'task-01',
			thinking,
			tokens: usage ?? 0,
			...tokenCategories(usage),
			type: 'run'
		} satisfies RunLine;
	});

	const startToHandoffMs = handedOff ? (spec.toHandoff ?? 0) * MINUTE : null;
	const waitingBefore = (spec.waitingBefore ?? 0) * MINUTE;
	const ticket = {
		agentMs: runs.reduce((sum, run) => sum + (run.agentMs ?? 0), 0),
		configuration,
		costUsd: cents / 100,
		definitions: 'stats.v1',
		displayRef: spec.displayRef ?? `dpaez/factory-dashboard#${100 + index}`,
		execution,
		externalReviewRounds: reviewRounds(0, handedOff ? 1 : 0, handedOff ? 1 : 0),
		factoryId,
		factoryMs: startToHandoffMs === null ? null : startToHandoffMs - waitingBefore,
		factoryVersion: '0.15.1',
		followUpCommits: 0,
		handedOffAt: startToHandoffMs === null ? null : iso(startedMs + startToHandoffMs),
		handoffToMergeMs: spec.outcome === 'merged' ? 60 * MINUTE : null,
		interventions: noInterventions,
		key: `dpaez-factory-dashboard-${100 + index}-0a1b2c${n}`,
		leadMs:
			spec.outcome === 'merged' && startToHandoffMs !== null
				? startToHandoffMs + 60 * MINUTE
				: null,
		mergedAt:
			spec.outcome === 'merged' && startToHandoffMs !== null
				? iso(startedMs + startToHandoffMs + 60 * MINUTE)
				: null,
		outcome: spec.outcome,
		overheadMs: null,
		stageMs: {},
		startedAt: iso(startedMs),
		startToHandoffMs,
		tokens,
		...tokenCategories(tokens),
		waitingMs: waitingBefore,
		type: 'ticket'
	} satisfies TicketLine;
	return { ticket, runs };
}

export type StatsExportFixture = { tickets: TicketLine[]; runs: RunLine[] };

/** One execution of a built export: its outcome, cost, timings and extra runs. */
export type StatsExportTicketSpec = TicketSpec;

/** Every ticket line, then every run line, in ticket order. */
export function statsExportOf(specs: TicketSpec[], factoryId = FACTORY_ID): StatsExportFixture {
	const executions = specs.map((spec, index) => exportExecution(spec, index, factoryId));
	return {
		tickets: executions.map((item) => item.ticket),
		runs: executions.flatMap((item) => item.runs)
	};
}

const merged = (costUsd: number, toHandoff: number, extra: Partial<TicketSpec> = {}) =>
	({ outcome: 'merged', costUsd, toHandoff, ...extra }) satisfies TicketSpec;

/**
 * The spec 04 example as an export: 26 executions (16 merged, 2 abandoned,
 * 4 open, 2 cancelled, 2 unknown; 20 reached handoff), $48.20 in total.
 * Rework and infrastructure-lost runs overlap: one return to work was lost.
 */
export const statsExportComplete: StatsExportFixture = statsExportOf([
	merged(1.6, 240, { waitingBefore: 30 }),
	merged(2.2, 300, {
		extraRuns: [{ stage: 'work', purpose: 'validation_correction', passed: true }]
	}),
	merged(1.9, 180),
	merged(2.8, 360, {
		waitingBefore: 60,
		extraRuns: [
			{ stage: 'work', purpose: 'return_to_work', returnedFrom: 'review', passed: true },
			{ stage: 'review', passed: true }
		]
	}),
	merged(3.1, 420, { displayRef: 'jürgen/fábrica#7' }),
	merged(1.4, 120),
	merged(2.5, 300, {
		extraRuns: [
			{
				stage: 'work',
				purpose: 'return_to_work',
				returnedFrom: 'review',
				infrastructureLost: true,
				passed: null
			},
			{ stage: 'work', purpose: 'infrastructure_retry', infrastructureLost: true, passed: true }
		]
	}),
	merged(2.0, 240),
	merged(3.4, 480, { waitingBefore: 45 }),
	merged(1.7, 150, {
		extraRuns: [
			{ stage: 'work', infrastructureLost: true, passed: null, unknownUsage: true },
			{ stage: 'work', purpose: 'infrastructure_retry', infrastructureLost: true, passed: true }
		]
	}),
	merged(2.3, 270),
	merged(2.6, 330),
	merged(1.8, 210, {
		extraRuns: [
			{ stage: 'qa', passed: false },
			{ stage: 'qa', purpose: 'validation_correction', passed: true }
		]
	}),
	merged(2.9, 390, { waitingBefore: 20 }),
	merged(2.1, 240),
	merged(3.0, 360, {
		extraRuns: [{ stage: 'work', purpose: 'return_to_work', returnedFrom: 'qa', passed: true }]
	}),
	{ outcome: 'abandoned', costUsd: 2.4, toHandoff: 300 },
	{ outcome: 'abandoned', costUsd: 1.9, toHandoff: 200 },
	{
		outcome: 'open',
		costUsd: 1.5,
		toHandoff: 180,
		waitingBefore: 90,
		extraRuns: [{ stage: 'work', purpose: 'human_reply', passed: true }]
	},
	{ outcome: 'open', costUsd: 1.2, toHandoff: 150 },
	{ outcome: 'open', costUsd: 0.8 },
	{ outcome: 'open', costUsd: 0.6 },
	{ outcome: 'cancelled', costUsd: 0.9 },
	{ outcome: 'cancelled', costUsd: 0.5 },
	{ outcome: 'unknown', costUsd: 0.6 },
	{ outcome: 'unknown', costUsd: 0.5 }
]);

/** Finished executions, none merged: matches `statsZeroMergesSummary` (6 started, $7.45). */
export const statsExportZeroMerges: StatsExportFixture = statsExportOf([
	{ outcome: 'abandoned', costUsd: 2.1, toHandoff: 240 },
	{
		outcome: 'abandoned',
		costUsd: 1.95,
		toHandoff: 300,
		extraRuns: [{ stage: 'work', purpose: 'return_to_work', returnedFrom: 'review', passed: true }]
	},
	{ outcome: 'cancelled', costUsd: 0.9 },
	{ outcome: 'open', costUsd: 1.1 },
	{ outcome: 'open', costUsd: 0.8 },
	{ outcome: 'open', costUsd: 0.6 }
]);

/** No execution started in the window: an empty body. */
export const statsExportEmpty: StatsExportFixture = { tickets: [], runs: [] };

/** NDJSON text: one JSON line per item, each followed by `\n`. */
export function toNdjson(lines: ReadonlyArray<unknown>): string {
	return lines.map((line) => `${JSON.stringify(line)}\n`).join('');
}

/** An export's NDJSON body: ticket lines, then run lines. */
export function statsExportText(fixture: StatsExportFixture): string {
	return toNdjson([...fixture.tickets, ...fixture.runs]);
}

export const statsExportCompleteText = statsExportText(statsExportComplete);

/**
 * The complete export with two bad lines after the first ticket line (line 2
 * is not JSON, line 3 has an unknown `type`): 2 diagnostics, the rest parses.
 */
export const statsExportMalformedText = (() => {
	const [first, ...rest] = [...statsExportComplete.tickets, ...statsExportComplete.runs];
	return (
		toNdjson([first]) +
		'{"type":"ticket",\n' +
		toNdjson([{ type: 'stage', execution: 'x' }, ...rest])
	);
})();

/** The complete export cut in the middle of its last run line: truncated. */
export const statsExportTruncatedText = statsExportCompleteText.slice(
	0,
	statsExportCompleteText.length - 40
);
