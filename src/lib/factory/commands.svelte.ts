/**
 * The browser's command coordinator: one place a dashboard control submits a
 * factory command and follows it to confirmed, rejected or unconfirmed.
 *
 * - One user action is one intent id, the upstream idempotency key. A
 *   delivery retry reuses it; a distinct action creates a new one.
 * - While an intent for a target is submitting or accepted, another submit
 *   for that target returns it and sends nothing.
 * - Accepted is not done: an intent is confirmed only once the event stream
 *   passed the accepted revision and its refetch settled, or, when the stream
 *   is late, once the coordinator's own reread of the command's keys settled.
 *
 * Browser-safe and dependency-injected: no `$app/*` import, so it runs in the
 * client test project. The root layout creates it beside the live controller.
 */
import { createContext } from 'svelte';

import {
	classifyCommandFailure,
	commandPath,
	commandTarget,
	keysForCommand,
	parseCommandAccepted,
	type CommandAccepted,
	type CommandAccess,
	type CommandFailure,
	type CommandInput,
	type CommandName,
	type CommandPhase,
	type CommandRejection,
	type CommandRequest
} from './commands';

// The target and phase vocabulary lives in `./commands` so pure modules share it.
export { commandTarget, type CommandAccess, type CommandInput, type CommandPhase };
import type { LiveController } from './live.svelte';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type Timer = ReturnType<typeof setTimeout>;

/** Why a rejected intent was rejected. */
export type CommandOutcome = Extract<CommandRejection, { outcome: 'rejected' }>['reason'];

/** One user action and where it stands. */
export type CommandIntent = {
	/** The intent id: a UUID, sent as the idempotency key. */
	id: string;
	command: CommandName;
	/** What the command acts on; one in-flight intent per target. */
	target: string;
	label: string;
	phase: Exclude<CommandPhase, 'idle'>;
	/** The request as sent, kept so a form can restore its input. */
	request: CommandRequest;
	accepted?: CommandAccepted;
	failure?: CommandFailure;
	outcome?: CommandOutcome;
	/** Validation messages keyed by field name (`answer`, `ticket`, …). */
	fieldErrors?: Record<string, string>;
	explanation: string;
	/** ISO time of the last transition. */
	updatedAt: string;
};

export type CommandCoordinatorOptions = {
	live: Pick<LiveController, 'waitForRevision'>;
	/** Reread the loads that depend on these `factory:` keys. */
	invalidate: (keys: string[]) => Promise<void>;
	fetch?: Fetch;
	setTimeout?: (callback: () => void, ms: number) => Timer;
	clearTimeout?: (timer: Timer) => void;
	now?: () => Date;
	newIntentId?: () => string;
	/** How long one delivery may take before it is unconfirmed. */
	deliveryTimeoutMs?: number;
	/** How long to wait for the accepted revision before rereading directly. */
	waitTimeoutMs?: number;
	/** How long a confirmed intent stays listed. */
	lingerMs?: number;
	/** How long a notice stays before it clears. */
	noticeMs?: number;
};

const DEFAULT_DELIVERY_MS = 15_000;
const DEFAULT_WAIT_MS = 30_000;
const DEFAULT_LINGER_MS = 4_000;
const DEFAULT_NOTICE_MS = 5_000;

const LABELS: Record<CommandName, string> = {
	start: 'Start ticket',
	reply: 'Reply',
	retry: 'Retry',
	complete: 'Complete',
	cancel: 'Cancel ticket',
	rerun: 'Rerun',
	stop: 'Stop run'
};

export const EXPLANATIONS = {
	submitting: 'Sending to the factory.',
	accepted: 'Accepted, waiting for the factory.',
	confirmed: 'The factory recorded it.',
	stale: 'The ticket changed; its current state is shown.',
	access: 'Action access required',
	validation: 'Fix the highlighted fields.',
	unconfirmed: "The factory's answer was lost; the command may have been applied."
} as const;

const hex = (byte: number) => byte.toString(16).padStart(2, '0');

/**
 * A v4 UUID. `crypto.randomUUID` needs a secure context, so on a plain-http
 * origin it is built from `crypto.getRandomValues` instead.
 */
export function newIntentId(
	source: Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>> = globalThis.crypto
): string {
	if (typeof source.randomUUID === 'function') return source.randomUUID();
	const bytes = source.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6]! & 0x0f) | 0x40;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const h = Array.from(bytes, hex).join('');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type Delivery = { ok: true; accepted: CommandAccepted } | { ok: false; failure: CommandFailure };

const NETWORK_FAILURE: CommandFailure = {
	type: 'network_error',
	title: 'The dashboard could not reach its server',
	retryable: true
};

