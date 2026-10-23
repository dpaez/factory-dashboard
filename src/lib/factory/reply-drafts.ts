/**
 * Reply drafts: the operator's unsent answer to one attention question, kept
 * per ticket, execution and question so it survives a refresh or navigation.
 * Browser-safe and pure: storage is injected, `sessionStorage` by default.
 * When storage is absent or throws (privacy mode, quota), drafts fall back
 * to memory for the page's life.
 *
 * A draft is cleared only when its reply is confirmed (`settle`). A
 * rejected or unconfirmed reply keeps it, so the text is never lost.
 */
import type { CommandPhase } from './commands';

export type ReplyDraftTarget = {
	ticket: string;
	/** The execution the question belongs to. */
	execution: number;
	/** The attention request's id. */
	question: string;
};

export type ReplyDrafts = {
	/** The saved draft, or `''` when there is none. */
	get(target: ReplyDraftTarget): string;
	/** Save a draft; an empty one is removed. */
	set(target: ReplyDraftTarget, value: string): void;
	clear(target: ReplyDraftTarget): void;
	/** Clear the draft once the reply is confirmed; keep it for every other phase. */
	settle(target: ReplyDraftTarget, phase: CommandPhase): void;
};

/** `reply:<ticket>:<execution>:<questionId>`. */
export function replyDraftKey({ ticket, execution, question }: ReplyDraftTarget): string {
	return `reply:${ticket}:${execution}:${question}`;
}

function defaultStorage(): Storage | null {
	try {
		return globalThis.sessionStorage ?? null;
	} catch {
		// Reading `sessionStorage` itself throws where storage is blocked.
		return null;
	}
}

/**
 * A draft store over `storage` (default `sessionStorage`). Pass `null` for
 * memory only.
 */
export function createReplyDrafts(storage: Storage | null = defaultStorage()): ReplyDrafts {
	const memory = new Map<string, string>();

	const read = (key: string): string | null => {
		if (!storage) return null;
		try {
			return storage.getItem(key);
		} catch {
			return null;
		}
	};
	const write = (key: string, value: string): boolean => {
		if (!storage) return false;
		try {
			storage.setItem(key, value);
			return true;
		} catch {
			return false;
		}
	};
	const remove = (key: string) => {
		memory.delete(key);
		if (!storage) return;
		try {
			storage.removeItem(key);
		} catch {
			// Storage may still hold the draft: record it as cleared in memory.
			memory.set(key, '');
		}
	};

	const drafts: ReplyDrafts = {
		get(target) {
			const key = replyDraftKey(target);
			// Memory holds only values storage refused (or a failed removal's
			// empty tombstone), so it is the newer one.
			return memory.get(key) ?? read(key) ?? '';
		},
		set(target, value) {
			const key = replyDraftKey(target);
			if (value === '') return remove(key);
			if (write(key, value)) memory.delete(key);
			else memory.set(key, value);
		},
		clear(target) {
			remove(replyDraftKey(target));
		},
		settle(target, phase) {
			if (phase === 'confirmed') drafts.clear(target);
		}
	};
	return drafts;
}
