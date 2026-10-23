import { describe, expect, it } from 'vitest';

import { isIntentId, type CommandFailure } from './commands';
import {
	CommandCoordinator,
	EXPLANATIONS,
	commandTarget,
	newIntentId,
	toCommandFeedbackItem,
	type CommandInput
} from './commands.svelte';
import { acceptedRetry } from './fixtures';
import type { WaitResult } from './live.svelte';

const KEY = acceptedRetry.ticket;
const RETRY: CommandInput = { command: 'retry', ticket: KEY };
const REPLY: CommandInput = { command: 'reply', ticket: KEY, answer: 'Yes' };

type Answer =
	| { status: number; body: unknown }
	| { reject: true }
	| { hold: Promise<{ status: number; body: unknown }> };

/** A fake `fetch` for the command endpoint: records each POST and answers from a queue. */
function fakeCommands() {
	const calls: { url: string; method?: string; headers: Headers; body: Record<string, unknown> }[] =
		[];
	const answers: Answer[] = [];
	const signals: AbortSignal[] = [];
	const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
		signals.push(init!.signal!);
		calls.push({
			url,
			method: init?.method,
			headers: new Headers(init?.headers),
			body: JSON.parse(String(init?.body))
		});
		const answer = answers.shift() ?? { status: 202, body: { ok: true, accepted: acceptedRetry } };
		if ('reject' in answer) throw new TypeError('Failed to fetch');
		const { status, body } = 'hold' in answer ? await answer.hold : answer;
		return new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' }
		});
	};
	return { fetch, calls, answers, signals };
}

const failureBody = (type: string, extra: Partial<CommandFailure> = {}) => ({
	ok: false,
	failure: { type, title: `Title of ${type}`, retryable: false, ...extra }
});

/** A `waitForRevision` the test resolves by hand. */
function fakeLive() {
	const waits: { revision: number; signal?: AbortSignal; resolve(result: WaitResult): void }[] = [];
	const live = {
		waitForRevision: (revision: number, options: { signal?: AbortSignal } = {}) =>
			new Promise<WaitResult>((resolve) =>
				waits.push({ revision, signal: options.signal, resolve })
			)
	};
	return { live, waits };
}

/** Timers fired by hand. */
function manualTimers() {
	let id = 0;
	const timers = new Map<number, { ms: number; callback: () => void }>();
	return {
		setTimeout: (callback: () => void, ms: number) => {
			timers.set(++id, { ms, callback });
			return id as unknown as ReturnType<typeof setTimeout>;
		},
		clearTimeout: (timer: ReturnType<typeof setTimeout>) =>
			void timers.delete(timer as unknown as number),
		/** Fire every pending timer of this duration. */
		fire: (ms: number) => {
			for (const [key, timer] of [...timers]) {
				if (timer.ms !== ms) continue;
				timers.delete(key);
				timer.callback();
			}
		}
	};
}

