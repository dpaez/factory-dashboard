/**
 * `GET /v1/stats/export` read as a bounded NDJSON stream. Only a 200 with a
 * body is a stream; any other answer is a normalized failure. A failure once
 * the body is flowing (read error, abort, a line or byte bound) is not a
 * throw: it yields what was read so far, marked not complete.
 */
import { createStatsExportParser, type StatsExportParse } from '$lib/factory/stats-export';

import type { FactoryClient } from './client';
import { normalizeFactoryFailure, type FactoryApiFailure } from './errors';
import type { FactoryResult, StatsExportParams } from './reads';

/** Generous bounds: past them the figures are Unavailable, not wrong. */
export const STATS_EXPORT_MAX_LINES = 200_000;
export const STATS_EXPORT_MAX_BYTES = 64 * 1024 * 1024;

export type StatsExportRead =
	({ ok: true } & StatsExportParse) | Extract<FactoryResult<never>, { ok: false }>;

export type StatsExportOptions = {
	signal?: AbortSignal;
	maxLines?: number;
	maxBytes?: number;
};

/** A failure without the upstream Problem `detail`, so no caller can expose it. */
function failed(input: unknown): Extract<StatsExportRead, { ok: false }> {
	const { detail: _detail, ...failure }: FactoryApiFailure = normalizeFactoryFailure(input);
	return { ok: false, failure };
}

/** Read the export for one cohort window. Never throws or rejects. */
export async function readStatsExport(
	client: FactoryClient,
	query: StatsExportParams,
	options: StatsExportOptions = {}
): Promise<StatsExportRead> {
	const maxBytes = options.maxBytes ?? STATS_EXPORT_MAX_BYTES;
	let body: ReadableStream<Uint8Array>;
	try {
		const result = await client.GET('/v1/stats/export', {
			params: { query },
			parseAs: 'stream',
			signal: options.signal
		});
		const stream = result.data as ReadableStream<Uint8Array> | null | undefined;
		// Only the documented 200 is a stream; any other status, 2xx included, is a failure.
		if (result.response.status !== 200 || !stream) {
			await stream?.cancel().catch(() => {});
			return failed({ error: result.error, response: result.response });
		}
		body = stream;
	} catch (thrown) {
		return failed(thrown);
	}

	const parser = createStatsExportParser({
		maxLines: options.maxLines ?? STATS_EXPORT_MAX_LINES
	});
	const decoder = new TextDecoder('utf-8');
	const reader = body.getReader();
	const signal = options.signal;
	// Whatever the transport does with the body, an abort ends the read now.
	const onAbort = () => void reader.cancel().catch(() => {});
	signal?.addEventListener('abort', onAbort, { once: true });
	let bytes = 0;
	try {
		if (signal?.aborted) return { ok: true, ...parser.fail('read aborted') };
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > maxBytes) {
				await reader.cancel().catch(() => {});
				return { ok: true, ...parser.fail('byte limit reached') };
			}
			if (!parser.push(decoder.decode(value, { stream: true }))) {
				await reader.cancel().catch(() => {});
				return { ok: true, ...parser.end() };
			}
		}
		// A cancelled read ends like a clean one: only the signal tells them apart.
		if (signal?.aborted) return { ok: true, ...parser.fail('read aborted') };
	} catch {
		await reader.cancel().catch(() => {});
		return { ok: true, ...parser.fail(signal?.aborted ? 'read aborted' : 'read failed') };
	} finally {
		signal?.removeEventListener('abort', onAbort);
	}
	parser.push(decoder.decode());
	return { ok: true, ...parser.end() };
}
