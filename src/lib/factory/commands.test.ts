import { describe, expect, it } from 'vitest';

import {
	classifyCommandFailure,
	commandFieldName,
	isCommandName,
	isIntentId,
	keysForCommand,
	parseCommandAccepted,
	parseCommandBody,
	type CommandFailure,
	type CommandRequest
} from './commands';

const INTENT = '3f0c8a52-6a0e-4c4b-9d0e-1f2a3b4c5d6e';
const KEY = 'dpaez-factory-dashboard-28-e3869746';

const failure = (type: string, extra: Partial<CommandFailure> = {}): CommandFailure => ({
	type,
	title: type,
	retryable: false,
	...extra
});

describe('isIntentId', () => {
	it.each([INTENT, INTENT.toUpperCase(), '00000000-0000-0000-0000-000000000000'])(
		'accepts %s',
		(value) => expect(isIntentId(value)).toBe(true)
	);

	it.each([
		undefined,
		null,
		42,
		'',
		'not-a-uuid',
		INTENT.replaceAll('-', ''),
		`${INTENT}0`,
		` ${INTENT}`,
		'3f0c8a52-6a0e-4c4b-9d0e-1f2a3b4c5d6g'
	])('rejects %s', (value) => expect(isIntentId(value)).toBe(false));
});

describe('isCommandName', () => {
	it('knows the seven commands and nothing else', () => {
		for (const name of ['start', 'reply', 'retry', 'complete', 'cancel', 'rerun', 'stop']) {
			expect(isCommandName(name)).toBe(true);
		}
		for (const name of ['delete', 'toString', '', 'START', undefined]) {
			expect(isCommandName(name)).toBe(false);
		}
	});
});

describe('classifyCommandFailure', () => {
	it.each([
		['invalid_state', { outcome: 'rejected', reason: 'stale' }],
		['not_waiting_for_reply', { outcome: 'rejected', reason: 'stale' }],
		['insufficient_scope', { outcome: 'rejected', reason: 'access' }],
		['unauthorized', { outcome: 'rejected', reason: 'access' }],
		['configuration_error', { outcome: 'rejected', reason: 'access' }],
		['ticket_not_found', { outcome: 'rejected', reason: 'other' }],
		['not_found', { outcome: 'rejected', reason: 'other' }],
		['umbrella_issue', { outcome: 'rejected', reason: 'other' }],
		['tracker_unavailable', { outcome: 'rejected', reason: 'other' }],
		['unsupported_media_type', { outcome: 'rejected', reason: 'other' }],
		['forbidden', { outcome: 'rejected', reason: 'other' }],
		['something_new', { outcome: 'rejected', reason: 'other' }],
		['network_error', { outcome: 'unconfirmed' }],
		['internal_error', { outcome: 'unconfirmed' }],
		['contract_error', { outcome: 'unconfirmed' }]
	])('%s → %o', (type, expected) => {
		expect(classifyCommandFailure(failure(type))).toEqual(expected);
	});

	it('validation_error keys field errors by field name', () => {
		const result = classifyCommandFailure(
			failure('validation_error', {
				fieldErrors: [
					{ path: 'body.answer', message: 'Must not be empty.' },
					{ path: 'params.key', message: 'Bad key.' },
					{ path: 'headers.idempotency-key', message: 'Too long.' },
					{ path: 'body.answer', message: 'Second message, ignored.' }
				]
			})
		);
		expect(result).toEqual({
			outcome: 'rejected',
			reason: 'validation',
			fieldErrors: { answer: 'Must not be empty.', key: 'Bad key.', intent: 'Too long.' }
		});
	});

	it('validation_error without field errors is an empty map', () => {
		expect(classifyCommandFailure(failure('validation_error'))).toEqual({
			outcome: 'rejected',
			reason: 'validation',
			fieldErrors: {}
		});
	});
});

describe('commandFieldName', () => {
	it.each([
		['body.answer', 'answer'],
		['body.intent', 'intent'],
		['params.key', 'key'],
		['query.stage', 'stage'],
		['headers.idempotency-key', 'intent'],
		['headers.x-factory-on-behalf-of', 'intent'],
		['body.nested.field', 'nested.field'],
		['answer', 'answer']
	])('%s → %s', (path, name) => expect(commandFieldName(path)).toBe(name));
});