const TIMEOUT_FAILURE: CommandFailure = {
	type: 'network_error',
	title: 'The dashboard server did not answer in time',
	retryable: true
};

const CONTRACT_FAILURE: CommandFailure = {
	type: 'contract_error',
	title: 'The answer was not understood',
	retryable: true
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The safe failure shape, checked in full: anything else is a contract error. */
function parseFailure(value: unknown): CommandFailure | undefined {
	if (!isRecord(value)) return undefined;
	const { type, title, detail, fieldErrors, retryable } = value;
	if (typeof type !== 'string' || typeof title !== 'string' || typeof retryable !== 'boolean') {
		return undefined;
	}
	if (detail !== undefined && typeof detail !== 'string') return undefined;
	if (fieldErrors !== undefined) {
		if (!Array.isArray(fieldErrors)) return undefined;
		const valid = fieldErrors.every(
			(error) =>
				isRecord(error) && typeof error.path === 'string' && typeof error.message === 'string'
		);
		if (!valid) return undefined;
	}
	return {
		type,
		title,
		retryable,
		...(detail !== undefined && { detail }),
		...(fieldErrors !== undefined && {
			fieldErrors: (fieldErrors as { path: string; message: string }[]).map(
				({ path, message }) => ({ path, message })
			)
		})
	};
}

function withDetail(text: string, detail: string | undefined): string {
	return detail ? `${text} ${detail}` : text;
}

function explain(rejection: CommandRejection, failure: CommandFailure): string {
	if (rejection.outcome === 'unconfirmed') return EXPLANATIONS.unconfirmed;
	switch (rejection.reason) {
		case 'stale':
			return withDetail(EXPLANATIONS.stale, failure.detail);
		case 'access':
			return failure.type === 'insufficient_scope'
				? EXPLANATIONS.access
				: withDetail(failure.title, failure.detail);
		case 'validation':
			return EXPLANATIONS.validation;
		default:
			return withDetail(failure.title, failure.detail);
	}
}

export class CommandCoordinator {
	/** Every intent still listed, oldest first. */
	intents: CommandIntent[] = $state([]);
	/** The latest transition as text, for a polite announcement; cleared after a while. */
	notice: string | null = $state(null);
	/**
	 * What this session knows of its action access. `/v1/me` names no scopes,
	 * so read-only is learned from the first `insufficient_scope` rejection
	 * and kept for the session.
	 */
	access: CommandAccess = $state('unknown');

	#live: CommandCoordinatorOptions['live'];
	#invalidate: CommandCoordinatorOptions['invalidate'];
	#fetch: Fetch;
	#setTimeout: NonNullable<CommandCoordinatorOptions['setTimeout']>;
	#clearTimeout: NonNullable<CommandCoordinatorOptions['clearTimeout']>;
	#now: () => Date;
	#newIntentId: () => string;
	#deliveryTimeoutMs: number;
	#waitTimeoutMs: number;
	#lingerMs: number;
	#noticeMs: number;

	#abort = new AbortController();
	/** Per-intent confirmation callbacks; they outlive the control that submitted. */
	#onConfirmed = new Map<string, () => void>();
	#noticeTimer: Timer | null = null;
	#lingerTimers = new Map<string, Timer>();

	constructor(options: CommandCoordinatorOptions) {
		this.#live = options.live;
		this.#invalidate = options.invalidate;
		this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
		this.#setTimeout = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
		this.#clearTimeout = options.clearTimeout ?? ((timer) => clearTimeout(timer));
		this.#now = options.now ?? (() => new Date());
		this.#newIntentId = options.newIntentId ?? (() => newIntentId());
		this.#deliveryTimeoutMs = options.deliveryTimeoutMs ?? DEFAULT_DELIVERY_MS;
		this.#waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_MS;
		this.#lingerMs = options.lingerMs ?? DEFAULT_LINGER_MS;
		this.#noticeMs = options.noticeMs ?? DEFAULT_NOTICE_MS;
	}

	/**
	 * Send one user action. While an intent for the same target is submitting
	 * or accepted, that intent is returned and nothing is sent.
	 *
	 * `onconfirmed` runs once if this intent confirms, even after the control
	 * that submitted it is gone (the coordinator outlives navigation). It is
	 * dropped when the intent is rejected or removed, and kept while it is
	 * unconfirmed, since a resend may still confirm it.
	 */
	submit(
		input: CommandInput,
		{ label, onconfirmed }: { label?: string; onconfirmed?: () => void } = {}
	): CommandIntent {
		const target = commandTarget(input);
		const pending = this.#pendingFor(target);
		if (pending) return pending;
		// A new action supersedes the target's resolved intent.
		for (const old of this.intents.filter((intent) => intent.target === target)) {
			this.#remove(old.id);
		}
		const id = this.#newIntentId();
		const request = { ...input, intent: id } as CommandRequest;
		this.intents.push({
			id,
			command: input.command,
			target,
			label: label ?? LABELS[input.command],
			phase: 'submitting',
			request,
			explanation: EXPLANATIONS.submitting,
			updatedAt: this.#now().toISOString()
		});
		const intent = this.#find(id)!;
		if (onconfirmed) this.#onConfirmed.set(id, onconfirmed);
		this.#announce(intent);
		void this.#deliver(id);
		return intent;
	}

	/** Resend an unconfirmed intent under the same intent id. */
	retryDelivery(id: string): void {
		const intent = this.#find(id);
		if (!intent || intent.phase !== 'unconfirmed') return;
		this.#update(id, {
			phase: 'submitting',
			failure: undefined,
			explanation: EXPLANATIONS.submitting
		});
		void this.#deliver(id);
	}

	/** Remove a resolved intent. A submitting or accepted one stays. */
	dismiss(id: string): void {
		const intent = this.#find(id);
		if (!intent || intent.phase === 'submitting' || intent.phase === 'accepted') return;
		this.#remove(id);
	}

	/** Whether a command for this target is submitting or accepted. */
	isPending(target: string): boolean {
		return this.#pendingFor(target) !== undefined;
	}

	/** The target's current intent, if any. */
	intentFor(target: string): CommandIntent | undefined {
		return this.intents.findLast((intent) => intent.target === target);
	}

	/** The target's phase: `idle` when it has no intent. */
	phaseFor(target: string): CommandPhase {
		return this.intentFor(target)?.phase ?? 'idle';
	}

	/** Stop waiting and clear every timer. Accepted intents stay accepted. */
	stop(): void {
		this.#abort.abort();
		this.#abort = new AbortController();
		if (this.#noticeTimer !== null) this.#clearTimeout(this.#noticeTimer);
		this.#noticeTimer = null;
		for (const timer of this.#lingerTimers.values()) this.#clearTimeout(timer);
		this.#lingerTimers.clear();
	}

	#pendingFor(target: string): CommandIntent | undefined {
		return this.intents.find(
			(intent) =>
				intent.target === target && (intent.phase === 'submitting' || intent.phase === 'accepted')
		);
	}

	#find(id: string): CommandIntent | undefined {
		return this.intents.find((intent) => intent.id === id);
	}

	#remove(id: string): void {
		this.#onConfirmed.delete(id);
		const timer = this.#lingerTimers.get(id);
		if (timer !== undefined) this.#clearTimeout(timer);
		this.#lingerTimers.delete(id);
		const index = this.intents.findIndex((intent) => intent.id === id);
		if (index !== -1) this.intents.splice(index, 1);
	}

	#update(id: string, changes: Partial<CommandIntent>): CommandIntent | undefined {
		const intent = this.#find(id);
		if (!intent) return undefined;
		Object.assign(intent, changes, { updatedAt: this.#now().toISOString() });
		this.#announce(intent);
		return intent;
	}

	#announce(intent: CommandIntent): void {
		this.notice = `${intent.label}: ${intent.explanation}`;
		if (this.#noticeTimer !== null) this.#clearTimeout(this.#noticeTimer);
		this.#noticeTimer = this.#setTimeout(() => {
			this.#noticeTimer = null;
			this.notice = null;
		}, this.#noticeMs);
	}

	/**
	 * One POST, bounded: a request (or its body) that has not answered within
	 * the delivery timeout is aborted and counts as unconfirmed, so the same
	 * intent can be resent. `stop()` aborts it too.
	 */
	async #post(request: CommandRequest, stopped: AbortSignal): Promise<Delivery> {
		const abort = new AbortController();
		const onStop = () => abort.abort();
		stopped.addEventListener('abort', onStop, { once: true });
		let timer: Timer | undefined;
		const timedOut = new Promise<Delivery>((resolve) => {
			timer = this.#setTimeout(() => {
				abort.abort();
				resolve({ ok: false, failure: TIMEOUT_FAILURE });
			}, this.#deliveryTimeoutMs);
		});
		try {
			return await Promise.race([this.#send(request, abort.signal), timedOut]);
		} finally {
			if (timer !== undefined) this.#clearTimeout(timer);
			stopped.removeEventListener('abort', onStop);
		}
	}

	async #send(request: CommandRequest, signal: AbortSignal): Promise<Delivery> {
		const { command, ...body } = request;
		let response: Response;
		try {
			response = await this.#fetch(commandPath(command), {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify(body),
				cache: 'no-store',
				signal
			});
		} catch {
			return { ok: false, failure: NETWORK_FAILURE };
		}
		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			payload = undefined;
		}
		const answer = isRecord(payload) ? payload : {};
		if (response.status === 202) {
			const accepted = answer.ok === true ? parseCommandAccepted(answer.accepted) : undefined;
			return accepted ? { ok: true, accepted } : { ok: false, failure: CONTRACT_FAILURE };
		}
		const failure = answer.ok === false ? parseFailure(answer.failure) : undefined;
		// Anything else is a proxy's or crash's answer: the command may have been applied.
		return { ok: false, failure: failure ?? CONTRACT_FAILURE };
	}

	async #deliver(id: string): Promise<void> {
		const signal = this.#abort.signal;
		const request = this.#find(id)?.request;
		if (!request) return;
		const delivery = await this.#post(request, signal);
		if (signal.aborted) return;

		if (!delivery.ok) return this.#fail(id, request, delivery.failure, signal);

		const { accepted } = delivery;
		this.#update(id, { phase: 'accepted', accepted, explanation: EXPLANATIONS.accepted });
		const result = await this.#live.waitForRevision(accepted.revision, {
			signal,
			timeoutMs: this.#waitTimeoutMs
		});
		if (result === 'aborted' || signal.aborted) return;
		if (result === 'timeout') {
			await this.#reread(keysForCommand(request, accepted));
			if (signal.aborted) return;
		}
		this.#update(id, { phase: 'confirmed', explanation: EXPLANATIONS.confirmed });
		const confirmed = this.#onConfirmed.get(id);
		this.#onConfirmed.delete(id);
		try {
			confirmed?.();
		} catch {
			// A caller's cleanup failing does not undo the confirmation.
		}
		this.#lingerTimers.set(
			id,
			this.#setTimeout(() => {
				this.#lingerTimers.delete(id);
				this.#remove(id);
			}, this.#lingerMs)
		);
	}

	async #fail(
		id: string,
		request: CommandRequest,
		failure: CommandFailure,
		signal: AbortSignal
	): Promise<void> {
		if (failure.type === 'insufficient_scope') this.access = 'read_only';
		const rejection = classifyCommandFailure(failure);
		const explanation = explain(rejection, failure);
		if (rejection.outcome === 'unconfirmed') {
			this.#update(id, { phase: 'unconfirmed', failure, explanation });
			return;
		}
		if (rejection.reason === 'stale') {
			await this.#reread(keysForCommand(request));
			if (signal.aborted) return;
		}
		this.#onConfirmed.delete(id);
		this.#update(id, {
			phase: 'rejected',
			failure,
			outcome: rejection.reason,
			explanation,
			...(rejection.reason === 'validation' && { fieldErrors: rejection.fieldErrors })
		});
	}

	async #reread(keys: string[]): Promise<void> {
		try {
			await this.#invalidate(keys);
		} catch {
			// A failed load shows its own error; the reread still settled.
		}
	}
}

