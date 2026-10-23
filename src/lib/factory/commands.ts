/**
 * The command contract the browser and `POST /api/factory/commands/<command>`
 * share: command names, wire request and response shapes, request
 * validation, failure classification and the reads a command invalidates.
 * Browser-safe and pure: type-only imports from the generated contract.
 */
import { BACKLOG_KEY, TICKETS_KEY, runsKey, ticketKey } from './events';
import type { components } from './generated/factory-api';

type Schemas = components['schemas'];

export type CommandAccepted = Schemas['CommandAccepted'];

export const COMMAND_NAMES = [
	'start',
	'reply',
	'retry',
	'complete',
	'cancel',
	'rerun',
	'stop'
] as const;

export type CommandName = (typeof COMMAND_NAMES)[number];

export function isCommandName(value: unknown): value is CommandName {
	return typeof value === 'string' && (COMMAND_NAMES as readonly string[]).includes(value);
}

/** The fields each command's wire body carries besides `intent`. */
export type CommandFields = {
	start: { ref: string } | { id: string; text: string };
	reply: { ticket: string; answer: string };
	retry: { ticket: string };
	complete: { ticket: string };
	cancel: { ticket: string; reason?: string };
	rerun: { ticket: string };
	stop: { run: string };
};

/** One command as the browser sends it: the name (the URL) plus the JSON body. */
export type CommandRequest = {
	[C in CommandName]: { command: C; intent: string } & CommandFields[C];
}[CommandName];

/** One command as a control asks for it: everything but the intent id. */
export type CommandInput = {
	[C in CommandName]: { command: C } & CommandFields[C];
}[CommandName];

/** Where one target's latest intent stands; `idle` when it has none. */
export type CommandPhase =
	'idle' | 'submitting' | 'accepted' | 'confirmed' | 'rejected' | 'unconfirmed';

/** What the session knows of its action access: `read_only` once a command was refused for scope. */
export type CommandAccess = 'unknown' | 'read_only';

/** What a command acts on: the command plus its ticket key, run id or start ref/id. */
export function commandTarget(input: CommandInput): string {
	switch (input.command) {
		case 'start':
			return 'ref' in input ? `start:ref:${input.ref}` : `start:id:${input.id}`;
		case 'stop':
			return `stop:${input.run}`;
		default:
			return `${input.command}:${input.ticket}`;
	}
}

/** The JSON body for one command: everything but the name, which is the URL. */
export type CommandBody<C extends CommandName = CommandName> = {
	intent: string;
} & CommandFields[C];

/** The same-origin endpoint for one command. */
export function commandPath(command: CommandName): string {
	return `/api/factory/commands/${command}`;
}

export type CommandFieldError = { path: string; message: string };

/** A failure that is safe to send to the browser: no token, URL or upstream body. */
export type CommandFailure = {
	type: string;
	title: string;
	detail?: string;
	fieldErrors?: CommandFieldError[];
	retryable: boolean;
};

/** What the endpoint answers: 202 with the accepted command, or a safe failure. */
export type CommandResponse =
	{ ok: true; accepted: CommandAccepted } | { ok: false; failure: CommandFailure };

const INTENT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_KEY_PATTERN = /^[a-z0-9-]+$/;

/** An intent id is a UUID (8-4-4-4-12 hex, any case); it becomes the idempotency key. */
export function isIntentId(value: unknown): value is string {
	return typeof value === 'string' && INTENT_PATTERN.test(value);
}

/** A 202 body as documented: `{ticket, revision ≥ 0, message}`, extra fields dropped. */
export function parseCommandAccepted(value: unknown): CommandAccepted | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
	const { ticket, revision, message } = value as Record<string, unknown>;
	if (typeof ticket !== 'string' || typeof message !== 'string') return undefined;
	if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
		return undefined;
	}
	return { ticket, revision, message };
}

export type ParsedCommand =
	{ ok: true; request: CommandRequest } | { ok: false; fieldErrors: CommandFieldError[] };

const nonEmpty = (value: unknown): value is string =>
	typeof value === 'string' && value.trim() !== '';

/**
 * Validate one command's JSON body. Field paths follow the factory's
 * convention (`body.<field>`), so one mapper handles local and upstream
 * errors. Unknown fields are dropped, never forwarded.
 */
