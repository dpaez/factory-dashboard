import { describe, expect, it } from 'vitest';

import { toBacklogCard } from './backlog';
import type { CommandFailure, CommandPhase } from './commands';
import {
	backlogBlockedIssue,
	backlogIssuePlain,
	backlogUmbrellaIssue,
	problemInsufficientScope,
	problemInternalError,
	problemStartBriefValidation,
	problemStartConflict,
	problemStartRefValidation,
	problemTrackerUnavailable,
	problemUmbrellaIssue
} from './fixtures';
import type { components } from './generated/factory-api';
import {
	START_FAILURES,
	START_REASONS,
	startAvailability,
	startFailureMessage,
	startTargetFor,
	startedTicketKeyVisible,
	visibleBacklog
} from './start';
import { ACTION_REASONS } from './ticket-actions';

type Problem = components['schemas']['Problem'];

const ready = toBacklogCard(backlogIssuePlain);
const umbrella = toBacklogCard(backlogUmbrellaIssue);
const blocked = toBacklogCard(backlogBlockedIssue);
const blockedUmbrella = toBacklogCard({
	...backlogUmbrellaIssue,
	blocked: true,
	blockedBy: backlogBlockedIssue.blockedBy
});

/** A problem as the endpoint relays it to the browser. */
function failureOf(problem: Problem, retryable = false): CommandFailure {
	return {
		type: problem.type,
		title: problem.title,
		...(problem.detail !== undefined && { detail: problem.detail }),
		...(problem.errors && { fieldErrors: problem.errors }),
		retryable
	};
}

describe('startAvailability', () => {
	const idle = { access: 'unknown', phase: 'idle' } as const;

	it('enables Start for a ready backlog issue', () => {
		expect(startAvailability({ card: ready, ...idle })).toEqual({ kind: 'enabled' });
	});

	it('disables Start for an umbrella issue, pointing at its sub-issues', () => {
		expect(startAvailability({ card: umbrella, ...idle })).toEqual({
			kind: 'disabled',
			reason: START_REASONS.umbrella
		});
	});

	it('disables Start for a blocked issue, naming its blockers', () => {
		const result = startAvailability({ card: blocked, ...idle });
		expect(result.kind).toBe('disabled');
		const reason = result.kind === 'disabled' ? result.reason : '';
		for (const blocker of blocked.blockers) expect(reason).toContain(blocker.displayRef);
		expect(reason).toMatch(/^Blocked by .+\. Start it once the blockers? closes?\.$/);
	});

	it('disables Start with the read-only copy when access is read-only', () => {
		expect(startAvailability({ card: ready, access: 'read_only', phase: 'idle' })).toEqual({
			kind: 'disabled',
			reason: ACTION_REASONS.readOnly
		});
	});

	it.each([
		['submitting', 'Starting…'],
		['accepted', 'Start accepted, waiting for the factory.'],
		['unconfirmed', START_REASONS.unconfirmed]
	] as const)('disables Start while the start is %s', (phase, reason) => {
		expect(startAvailability({ card: ready, access: 'unknown', phase })).toEqual({
			kind: 'disabled',
			reason
		});
	});

	it.each(['idle', 'confirmed', 'rejected'] as CommandPhase[])(
		'offers Start again once the start is %s',
		(phase) => {
			expect(startAvailability({ card: ready, access: 'unknown', phase }).kind).toBe('enabled');
		}
	);

	describe('precedence', () => {
		it('read-only beats a pending start and the issue rules', () => {
			for (const card of [ready, umbrella, blocked]) {
				expect(startAvailability({ card, access: 'read_only', phase: 'submitting' })).toEqual({
					kind: 'disabled',
					reason: ACTION_REASONS.readOnly
				});
			}
		});

		it('a pending start beats umbrella and blocked', () => {
			for (const card of [umbrella, blocked]) {
				expect(startAvailability({ card, access: 'unknown', phase: 'accepted' })).toEqual({
					kind: 'disabled',
					reason: START_REASONS.accepted
				});
			}
		});

		it('umbrella beats blocked', () => {
			expect(startAvailability({ card: blockedUmbrella, ...idle })).toEqual({
				kind: 'disabled',
				reason: START_REASONS.umbrella
			});
		});
	});
});

describe('startTargetFor', () => {
	it("targets the issue's display reference", () => {
		expect(startTargetFor(ready)).toBe(`start:ref:${backlogIssuePlain.displayRef}`);
	});
});

