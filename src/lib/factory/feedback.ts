/*
 * A ticket's pending pull request feedback, as the Feedback rounds box reads
 * it from `GET /api/factory/tickets/<key>/feedback`.
 */
import type { components } from '$lib/factory/generated/factory-api';

type Schemas = components['schemas'];

/** One comment no round took or dismissed: what `only` names it by, and what to show. */
export type FeedbackCandidate = Schemas['FeedbackCandidate'];

/** The factory's pending feedback for one ticket's open pull request. */
export type PendingFeedback = Schemas['PendingFeedback'];

/** A failure that is safe to send to the browser: no token, URL or upstream body. */
export type PendingFeedbackFailure = {
	type: string;
	title: string;
	detail?: string;
	retryable: boolean;
};

/**
 * One pending-feedback read, as `GET /api/factory/tickets/<key>/feedback`
 * answers it. Never carries the token, the factory URL or an upstream body.
 */
export type PendingFeedbackResult =
	({ ok: true } & PendingFeedback) | { ok: false; failure: PendingFeedbackFailure };