async function settle() {
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function setup() {
	const commands = fakeCommands();
	const { live, waits } = fakeLive();
	const timers = manualTimers();
	const invalidations: string[][] = [];
	let holdInvalidate = false;
	let release: (() => void) | null = null;
	let ids = 0;
	const coordinator = new CommandCoordinator({
		fetch: commands.fetch,
		live,
		invalidate: (keys) => {
			invalidations.push(keys);
			if (!holdInvalidate) return Promise.resolve();
			return new Promise<void>((resolve) => (release = resolve));
		},
		setTimeout: timers.setTimeout,
		clearTimeout: timers.clearTimeout,
		now: () => new Date('2026-10-23T10:00:00.000Z'),
		newIntentId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
		deliveryTimeoutMs: 15_000,
		lingerMs: 4_000,
		noticeMs: 5_000
	});
	return {
		coordinator,
		...commands,
		waits,
		timers,
		invalidations,
		holdInvalidates: () => (holdInvalidate = true),
		releaseInvalidate: () => release?.()
	};
}

const ticketKeys = [
	'factory:tickets',
	`factory:ticket:${encodeURIComponent(KEY)}`,
	`factory:runs:${encodeURIComponent(KEY)}`
];

describe('submit', () => {
	it('creates one intent id and one POST carrying it', async () => {
		const t = setup();
		const intent = t.coordinator.submit(RETRY);
		expect(intent.phase).toBe('submitting');
		expect(isIntentId(intent.id)).toBe(true);
		await settle();
		expect(t.calls).toHaveLength(1);
		expect(t.calls[0]!.url).toBe('/api/factory/commands/retry');
		expect(t.calls[0]!.method).toBe('POST');
		expect(t.calls[0]!.headers.get('content-type')).toBe('application/json');
		expect(t.calls[0]!.body).toEqual({ intent: intent.id, ticket: KEY });
	});

	it('returns the in-flight intent for the same target and sends nothing', async () => {
		const t = setup();
		let answer!: (value: { status: number; body: unknown }) => void;
		t.answers.push({ hold: new Promise((resolve) => (answer = resolve)) });
		const first = t.coordinator.submit(RETRY);
		await settle();
		expect(t.coordinator.submit(RETRY)).toBe(first);
		expect(t.coordinator.isPending(commandTarget(RETRY))).toBe(true);
		answer({ status: 202, body: { ok: true, accepted: acceptedRetry } });
		await settle();
		expect(first.phase).toBe('accepted');
		expect(t.coordinator.submit(RETRY)).toBe(first);
		expect(t.calls).toHaveLength(1);
		expect(t.coordinator.intents).toHaveLength(1);
	});

	it('does not block a different target', async () => {
		const t = setup();
		t.coordinator.submit(RETRY);
		t.coordinator.submit({ command: 'retry', ticket: 'other-ticket' });
		await settle();
		expect(t.calls).toHaveLength(2);
	});

	it('gives a distinct action after the first resolved a new intent id', async () => {
		const t = setup();
		t.answers.push({ status: 409, body: failureBody('invalid_state') });
		const first = t.coordinator.submit(RETRY);
		await settle();
		expect(first.phase).toBe('rejected');
		const second = t.coordinator.submit(RETRY);
		expect(second.id).not.toBe(first.id);
		await settle();
		expect(t.calls.map((call) => call.body.intent)).toEqual([first.id, second.id]);
		expect(t.coordinator.intentFor(commandTarget(RETRY))).toBe(second);
	});
});

describe('acceptance', () => {
	it('stays accepted until waitForRevision reaches the revision', async () => {
		const t = setup();
		const intent = t.coordinator.submit(RETRY);
		await settle();
		expect(intent.phase).toBe('accepted');
		expect(intent.accepted).toEqual(acceptedRetry);
		expect(intent.explanation).toBe(EXPLANATIONS.accepted);
		expect(t.waits.map((wait) => wait.revision)).toEqual([acceptedRetry.revision]);
		await settle();
		expect(intent.phase).toBe('accepted');

		t.waits[0]!.resolve('reached');
		await settle();
		expect(intent.phase).toBe('confirmed');
		expect(t.invalidations).toEqual([]);
	});

	it('on timeout, confirms only after its own reread of the command keys settled', async () => {
		const t = setup();
		t.holdInvalidates();
		const intent = t.coordinator.submit(RETRY);
		await settle();
		t.waits[0]!.resolve('timeout');
		await settle();
		expect(t.invalidations).toEqual([ticketKeys]);
		expect(intent.phase).toBe('accepted');
		t.releaseInvalidate();
		await settle();
		expect(intent.phase).toBe('confirmed');
	});

	it('stays accepted when the wait is aborted', async () => {
		const t = setup();
		const intent = t.coordinator.submit(RETRY);
		await settle();
		t.waits[0]!.resolve('aborted');
		await settle();
		expect(intent.phase).toBe('accepted');
	});

	it('aborts the wait on stop', async () => {
		const t = setup();
		t.coordinator.submit(RETRY);
		await settle();
		t.coordinator.stop();
		expect(t.waits[0]!.signal?.aborted).toBe(true);
	});

	it('drops a confirmed intent after the linger', async () => {
		const t = setup();
		const intent = t.coordinator.submit(RETRY);
		await settle();
		t.waits[0]!.resolve('reached');
		await settle();
		expect(t.coordinator.intents).toEqual([intent]);
		t.timers.fire(4_000);
		expect(t.coordinator.intents).toEqual([]);
	});

	it('treats a malformed 202 as unconfirmed', async () => {
		const t = setup();
		t.answers.push({ status: 202, body: { ok: true, accepted: { ticket: KEY } } });
		const intent = t.coordinator.submit(RETRY);
		await settle();
		expect(intent.phase).toBe('unconfirmed');
		expect(intent.failure?.type).toBe('contract_error');
	});
});

describe('failures', () => {
	it.each([
		['a network rejection', { reject: true } as Answer],
		['internal_error', { status: 500, body: failureBody('internal_error') }],
		['contract_error', { status: 502, body: failureBody('contract_error') }],
		['network_error', { status: 503, body: failureBody('network_error') }],
		['a 5xx without a body', { status: 502, body: null }]
	])(
		'%s leaves the intent unconfirmed; retryDelivery resends the same intent',
		async (_, answer) => {
			const t = setup();
			t.answers.push(answer);
			const intent = t.coordinator.submit(RETRY);
			await settle();
			expect(intent.phase).toBe('unconfirmed');
			expect(intent.explanation).toBe(EXPLANATIONS.unconfirmed);
			expect(t.coordinator.isPending(commandTarget(RETRY))).toBe(false);

			t.coordinator.retryDelivery(intent.id);
			expect(intent.phase).toBe('submitting');
			await settle();
			expect(t.calls).toHaveLength(2);
			expect(t.calls[1]!.body.intent).toBe(t.calls[0]!.body.intent);
			expect(t.calls[1]!.body).toEqual(t.calls[0]!.body);
			expect(intent.phase).toBe('accepted');
		}
	);

	it('a delivery that never answers times out as unconfirmed and can be resent', async () => {
		const t = setup();
		t.answers.push({ hold: new Promise(() => {}) });
		const intent = t.coordinator.submit(RETRY);
		await settle();
		expect(intent.phase).toBe('submitting');
		t.timers.fire(15_000);
		await settle();
		expect(intent.phase).toBe('unconfirmed');
		expect(intent.failure?.type).toBe('network_error');
		expect(t.signals[0]!.aborted).toBe(true);

		t.coordinator.retryDelivery(intent.id);
		await settle();
		expect(t.calls[1]!.body.intent).toBe(intent.id);
		expect(intent.phase).toBe('accepted');
	});

	it.each([
		[
			'fieldErrors not an array',
			{ type: 'validation_error', title: 'Invalid', retryable: false, fieldErrors: {} }
		],
		[
			'a field error without a message',
			{
				type: 'validation_error',
				title: 'Invalid',
				retryable: false,
				fieldErrors: [{ path: 'body.answer' }]
			}
		],
		['no retryable flag', { type: 'invalid_state', title: 'Changed' }],
		[
			'a non-string detail',
			{ type: 'invalid_state', title: 'Changed', retryable: false, detail: 3 }
		],
		['no title', { type: 'insufficient_scope', retryable: false }],
		['an array', ['invalid_state']]
	])('a failure body with %s is a contract error, unconfirmed', async (_, failure) => {
		const t = setup();
		t.answers.push({ status: 400, body: { ok: false, failure } });
		const intent = t.coordinator.submit(REPLY);
		await settle();
		expect(intent.phase).toBe('unconfirmed');
		expect(intent.failure?.type).toBe('contract_error');
		expect(t.invalidations).toEqual([]);
	});

	it('retryDelivery does nothing outside unconfirmed', async () => {
		const t = setup();
		const intent = t.coordinator.submit(RETRY);
		await settle();
		t.coordinator.retryDelivery(intent.id);
		await settle();
		expect(t.calls).toHaveLength(1);
	});

	it('validation_error is rejected with field errors and keeps the input', async () => {
		const t = setup();
		t.answers.push({
			status: 400,
			body: failureBody('validation_error', {
				fieldErrors: [{ path: 'body.answer', message: 'Must not be empty.' }]
			})
		});
		const intent = t.coordinator.submit(REPLY);
		await settle();
		expect(intent.phase).toBe('rejected');
		expect(intent.outcome).toBe('validation');
		expect(intent.fieldErrors).toEqual({ answer: 'Must not be empty.' });
		expect(intent.request).toMatchObject({ command: 'reply', ticket: KEY, answer: 'Yes' });
		expect(t.invalidations).toEqual([]);
	});

	it.each(['invalid_state', 'not_waiting_for_reply'])(
		'%s rereads the target, then is rejected with the current-state explanation',
		async (type) => {
			const t = setup();
			t.holdInvalidates();
			t.answers.push({ status: 409, body: failureBody(type, { detail: 'It is done.' }) });
			const intent = t.coordinator.submit(REPLY);
			await settle();
			expect(t.invalidations).toEqual([ticketKeys]);
			expect(intent.phase).toBe('submitting');
			t.releaseInvalidate();
			await settle();
			expect(intent.phase).toBe('rejected');
			expect(intent.outcome).toBe('stale');
			expect(intent.explanation).toBe(`${EXPLANATIONS.stale} It is done.`);
		}
	);

	it('insufficient_scope is rejected with "Action access required"', async () => {
		const t = setup();
		t.answers.push({ status: 403, body: failureBody('insufficient_scope') });
		const intent = t.coordinator.submit(RETRY);
		await settle();
		expect(intent.phase).toBe('rejected');
		expect(intent.outcome).toBe('access');
		expect(intent.explanation).toBe('Action access required');
	});

	it('another failure is rejected with its title and detail', async () => {
		const t = setup();
		t.answers.push({
			status: 404,
			body: failureBody('ticket_not_found', { detail: 'No such ticket.' })
		});
		const intent = t.coordinator.submit(RETRY);
		await settle();
		expect(intent.phase).toBe('rejected');
		expect(intent.outcome).toBe('other');
		expect(intent.explanation).toBe('Title of ticket_not_found No such ticket.');
	});
});

describe('dismiss and notice', () => {
	it('removes a resolved intent but not a pending one', async () => {
		const t = setup();
		t.answers.push({ status: 403, body: failureBody('insufficient_scope') });
		const rejected = t.coordinator.submit(RETRY);
		const pending = t.coordinator.submit({ command: 'stop', run: 'run-1' });
		await settle();
		t.coordinator.dismiss(pending.id);
		t.coordinator.dismiss(rejected.id);
		expect(t.coordinator.intents.map((intent) => intent.id)).toEqual([pending.id]);
		expect(t.coordinator.phaseFor(commandTarget(RETRY))).toBe('idle');
	});

	it('announces each transition and clears the notice after a while', async () => {
		const t = setup();
		t.coordinator.submit(RETRY);
		expect(t.coordinator.notice).toBe(`Retry: ${EXPLANATIONS.submitting}`);
		await settle();
		expect(t.coordinator.notice).toBe(`Retry: ${EXPLANATIONS.accepted}`);
		t.timers.fire(5_000);
		expect(t.coordinator.notice).toBeNull();
	});
});

describe('newIntentId', () => {
	it('uses crypto.randomUUID when available', () => {
		expect(isIntentId(newIntentId())).toBe(true);
	});

	it('falls back to getRandomValues without randomUUID', () => {
		const source = { getRandomValues: crypto.getRandomValues.bind(crypto) };
		const ids = new Set(Array.from({ length: 20 }, () => newIntentId(source)));
		expect(ids.size).toBe(20);
		for (const id of ids) {
			expect(isIntentId(id)).toBe(true);
			expect(id[14]).toBe('4');
			expect('89ab').toContain(id[19]);
		}
	});
});

describe('toCommandFeedbackItem', () => {
	it('names the ticket for a ticket command', () => {
		const t = setup();
		const intent = t.coordinator.submit(RETRY);
		expect(toCommandFeedbackItem(intent)).toEqual({
			id: intent.id,
			label: 'Retry',
			phase: 'submitting',
			context: { kind: 'ticket', value: KEY },
			explanation: EXPLANATIONS.submitting
		});
	});

	it('names the run for a stop', () => {
		const t = setup();
		const intent = t.coordinator.submit({ command: 'stop', run: 'run_1' });
		expect(toCommandFeedbackItem(intent).context).toEqual({ kind: 'run', value: 'run_1' });
	});

	it('names the ref for a start, then the new ticket once accepted', async () => {
		const t = setup();
		const intent = t.coordinator.submit({ command: 'start', ref: 'dpaez/factory-dashboard#30' });
		expect(toCommandFeedbackItem(intent).context).toEqual({
			kind: 'ref',
			value: 'dpaez/factory-dashboard#30'
		});
		await settle();
		expect(intent.phase).toBe('accepted');
		expect(toCommandFeedbackItem(intent).context).toEqual({ kind: 'ticket', value: KEY });
	});
});
