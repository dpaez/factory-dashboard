import { json } from '@sveltejs/kit';

import { parseRevision, type EventStreamFailure } from '$lib/factory/events';
import { openEventStream, type EventStreamCursor } from '$lib/server/factory/events';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'no-store' };

/** Response headers set fresh; nothing is copied from upstream. */
const STREAM_HEADERS = {
	'content-type': 'text/event-stream; charset=utf-8',
	'cache-control': 'no-store',
	'x-accel-buffering': 'no'
};

function invalid(name: string): Response {
	const body: EventStreamFailure = {
		ok: false,
		failure: {
			type: 'invalid',
			title: `Invalid ${name}`,
			detail: `${name} must be a non-negative whole number.`,
			retryable: false
		}
	};
	return json(body, { status: 400, headers: NO_STORE });
}

/**
 * The browser's view of the factory event stream (`GET /v1/events`): the
 * upstream body passed through unbuffered, with the bearer added server-side.
 * `Last-Event-ID` and `?since` are forwarded. A client disconnect aborts the
 * upstream request. A failure is a safe `EventStreamFailure` with the
 * normalized status. Read-only: GET is the only verb (ADR 0005).
 */
export const GET: RequestHandler = async ({ fetch, request, url }) => {
	const cursor: EventStreamCursor = {};
	const lastEventId = request.headers.get('last-event-id');
	if (lastEventId !== null) {
		const parsed = parseRevision(lastEventId);
		if (!parsed.ok) return invalid('Last-Event-ID');
		cursor.lastEventId = parsed.value;
	}
	const since = url.searchParams.get('since');
	if (since !== null) {
		const parsed = parseRevision(since);
		if (!parsed.ok) return invalid('since');
		cursor.since = parsed.value;
	}

	const opened = await openEventStream(fetch, cursor, request.signal);
	if (!opened.ok) return json(opened.result, { status: opened.status, headers: NO_STORE });
	return new Response(opened.stream, { status: 200, headers: STREAM_HEADERS });
};
