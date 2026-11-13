/*
 * Pending pull request feedback (`GET /v1/tickets/{key}/feedback`), as the
 * factory lists it for a round's picker. Refs follow the factory: `r<id>` for
 * a review thread, `p<id>` for a review, `c<id>` for a pull request comment.
 */
import type { components } from '$lib/factory/generated/factory-api';

type Schemas = components['schemas'];

const ticket = 'dpaez-factory-dashboard-14-1e2f3a4b';
const pullRequestUrl = 'https://github.com/dpaez/factory-dashboard/pull/42';

/** One candidate of each kind: a review thread (with its location), a review and a comment. */
export const pendingFeedback = {
	candidates: [
		{
			author: 'coderabbitai',
			kind: 'thread',
			location: 'src/lib/factory/ticket-actions.ts:42',
			ref: 'r2841017733',
			summary: 'Consider guarding the action when the pull request is closed.',
			url: `${pullRequestUrl}#discussion_r2841017733`
		},
		{
			author: 'kai',
			kind: 'review',
			location: null,
			ref: 'p3301245',
			summary: 'The type scale reads well; please add the 2xs step.',
			url: `${pullRequestUrl}#pullrequestreview-3301245`
		},
		{
			author: 'dpaez',
			kind: 'comment',
			location: null,
			ref: 'c6799058255',
			summary: 'Make the feedback round button disabled outside handoff.',
			url: `${pullRequestUrl}#issuecomment-6799058255`
		}
	],
	pullRequestUrl,
	skipped: [],
	ticket,
	truncated: false
} satisfies Schemas['PendingFeedback'];

/** Thirty review threads, as a review bot leaves one per finding. */
export const pendingFeedbackMany = {
	...pendingFeedback,
	candidates: Array.from({ length: 30 }, (_, index) => {
		const id = `28410180${String(index).padStart(2, '0')}`;
		return {
			author: 'coderabbitai',
			kind: 'thread' as const,
			location: `src/lib/factory/board.ts:${20 + index * 7}`,
			ref: `r${id}`,
			summary: `Nitpick ${index + 1}: prefer a named helper over the inline expression here.`,
			url: `${pullRequestUrl}#discussion_r${id}`
		};
	})
} satisfies Schemas['PendingFeedback'];

/** A comment GitHub gave no link for (`url` null), beside linked ones. */
export const pendingFeedbackNoUrl = {
	...pendingFeedback,
	candidates: pendingFeedback.candidates.map((candidate) =>
		candidate.kind === 'review' ? { ...candidate, url: null } : candidate
	)
} satisfies Schemas['PendingFeedback'];

/** Every comment already taken or dismissed by a round. */
export const pendingFeedbackNone = {
	...pendingFeedback,
	candidates: []
} satisfies Schemas['PendingFeedback'];

/** Comments from authors outside the collaborators, and more than one GitHub page. */
export const pendingFeedbackSkippedTruncated = {
	...pendingFeedback,
	skipped: [
		{
			author: 'drive-by-user',
			id: '6800112233',
			kind: 'comment',
			url: `${pullRequestUrl}#issuecomment-6800112233`
		},
		{
			author: 'someone-else',
			id: '3309999',
			kind: 'review',
			url: null
		}
	],
	truncated: true
} satisfies Schemas['PendingFeedback'];