describe('startFailureMessage', () => {
	it('places a ref validation error on the reference field', () => {
		const message = startFailureMessage({ failure: failureOf(problemStartRefValidation) }, 'ref');
		expect(message).toMatchObject({
			field: 'ref',
			message: 'Not an issue reference the tracker knows.',
			retryable: false,
			fields: { ref: 'Not an issue reference the tracker knows.' }
		});
	});

	it('places brief validation errors on the ID and text fields', () => {
		const message = startFailureMessage(
			{ failure: failureOf(problemStartBriefValidation) },
			'brief'
		);
		expect(message.field).toBe('id');
		expect(message.fields).toEqual({ id: 'Must not be empty.', text: 'Must not be empty.' });
	});

	it("reads the coordinator's field errors as well as the failure's", () => {
		const message = startFailureMessage(
			{
				failure: failureOf({ ...problemStartBriefValidation, errors: [] }),
				fieldErrors: { text: 'Too long.' }
			},
			'brief'
		);
		expect(message).toMatchObject({
			field: 'text',
			message: 'Too long.',
			fields: { text: 'Too long.' }
		});
	});

	it('falls back to the form when no field of this mode is named', () => {
		const message = startFailureMessage({ failure: failureOf(problemStartRefValidation) }, 'brief');
		expect(message.field).toBeNull();
		expect(message.message).toBe('Invalid request.');
	});

	it.each(['ref', 'brief'] as const)('maps umbrella_issue in %s mode', (mode) => {
		const message = startFailureMessage({ failure: failureOf(problemUmbrellaIssue) }, mode);
		expect(message).toMatchObject({
			field: mode === 'ref' ? 'ref' : null,
			message: 'This is an umbrella issue; start one of its sub-issues.',
			retryable: false
		});
	});

	it.each(['ref', 'brief'] as const)('maps tracker_unavailable in %s mode as retryable', (mode) => {
		const message = startFailureMessage(
			{ failure: failureOf(problemTrackerUnavailable, true) },
			mode
		);
		expect(message).toMatchObject({
			field: mode === 'ref' ? 'ref' : null,
			message: START_FAILURES.tracker,
			retryable: true,
			resend: false
		});
		expect(message.message).toMatch(/tracker could not be reached.*try again/i);
	});

	it('maps invalid_state to a conflict on the reference, never the stale copy', () => {
		const message = startFailureMessage({ failure: failureOf(problemStartConflict) }, 'ref');
		expect(message).toMatchObject({ field: 'ref', message: START_FAILURES.conflictRef });
		expect(message.message).toMatch(/^Conflict/);
		expect(message.message).not.toMatch(/ticket changed/i);
	});

	it('maps invalid_state to a conflict on the ID in brief mode', () => {
		const message = startFailureMessage({ failure: failureOf(problemStartConflict) }, 'brief');
		expect(message).toMatchObject({ field: 'id', message: START_FAILURES.conflictId });
		expect(message.message).not.toMatch(/ticket changed/i);
	});

	it.each(['ref', 'brief'] as const)(
		'maps insufficient_scope to form-level read-only copy (%s)',
		(mode) => {
			expect(
				startFailureMessage({ failure: failureOf(problemInsufficientScope) }, mode)
			).toMatchObject({
				field: null,
				message: ACTION_REASONS.readOnly,
				retryable: false
			});
		}
	);

	it.each(['ref', 'brief'] as const)(
		'maps an unconfirmed start to a form-level resend (%s)',
		(mode) => {
			const byPhase = startFailureMessage(
				{ phase: 'unconfirmed', failure: failureOf(problemInternalError, true) },
				mode
			);
			const byType = startFailureMessage({ failure: failureOf(problemInternalError, true) }, mode);
			for (const message of [byPhase, byType]) {
				expect(message).toMatchObject({
					field: null,
					message: START_FAILURES.unconfirmed,
					retryable: true,
					resend: true
				});
			}
		}
	);

	it('shows any other failure at form level as title and detail', () => {
		const failure: CommandFailure = {
			type: 'unauthorized',
			title: 'Unauthorized',
			detail: 'The token was revoked.',
			retryable: false
		};
		expect(startFailureMessage({ failure }, 'ref')).toMatchObject({
			field: null,
			message: 'Unauthorized. The token was revoked.',
			retryable: false
		});
	});
});

describe('visibleBacklog', () => {
	const cards = [ready, umbrella, blocked];

	it('hides a card whose id is a board ticket id', () => {
		expect(visibleBacklog(cards, { ticketIds: [umbrella.id] })).toEqual([ready, blocked]);
	});

	it('hides a card whose id is hidden, keeping the rest in order', () => {
		expect(visibleBacklog(cards, { ticketIds: ['tkt_01'], hiddenIds: [ready.id] })).toEqual([
			umbrella,
			blocked
		]);
	});

	it('keeps every card when nothing matches', () => {
		expect(visibleBacklog(cards, { ticketIds: new Set(['tkt_01']) })).toEqual(cards);
	});
});

describe('startedTicketKeyVisible', () => {
	const accepted = { ticket: 'fake-started-00000001' };

	it('is true once a read lists the accepted key', () => {
		expect(startedTicketKeyVisible(accepted, ['a', accepted.ticket])).toBe(true);
	});

	it('is false before, and without an accepted start', () => {
		expect(startedTicketKeyVisible(accepted, ['a'])).toBe(false);
		expect(startedTicketKeyVisible(undefined, [accepted.ticket])).toBe(false);
	});
});
