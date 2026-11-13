import { describe, expect, it } from 'vitest';

import {
	pendingFeedback,
	pendingFeedbackMany,
	pendingFeedbackSkippedTruncated
} from './fixtures/feedback';
import type { FeedbackCandidate } from './feedback';
import {
	FEEDBACK_PAGE_SIZE,
	allRefs,
	feedbackItemKindLabel,
	feedbackPage,
	feedbackRoundAvailability,
	pendingFeedbackReadable,
	pickedFeedback,
	sameCandidates,
	skippedLine,
	startLabel
} from './feedback-rounds';
import type { CommandAccess, CommandPhase } from './commands';
import type { PullRequest, TicketDetailView } from './models';
import { ACTION_REASONS } from './ticket-actions';

const few = pendingFeedback.candidates as FeedbackCandidate[];
const many = pendingFeedbackMany.candidates as FeedbackCandidate[];

describe('pickedFeedback', () => {
	it('posts no only when every comment is ticked', () => {
		expect(pickedFeedback({ candidates: few, ticked: allRefs(few), note: '' })).toEqual({});
	});

	it('posts the ticked refs in list order when some are unticked', () => {
		const ticked = [few[2]!.ref, few[0]!.ref];
		expect(pickedFeedback({ candidates: few, ticked, note: '' })).toEqual({
			only: [few[0]!.ref, few[2]!.ref]
		});
	});

	it('adds the trimmed note, and drops a blank one', () => {
		expect(
			pickedFeedback({ candidates: few, ticked: allRefs(few), note: '  Look again. ' })
		).toEqual({ note: 'Look again.' });
		expect(pickedFeedback({ candidates: few, ticked: [few[1]!.ref], note: 'x' })).toEqual({
			only: [few[1]!.ref],
			note: 'x'
		});
		expect(pickedFeedback({ candidates: few, ticked: allRefs(few), note: ' \n ' })).toEqual({});
	});

	it('starts nothing with no comment ticked, even with a note', () => {
		expect(pickedFeedback({ candidates: few, ticked: [], note: '' })).toBeNull();
		expect(pickedFeedback({ candidates: few, ticked: [], note: 'note' })).toBeNull();
	});

	it('with nothing pending, starts only from a note', () => {
		expect(pickedFeedback({ candidates: [], ticked: [], note: '' })).toBeNull();
		expect(pickedFeedback({ candidates: [], ticked: [], note: ' Rename it. ' })).toEqual({
			note: 'Rename it.'
		});
	});

	it('ignores ticked refs no longer listed', () => {
		expect(pickedFeedback({ candidates: few, ticked: ['r0', few[0]!.ref], note: '' })).toEqual({
			only: [few[0]!.ref]
		});
	});
});

describe('startLabel', () => {
	it('counts the ticked comments', () => {
		expect(startLabel(30, 30)).toBe('Start round with 30 comments');
		expect(startLabel(3, 1)).toBe('Start round with 1 comment');
		expect(startLabel(3, 0)).toBe('Start round with 0 comments');
	});

	it('names the note when nothing is pending, and stays plain while unread', () => {
		expect(startLabel(0, 0)).toBe('Start round with the note');
		expect(startLabel(null, 0)).toBe('Start round');
	});
});

describe('feedbackPage', () => {
	it('shows 5 per page: 30 comments make 6 pages', () => {
		expect(FEEDBACK_PAGE_SIZE).toBe(5);
		const first = feedbackPage(many, 0);
		expect(first).toMatchObject({ page: 0, pages: 6, position: '1–5 of 30' });
		expect(first.items.map((c) => c.ref)).toEqual(many.slice(0, 5).map((c) => c.ref));
		const last = feedbackPage(many, 5);
		expect(last).toMatchObject({ page: 5, position: '26–30 of 30' });
		expect(last.items).toHaveLength(5);
	});

	it('clamps the page to the pages there are', () => {
		expect(feedbackPage(many, 9).page).toBe(5);
		expect(feedbackPage(many, -1).page).toBe(0);
		expect(feedbackPage(few, 3)).toMatchObject({ page: 0, pages: 1, position: '1–3 of 3' });
	});

	it('has one empty page with nothing pending', () => {
		expect(feedbackPage([], 0)).toEqual({ page: 0, pages: 1, items: [], position: '' });
	});
});

describe('skippedLine', () => {
	it('names the skipped authors and the truncation', () => {
		expect(
			skippedLine(
				pendingFeedbackSkippedTruncated.skipped,
				pendingFeedbackSkippedTruncated.truncated
			)
		).toBe(
			'2 skipped: drive-by-user, someone-else (not collaborators or codeHost.feedback.authors) · only the newest 100 of each list were read'
		);
	});

	it('names an author once, and stands alone without truncation', () => {
		const one = pendingFeedbackSkippedTruncated.skipped[0]!;
		expect(skippedLine([one, { ...one, id: '2' }], false)).toBe(
			'2 skipped: drive-by-user (not collaborators or codeHost.feedback.authors)'
		);
	});

	it('says only the truncation, or nothing', () => {
		expect(skippedLine([], true)).toBe('Only the newest 100 of each list were read');
		expect(skippedLine([], false)).toBeNull();
	});
});