describe('parseCommandBody', () => {
	it.each([
		['start', { intent: INTENT, ref: '#28' }, { command: 'start', intent: INTENT, ref: '#28' }],
		[
			'start',
			{ intent: INTENT, id: 'n1', text: 'Do it' },
			{ command: 'start', intent: INTENT, id: 'n1', text: 'Do it' }
		],
		[
			'reply',
			{ intent: INTENT, ticket: KEY, answer: 'B' },
			{ command: 'reply', intent: INTENT, ticket: KEY, answer: 'B' }
		],
		['retry', { intent: INTENT, ticket: KEY }, { command: 'retry', intent: INTENT, ticket: KEY }],
		[
			'complete',
			{ intent: INTENT, ticket: KEY },
			{ command: 'complete', intent: INTENT, ticket: KEY }
		],
		['rerun', { intent: INTENT, ticket: KEY }, { command: 'rerun', intent: INTENT, ticket: KEY }],
		['cancel', { intent: INTENT, ticket: KEY }, { command: 'cancel', intent: INTENT, ticket: KEY }],
		[
			'cancel',
			{ intent: INTENT, ticket: KEY, reason: 'Dup' },
			{ command: 'cancel', intent: INTENT, ticket: KEY, reason: 'Dup' }
		],
		['stop', { intent: INTENT, run: 'run_1' }, { command: 'stop', intent: INTENT, run: 'run_1' }],
		[
			'retry',
			{ intent: INTENT, ticket: KEY, onBehalfOf: 'Mallory' },
			{ command: 'retry', intent: INTENT, ticket: KEY }
		]
	] as const)('%s %o is valid', (command, body, request) => {
		expect(parseCommandBody(command, body)).toEqual({ ok: true, request });
	});

	it.each([
		['retry', null, 'body'],
		['retry', [], 'body'],
		['retry', { ticket: KEY }, 'body.intent'],
		['retry', { intent: 'nope', ticket: KEY }, 'body.intent'],
		['retry', { intent: INTENT }, 'body.ticket'],
		['retry', { intent: INTENT, ticket: 'Bad Key' }, 'body.ticket'],
		['retry', { intent: INTENT, ticket: '../x' }, 'body.ticket'],
		['reply', { intent: INTENT, ticket: KEY, answer: '' }, 'body.answer'],
		['reply', { intent: INTENT, ticket: KEY, answer: '   ' }, 'body.answer'],
		['reply', { intent: INTENT, ticket: KEY }, 'body.answer'],
		['cancel', { intent: INTENT, ticket: KEY, reason: 3 }, 'body.reason'],
		['stop', { intent: INTENT }, 'body.run'],
		['stop', { intent: INTENT, run: '' }, 'body.run'],
		['start', { intent: INTENT }, 'body.ref'],
		['start', { intent: INTENT, ref: '#1', id: 'a', text: 'b' }, 'body.ref'],
		['start', { intent: INTENT, ref: '' }, 'body.ref'],
		['start', { intent: INTENT, id: 'a' }, 'body.text'],
		['start', { intent: INTENT, text: 'b' }, 'body.id']
	] as const)('%s %o fails at %s', (command, body, path) => {
		const result = parseCommandBody(command, body);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.fieldErrors.map((e) => e.path)).toContain(path);
	});
});

describe('parseCommandAccepted', () => {
	it('accepts the documented shape and drops extras', () => {
		expect(parseCommandAccepted({ ticket: KEY, revision: 0, message: 'ok', x: 1 })).toEqual({
			ticket: KEY,
			revision: 0,
			message: 'ok'
		});
	});

	it.each([
		null,
		[],
		{ ticket: KEY, revision: 1 },
		{ ticket: KEY, revision: -1, message: 'm' },
		{ ticket: KEY, revision: 1.5, message: 'm' },
		{ ticket: 1, revision: 1, message: 'm' }
	])('rejects %o', (value) => expect(parseCommandAccepted(value)).toBeUndefined());
});

describe('keysForCommand', () => {
	const accepted = { ticket: 'new-ticket-1', revision: 9, message: 'ok' };

	it('a start invalidates the board, the backlog and the new ticket', () => {
		const request: CommandRequest = { command: 'start', intent: INTENT, ref: '#28' };
		expect(keysForCommand(request)).toEqual(['factory:tickets', 'factory:backlog']);
		expect(keysForCommand(request, accepted)).toEqual([
			'factory:tickets',
			'factory:backlog',
			'factory:ticket:new-ticket-1',
			'factory:runs:new-ticket-1'
		]);
	});

	it.each(['reply', 'retry', 'complete', 'cancel', 'rerun'] as const)(
		'a %s invalidates the board and its ticket',
		(command) => {
			const request = { command, intent: INTENT, ticket: KEY, answer: 'x' } as CommandRequest;
			const expected = ['factory:tickets', `factory:ticket:${KEY}`, `factory:runs:${KEY}`];
			expect(keysForCommand(request)).toEqual(expected);
			expect(keysForCommand(request, { ...accepted, ticket: KEY })).toEqual(expected);
		}
	);

	it("a stop invalidates the accepted command's ticket", () => {
		const request: CommandRequest = { command: 'stop', intent: INTENT, run: 'run_1' };
		expect(keysForCommand(request)).toEqual(['factory:tickets']);
		expect(keysForCommand(request, { ...accepted, ticket: KEY })).toEqual([
			'factory:tickets',
			`factory:ticket:${KEY}`,
			`factory:runs:${KEY}`
		]);
	});
});