export function parseCommandBody(command: CommandName, body: unknown): ParsedCommand {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return { ok: false, fieldErrors: [{ path: 'body', message: 'Send a JSON object.' }] };
	}
	const input = body as Record<string, unknown>;
	const errors: CommandFieldError[] = [];
	const fail = (field: string, message: string) => errors.push({ path: `body.${field}`, message });

	if (!isIntentId(input.intent)) fail('intent', 'Must be a UUID.');
	const intent = input.intent as string;

	const ticket = () => {
		if (typeof input.ticket !== 'string' || !TICKET_KEY_PATTERN.test(input.ticket)) {
			fail('ticket', 'Must be a ticket key: lowercase letters, digits and dashes.');
		}
		return input.ticket as string;
	};

	let request: CommandRequest | undefined;
	switch (command) {
		case 'start': {
			const hasRef = input.ref !== undefined;
			const hasText = input.id !== undefined || input.text !== undefined;
			if (hasRef && hasText) {
				fail('ref', 'Give a ref, or an id and text, not both.');
			} else if (hasRef) {
				if (!nonEmpty(input.ref)) fail('ref', 'Must not be empty.');
				request = { command, intent, ref: input.ref as string };
			} else if (hasText) {
				if (!nonEmpty(input.id)) fail('id', 'Must not be empty.');
				if (!nonEmpty(input.text)) fail('text', 'Must not be empty.');
				request = { command, intent, id: input.id as string, text: input.text as string };
			} else {
				fail('ref', 'Give a ref, or an id and text.');
			}
			break;
		}
		case 'reply': {
			const key = ticket();
			if (!nonEmpty(input.answer)) fail('answer', 'Must not be empty.');
			request = { command, intent, ticket: key, answer: input.answer as string };
			break;
		}
		case 'cancel': {
			const key = ticket();
			if (input.reason !== undefined && typeof input.reason !== 'string') {
				fail('reason', 'Must be text.');
			}
			request = {
				command,
				intent,
				ticket: key,
				...(typeof input.reason === 'string' && { reason: input.reason })
			};
			break;
		}
		case 'stop': {
			if (!nonEmpty(input.run)) fail('run', 'Must be a run id.');
			request = { command, intent, run: input.run as string };
			break;
		}
		default: {
			request = { command, intent, ticket: ticket() };
		}
	}
	if (errors.length > 0 || !request) return { ok: false, fieldErrors: errors };
	return { ok: true, request };
}

/** What a failed command means for the operator. */
export type CommandRejection =
	| { outcome: 'rejected'; reason: 'validation'; fieldErrors: Record<string, string> }
	| { outcome: 'rejected'; reason: 'stale' | 'access' | 'other' }
	| { outcome: 'unconfirmed' };

const STALE = new Set(['invalid_state', 'not_waiting_for_reply']);
const ACCESS = new Set(['insufficient_scope', 'unauthorized', 'configuration_error']);
/** The factory may have applied the command: resending under the same key is safe. */
const UNCONFIRMED = new Set(['network_error', 'internal_error', 'contract_error']);

/**
 * A field error path as a form names it: `body.answer` → `answer`,
 * `params.key` → `key`, `query.x` → `x`, and any `headers.*` → `intent`
 * (the idempotency key is the intent id).
 */
export function commandFieldName(path: string): string {
	if (path === 'headers' || path.startsWith('headers.')) return 'intent';
	return path.replace(/^(body|params|query)\./, '');
}

/** Classify a failure per the plan's table. Unknown types are rejected, `other`. */
export function classifyCommandFailure(failure: CommandFailure): CommandRejection {
	if (UNCONFIRMED.has(failure.type)) return { outcome: 'unconfirmed' };
	if (STALE.has(failure.type)) return { outcome: 'rejected', reason: 'stale' };
	if (ACCESS.has(failure.type)) return { outcome: 'rejected', reason: 'access' };
	if (failure.type === 'validation_error') {
		const fieldErrors: Record<string, string> = {};
		for (const { path, message } of failure.fieldErrors ?? []) {
			const name = commandFieldName(path);
			if (!(name in fieldErrors)) fieldErrors[name] = message;
		}
		return { outcome: 'rejected', reason: 'validation', fieldErrors };
	}
	return { outcome: 'rejected', reason: 'other' };
}

function ticketKeys(key: string): string[] {
	return [ticketKey(key), runsKey(key)];
}

/**
 * The reads a command changes. A start adds the backlog and, once accepted,
 * the new ticket; a stop names its ticket only through `accepted`.
 */
export function keysForCommand(request: CommandRequest, accepted?: CommandAccepted): string[] {
	const keys = [TICKETS_KEY];
	if (request.command === 'start') keys.push(BACKLOG_KEY);
	if ('ticket' in request) keys.push(...ticketKeys(request.ticket));
	if (accepted) keys.push(...ticketKeys(accepted.ticket));
	return [...new Set(keys)];
}
