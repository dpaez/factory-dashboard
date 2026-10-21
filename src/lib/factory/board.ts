/**
 * The Flow board projection: open tickets, agents and per-ticket details in,
 * ordered lanes, cards and a summary out. Pure and browser-safe: type imports
 * only, no `$lib/server`, no `$env`.
 *
 * - Completed and cancelled executions, and the `done` stage, leave the board.
 * - Status never moves a card: a paused work ticket stays in Work.
 * - Cards are ordered by ticket key. The API has no stage-entry time, and
 *   `updatedAt` would reorder cards on every update.
 * - A measurement that was not read is `null`, never `0`.
 */
import type { components } from '$lib/factory/generated/factory-api';

import type { ExecutionStatus, Stage, TicketKey, TicketProgress } from './models';
import { executionStatusSignal, handoffStatusSignal, type StatusSignal } from './status';

type Schemas = components['schemas'];

export type BoardLaneId = 'plan' | 'work' | 'qa' | 'review' | 'handoff' | 'other';

/** Known stages, in lane order, with the lane each one maps to. */
const STAGE_LANES = [
	{ stage: 'plan', id: 'plan', label: 'Plan' },
	{ stage: 'work', id: 'work', label: 'Work' },
	{ stage: 'qa', id: 'qa', label: 'QA' },
	{ stage: 'review', id: 'review', label: 'Review' },
	{ stage: 'wrapup', id: 'handoff', label: 'Handoff' }
] as const satisfies readonly { stage: Stage; id: BoardLaneId; label: string }[];

const OTHER_LANE = { id: 'other', label: 'Other' } as const;

const OFF_BOARD_STATUSES: readonly string[] = ['complete', 'cancelled'];
const OFF_BOARD_STAGES: readonly string[] = ['done'];

export type BoardCard = {
	key: TicketKey;
	displayRef: string;
	title: string;
	/** The lane label for a known stage, or the raw stage string for an unknown one. */
	stage: string;
	rawStage: Stage;
	status: ExecutionStatus;
	/** From `status.ts`; Handoff cards use the handoff mapping. */
	badge: StatusSignal;
	needsUser: boolean;
	/** The task in work or review; null when none. */
	currentTask: string | null;
	/** `total === 0` means the execution has no tasks yet; never a percentage. */
	progress: TicketProgress;
	updatedAt: string;
	/** The current execution's input/output tokens; null when its detail was not read. USD cost stays on the ticket page. */
	tokens: BoardTokens | null;
};

export type BoardTokens = { input: number; output: number };

export type BoardLane = {
	id: BoardLaneId;
	label: string;
	/** True for QA when no visible ticket shows QA activity. Never claims QA is disabled. */
	optional: boolean;
	cards: BoardCard[];
};

export type BoardSummary = {
	/** The number of board cards. */
	inProgress: number;
	/** False when the ticket list was cut at the pager bound; `inProgress` is then a lower bound. */
	inProgressComplete: boolean;
	/** Null when the agents read failed. */
	agentsRunning: number | null;
	/**
	 * Backlog issues that are neither blocked nor umbrella. Null while the
	 * backlog has not loaded or its latest read failed. `toBoard` never reads
	 * the backlog, so it is always null there; the page merges the count in.
	 */
	readyToStart: number | null;
	/** False when the backlog pager stopped at its bound; `readyToStart` is then a lower bound. */
	readyToStartComplete: boolean;
};

export type Board = {
	lanes: BoardLane[];
	summary: BoardSummary;
};

export type BoardInput = {
	/** Open tickets, as the pager returned them. */
	tickets: Schemas['TicketSummary'][];
	/** False when the pager stopped at its bound. */
	complete: boolean;
	/** Null when the agents read failed. */
	agents: Schemas['AgentList'] | null;
	/** One read per ticket; a failed read is `null` and affects only its card. */
	details: (Schemas['TicketDetail'] | null)[];
};

function isOnBoard(ticket: Schemas['TicketSummary']): boolean {
	return !OFF_BOARD_STATUSES.includes(ticket.status) && !OFF_BOARD_STAGES.includes(ticket.stage);
}

function laneOf(stage: string): (typeof STAGE_LANES)[number] | undefined {
	return STAGE_LANES.find((lane) => lane.stage === stage);
}

function byKey(a: BoardCard, b: BoardCard): number {
	return a.key.localeCompare(b.key);
}

function hasQaSummary(detail: Schemas['TicketDetail']): boolean {
	return detail.tasks.some((task) => Object.hasOwn(task.summaries, 'qa'));
}

function toCard(ticket: Schemas['TicketSummary'], usage: Schemas['Usage'] | null): BoardCard {
	const lane = laneOf(ticket.stage);
	const current = ticket.progress.current?.label ?? null;
	return {
		key: ticket.key,
		displayRef: ticket.displayRef,
		title: ticket.title,
		stage: lane?.label ?? ticket.stage,
		rawStage: ticket.stage,
		status: ticket.status,
		badge:
			lane?.id === 'handoff'
				? handoffStatusSignal(ticket.status)
				: executionStatusSignal(ticket.status),
		needsUser: ticket.needsUser,
		currentTask: current,
		progress: { done: ticket.progress.done, total: ticket.progress.total, current },
		updatedAt: ticket.updatedAt,
		tokens: usage === null ? null : { input: usage.tokensInput, output: usage.tokensOutput }
	};
}

export function toBoard(input: BoardInput): Board {
	const { complete, agents } = input;
	const tickets = input.tickets.filter(isOnBoard);
	const visibleKeys = new Set(tickets.map((ticket) => ticket.key));

	const detailByKey = new Map<string, Schemas['TicketDetail']>();
	for (const detail of input.details) {
		if (detail !== null && visibleKeys.has(detail.key)) detailByKey.set(detail.key, detail);
	}

	const cardsByLane = new Map<BoardLaneId, BoardCard[]>();
	for (const ticket of tickets) {
		const id = laneOf(ticket.stage)?.id ?? OTHER_LANE.id;
		const card = toCard(ticket, detailByKey.get(ticket.key)?.usage ?? null);
		cardsByLane.set(id, [...(cardsByLane.get(id) ?? []), card]);
	}

	const qaActive =
		tickets.some((ticket) => ticket.stage === 'qa') || [...detailByKey.values()].some(hasQaSummary);

	const lanes: BoardLane[] = STAGE_LANES.map(({ id, label }) => ({
		id,
		label,
		optional: id === 'qa' && !qaActive,
		cards: (cardsByLane.get(id) ?? []).sort(byKey)
	}));
	const other = cardsByLane.get(OTHER_LANE.id);
	if (other) lanes.push({ ...OTHER_LANE, optional: false, cards: other.sort(byKey) });

	return {
		lanes,
		summary: {
			inProgress: tickets.length,
			inProgressComplete: complete,
			agentsRunning: agents === null ? null : agents.items.length,
			readyToStart: null,
			readyToStartComplete: true
		}
	};
}
