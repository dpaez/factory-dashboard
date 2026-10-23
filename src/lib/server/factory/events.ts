/**
 * The event stream behind `/api/factory/events`: opens `GET /v1/events` with
 * the bearer and returns its body as an unbuffered byte stream, or a safe
 * failure. The upstream request is aborted when `signal` aborts or the
 * returned stream is cancelled.
 */
import type { EventStreamFailure } from '$lib/factory/events';

import { factoryClientFromEnv, type FactoryClientOptions } from './client';
import { normalizeFactoryFailure, type FactoryApiFailure } from './errors';

export type EventStreamOpen =
	| { ok: true; stream: ReadableStream<Uint8Array> }
	| { ok: false; status: number; result: EventStreamFailure };

export type EventStreamCursor = { lastEventId?: number; since?: number };

function failed(failure: FactoryApiFailure): EventStreamOpen {
	return {
		ok: false,
		status: failure.status,
		result: {
			ok: false,
			failure: {
				type: failure.type,
				title: failure.title,
				...(failure.detail !== undefined && { detail: failure.detail }),
				retryable: failure.retryable
			}
		}
	};
}

/**
 * Pass the upstream body through chunk by chunk. Cancelling the result, or the
 * client going away, aborts the upstream request.
 */
function passThrough(
	body: ReadableStream<Uint8Array>,
	abort: AbortController
): ReadableStream<Uint8Array> {
	const reader = body.getReader();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			// Aborted (client gone): end the stream now, whatever the upstream body does.
			abort.signal.addEventListener(
				'abort',
				() => {
					reader.cancel().catch(() => {});
					try {
						controller.close();
					} catch {
						// Already closed or cancelled.
					}
				},
				{ once: true }
			);
		},
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (abort.signal.aborted) return;
				if (done) controller.close();
				else controller.enqueue(value);
			} catch {
				// Aborted or dropped upstream: the browser sees the stream fail and reconnects.
				if (!abort.signal.aborted) controller.error(new Error('The factory event stream failed.'));
			}
		},
		cancel() {
			abort.abort();
		}
	});
}

/** Open the factory event stream. Never throws or rejects. */
export async function openEventStream(
	fetch: FactoryClientOptions['fetch'],
	cursor: EventStreamCursor,
	signal: AbortSignal
): Promise<EventStreamOpen> {
	const abort = new AbortController();
	const onAbort = () => abort.abort();
	if (signal.aborted) abort.abort();
	else signal.addEventListener('abort', onAbort, { once: true });
	abort.signal.addEventListener('abort', () => signal.removeEventListener('abort', onAbort), {
		once: true
	});

	try {
		const client = factoryClientFromEnv(fetch);
		const result = await client.GET('/v1/events', {
			params: {
				header:
					cursor.lastEventId === undefined ? undefined : { 'last-event-id': cursor.lastEventId },
				query: cursor.since === undefined ? undefined : { since: cursor.since }
			},
			headers: { accept: 'text/event-stream' },
			parseAs: 'stream',
			signal: abort.signal
		});
		const body = result.data as ReadableStream<Uint8Array> | null | undefined;
		// Only the documented 200 is a stream; any other status, 2xx included, is a failure.
		if (result.response.status === 200 && body) {
			return { ok: true, stream: passThrough(body, abort) };
		}
		abort.abort();
		return failed(normalizeFactoryFailure({ error: result.error, response: result.response }));
	} catch (cause) {
		abort.abort();
		return failed(normalizeFactoryFailure(cause));
	}
}
