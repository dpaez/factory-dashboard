import { json } from '@sveltejs/kit';

import {
	isCommandName,
	parseCommandBody,
	type CommandFailure,
	type CommandRequest,
	type CommandResponse
} from '$lib/factory/commands';
import { factoryClientFromEnv, type FactoryClient } from '$lib/server/factory/client';
import * as commands from '$lib/server/factory/commands';
import { normalizeFactoryFailure, type FactoryApiFailure } from '$lib/server/factory/errors';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'no-store' };

function respond(status: number, failure: CommandFailure): Response {
	const body: CommandResponse = { ok: false, failure };
	return json(body, { status, headers: NO_STORE });
}

/** A normalized factory failure, minus its status, as the browser may see it. */
function failed(failure: FactoryApiFailure): Response {
	const safe: CommandFailure = {
		type: failure.type,
		title: failure.title,
		...(failure.detail !== undefined && { detail: failure.detail }),
		...(failure.fieldErrors !== undefined && {
			fieldErrors: failure.fieldErrors.map(({ path, message }) => ({ path, message }))
		}),
		retryable: failure.retryable
	};
	return respond(failure.status, safe);
}

function send(client: FactoryClient, request: CommandRequest) {
	const key = request.intent;
	switch (request.command) {
		case 'start':
			return commands.start(
				client,
				key,
				'ref' in request ? { ref: request.ref } : { id: request.id, text: request.text }
			);
		case 'reply':
			return commands.reply(client, key, request.ticket, { answer: request.answer });
		case 'retry':
			return commands.retry(client, key, request.ticket);
		case 'complete':
			return commands.complete(client, key, request.ticket);
		case 'cancel':
			return commands.cancel(
				client,
				key,
				request.ticket,
				request.reason === undefined ? undefined : { reason: request.reason }
			);
		case 'rerun':
			return commands.rerun(client, key, request.ticket);
		case 'stop':
			return commands.stop(client, key, request.run);
	}
}

function isJson(contentType: string | null): boolean {
	return contentType?.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

/**
 * Send one factory command for the browser: `{intent, …fields}` in, 202
 * `{ok: true, accepted}` or a safe `{ok: false, failure}` out. The intent id
 * is the upstream `idempotency-key`, so a resent intent never acts twice.
 * The operator name comes from `FACTORY_OPERATOR_NAME` only; whatever the
 * browser sends as `x-factory-on-behalf-of` is ignored.
 */
export const POST: RequestHandler = async ({ fetch, params, request, url }) => {
	// Exact origin equality. Behind adapter-node, `url.origin` is right only when
	// the deployment sets `ORIGIN` (or the protocol and host headers).
	const origin = request.headers.get('origin');
	if (origin !== null && origin !== url.origin) {
		return respond(403, {
			type: 'forbidden',
			title: 'Cross-origin request refused',
			detail: 'Commands are accepted from the dashboard itself only.',
			retryable: false
		});
	}
	const command = params.command;
	if (!isCommandName(command)) {
		return failed({
			status: 404,
			type: 'not_found',
			title: 'Unknown command',
			retryable: false
		});
	}
	if (!isJson(request.headers.get('content-type'))) {
		return failed({
			status: 415,
			type: 'unsupported_media_type',
			title: 'Unsupported media type',
			detail: 'Send the command as application/json.',
			retryable: false
		});
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = undefined;
	}
	const parsed = parseCommandBody(command, body);
	if (!parsed.ok) {
		return failed({
			status: 400,
			type: 'validation_error',
			title: 'Invalid command',
			fieldErrors: parsed.fieldErrors,
			retryable: false
		});
	}

	let client: FactoryClient;
	try {
		client = factoryClientFromEnv(fetch);
	} catch (thrown) {
		return failed(normalizeFactoryFailure(thrown));
	}
	const result = await send(client, parsed.request);
	if (!result.ok) return failed(result.failure);
	const accepted: CommandResponse = { ok: true, accepted: result.data };
	return json(accepted, { status: 202, headers: NO_STORE });
};