/** What `CommandFeedback` shows for one intent: label, context, phase and why. */
export type CommandFeedbackItem = {
	id: string;
	label: string;
	phase: CommandIntent['phase'];
	/** The ticket key, run id or start ref the command acts on, shown in mono. */
	context?: { kind: 'ticket' | 'run' | 'ref'; value: string };
	explanation: string;
};

/** The feedback view of one intent. A stop names its ticket once accepted; the run id is kept. */
export function toCommandFeedbackItem(intent: CommandIntent): CommandFeedbackItem {
	const { request } = intent;
	let context: CommandFeedbackItem['context'];
	if ('ticket' in request) context = { kind: 'ticket', value: request.ticket };
	else if ('run' in request) context = { kind: 'run', value: request.run };
	else if (intent.accepted) context = { kind: 'ticket', value: intent.accepted.ticket };
	else if ('ref' in request) context = { kind: 'ref', value: request.ref };
	else context = { kind: 'ref', value: request.id };
	return {
		id: intent.id,
		label: intent.label,
		phase: intent.phase,
		context,
		explanation: intent.explanation
	};
}

const [getContext, setContext, hasContext] = createContext<CommandCoordinator>();

/** Make the layout's coordinator available to its pages. */
export function setCommandContext(coordinator: CommandCoordinator): CommandCoordinator {
	return setContext(coordinator);
}

/** The layout's coordinator, or undefined outside it (a component rendered alone in a test). */
export function getCommandContext(): CommandCoordinator | undefined {
	return hasContext() ? getContext() : undefined;
}
