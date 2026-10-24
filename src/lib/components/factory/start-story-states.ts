/**
 * Start command states for the BacklogCard and IssuePreview stories, built
 * from the backlog and problem fixtures through the real start rules.
 */
import type { BacklogCardModel } from '$lib/factory/backlog';
import type { CommandFailure, CommandPhase } from '$lib/factory/commands';
import {
	problemStartConflict,
	problemTrackerUnavailable,
	problemUmbrellaIssue
} from '$lib/factory/fixtures';
import type { components } from '$lib/factory/generated/factory-api';
import { startAvailability, startFailureMessage } from '$lib/factory/start';
import type { StartState } from './start-control.svelte';

type Problem = components['schemas']['Problem'];

/** A problem as the command endpoint relays it to the browser. */
function failureOf(problem: Problem, retryable = false): CommandFailure {
	return {
		type: problem.type,
		title: problem.title,
		...(problem.detail !== undefined && { detail: problem.detail }),
		retryable
	};
}

/** The Start props for `card` in `phase`, with the failure's message when it has one. */
export function startState(
	card: BacklogCardModel,
	{
		phase = 'idle',
		problem,
		retryable = false,
		readOnly = false
	}: { phase?: CommandPhase; problem?: Problem; retryable?: boolean; readOnly?: boolean } = {}
): StartState {
	const failed = phase === 'rejected' || phase === 'unconfirmed';
	return {
		start: startAvailability({ card, access: readOnly ? 'read_only' : 'unknown', phase }),
		phase,
		explanation: failed
			? startFailureMessage(
					{ phase, failure: problem ? failureOf(problem, retryable) : undefined },
					'ref'
				).message
			: null
	};
}

export const START_PROBLEMS = {
	umbrella: problemUmbrellaIssue,
	tracker: problemTrackerUnavailable,
	conflict: problemStartConflict
} as const;