describe('sameCandidates', () => {
	it('compares the refs in order', () => {
		expect(sameCandidates(few, [...few])).toBe(true);
		expect(sameCandidates(few, few.slice(1))).toBe(false);
		expect(sameCandidates(few, [...few].reverse())).toBe(false);
	});
});

function pullRequest(state: PullRequest['state']): PullRequest {
	return {
		number: 42,
		state,
		url: 'https://github.com/dpaez/factory-dashboard/pull/42',
		mergedAt: state === 'merged' ? '2026-10-23T00:00:00Z' : null
	};
}

function header(
	status: string,
	stage: string,
	pr: PullRequest | null = pullRequest('open')
): TicketDetailView['header'] {
	return {
		key: 'dpaez-factory-dashboard-29-b8d88146',
		displayRef: 'dpaez/factory-dashboard#29',
		sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/29',
		source: { ref: 'dpaez/factory-dashboard#29', href: null },
		title: 'Ticket commands',
		stage,
		status,
		statusReason: null,
		needsUser: false,
		execution: 1,
		current: true,
		pullRequest: pr,
		trackerWarnings: [],
		progress: { done: 0, total: 1, current: null },
		currentTask: null,
		feedbackRound: null,
		updatedAt: '2026-10-23T00:00:00Z'
	};
}

const availability = (
	h: TicketDetailView['header'],
	access: CommandAccess = 'unknown',
	phase: CommandPhase = 'idle'
) => feedbackRoundAvailability({ header: h, access, phase });

describe('feedbackRoundAvailability', () => {
	it('is enabled at ready_for_handoff with an open pull request', () => {
		expect(availability(header('ready_for_handoff', 'wrapup'))).toEqual({ kind: 'enabled' });
	});

	it.each([
		['merged', ACTION_REASONS.pullRequestMerged],
		['closed', ACTION_REASONS.pullRequestClosed]
	] as const)('is disabled with a %s pull request, naming its state', (state, reason) => {
		expect(availability(header('ready_for_handoff', 'wrapup', pullRequest(state)))).toEqual({
			kind: 'disabled',
			reason
		});
		expect(availability(header('complete', 'done', pullRequest(state)))).toEqual({
			kind: 'disabled',
			reason
		});
	});

	it('is disabled at ready_for_handoff without a pull request', () => {
		expect(availability(header('ready_for_handoff', 'wrapup', null))).toEqual({
			kind: 'disabled',
			reason: ACTION_REASONS.noPullRequest
		});
	});

	it('is disabled in wrapup while the handoff is still being prepared', () => {
		expect(availability(header('active', 'wrapup'))).toEqual({
			kind: 'disabled',
			reason: ACTION_REASONS.preparingHandoff
		});
	});

	it.each([
		['queued', 'plan'],
		['active', 'work'],
		['waiting_for_user', 'review'],
		['paused', 'work'],
		['failed', 'work'],
		['cancelled', 'work']
	])('is disabled at %s (stage %s), even with an open pull request', (status, stage) => {
		expect(availability(header(status, stage))).toEqual({
			kind: 'disabled',
			reason: ACTION_REASONS.notAtHandoff
		});
	});

	it('is disabled with the access reason for a read-only token', () => {
		expect(availability(header('ready_for_handoff', 'wrapup'), 'read_only')).toEqual({
			kind: 'disabled',
			reason: ACTION_REASONS.readOnly
		});
	});

	it.each([
		['submitting', ACTION_REASONS.sending],
		['accepted', ACTION_REASONS.accepted]
	] as const)('a %s round disables it with the pending reason', (phase, reason) => {
		expect(availability(header('ready_for_handoff', 'wrapup'), 'unknown', phase)).toEqual({
			kind: 'disabled',
			reason
		});
	});

	it.each(['rejected', 'unconfirmed', 'confirmed'] as const)(
		'a %s round leaves it enabled',
		(phase) => {
			expect(availability(header('ready_for_handoff', 'wrapup'), 'unknown', phase)).toEqual({
				kind: 'enabled'
			});
		}
	);
});

describe('pendingFeedbackReadable', () => {
	it('reads the list only at ready_for_handoff with an open pull request', () => {
		expect(pendingFeedbackReadable(header('ready_for_handoff', 'wrapup'))).toBe(true);
		expect(
			pendingFeedbackReadable(header('ready_for_handoff', 'wrapup', pullRequest('merged')))
		).toBe(false);
		expect(
			pendingFeedbackReadable(header('ready_for_handoff', 'wrapup', pullRequest('closed')))
		).toBe(false);
		expect(pendingFeedbackReadable(header('ready_for_handoff', 'wrapup', null))).toBe(false);
		expect(pendingFeedbackReadable(header('active', 'wrapup'))).toBe(false);
		expect(pendingFeedbackReadable(header('active', 'work'))).toBe(false);
	});
});

describe('feedbackItemKindLabel', () => {
	it("labels an earlier round's items, the note as the operator's", () => {
		expect(feedbackItemKindLabel('thread')).toBe('Review thread');
		expect(feedbackItemKindLabel('note')).toBe("Operator's note");
		expect(feedbackItemKindLabel('reaction')).toBe('reaction');
	});
});
