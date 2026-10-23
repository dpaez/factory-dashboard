/*
 * Event stream fixtures: `EventPayload`s the factory sends on `/v1/events`,
 * and a helper that renders one into the factory's frame format. Browser-safe.
 */
import type { components } from '$lib/factory/generated/factory-api';

import { runWorkValidationFailed } from './runs.ts';
import { ticketActiveInPlan, ticketActiveInWork } from './tickets.ts';

type Schemas = components['schemas'];

/** A ticket was started from Pi: the backlog and the board change. */
export const eventStart = {
	actor: { client: 'pi', onBehalfOf: 'Diego' },
	card: null,
	run: null,
	task: null,
	ticket: ticketActiveInPlan.key
} satisfies Schemas['EventPayload'];

/** A runtime finished one run. */
export const eventRuntimeTerminal = {
	actor: null,
	card: null,
	run: runWorkValidationFailed.id,
	task: '01',
	ticket: ticketActiveInWork.key
} satisfies Schemas['EventPayload'];

/** A task's validation finished. */
export const eventValidationFinished = {
	actor: null,
	card: null,
	run: null,
	task: '02',
	ticket: ticketActiveInWork.key
} satisfies Schemas['EventPayload'];

/** The controller posted a status card, with non-ASCII text. */
export const eventCard = {
	actor: null,
	card: 'Work → review: 3 tasks ready ✓ (ünïcödé, 日本語)',
	run: null,
	task: null,
	ticket: ticketActiveInWork.key
} satisfies Schemas['EventPayload'];

/** An event about no ticket. */
export const eventNoTicket = {
	actor: { client: 'dashboard', onBehalfOf: null },
	card: null,
	run: null,
	task: null,
	ticket: null
} satisfies Schemas['EventPayload'];

/** One event as the factory frames it: `id`, `event`, and the payload as `data`. */
export function eventFrame(revision: number, kind: string, payload: Schemas['EventPayload']) {
	return `id: ${revision}\nevent: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`;
}
