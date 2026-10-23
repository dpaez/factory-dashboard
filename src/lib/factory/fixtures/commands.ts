/* `CommandAccepted` bodies as the factory answers a 202. Browser-safe. */
import type { components } from '$lib/factory/generated/factory-api';

import { runWorkValidationFailed } from './runs.ts';
import { ticketActiveInPlan, ticketActiveInWork } from './tickets.ts';

type Schemas = components['schemas'];

/** A ticket started from the backlog. */
export const acceptedStart = {
	message: 'Started the ticket.',
	revision: 41,
	ticket: ticketActiveInPlan.key
} satisfies Schemas['CommandAccepted'];

/** A retry of the failed step. */
export const acceptedRetry = {
	message: 'Retrying the work step.',
	revision: 42,
	ticket: ticketActiveInWork.key
} satisfies Schemas['CommandAccepted'];

/** A running agent stopped; the ticket comes from the run. */
export const acceptedStop = {
	message: `Stopped run ${runWorkValidationFailed.id}.`,
	revision: 43,
	ticket: runWorkValidationFailed.ticket
} satisfies Schemas['CommandAccepted'];
