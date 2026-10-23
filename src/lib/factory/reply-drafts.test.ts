import { describe, expect, it } from 'vitest';

import { createReplyDrafts, replyDraftKey, type ReplyDraftTarget } from './reply-drafts';

/** An in-memory `Storage`, optionally failing on every call. */
function fakeStorage({ failing = false } = {}): Storage {
	const items = new Map<string, string>();
	const guard = () => {
		if (failing) throw new DOMException('blocked', 'SecurityError');
	};
	return {
		get length() {
			return items.size;
		},
		clear: () => items.clear(),
		key: (index) => [...items.keys()][index] ?? null,
		getItem: (key) => (guard(), items.get(key) ?? null),
		setItem: (key, value) => (guard(), void items.set(key, value)),
		removeItem: (key) => (guard(), void items.delete(key))
	};
}

const QUESTION: ReplyDraftTarget = { ticket: 'dpaez-x-1', execution: 2, question: 'att_01' };

describe('replyDraftKey', () => {
	it('is keyed by ticket, execution and question', () => {
		expect(replyDraftKey(QUESTION)).toBe('reply:dpaez-x-1:2:att_01');
	});
});

describe('createReplyDrafts', () => {
	it('restores a draft from the same storage, as after a reload', () => {
		const storage = fakeStorage();
		createReplyDrafts(storage).set(QUESTION, 'Use Cmd+Enter.');
		expect(storage.getItem('reply:dpaez-x-1:2:att_01')).toBe('Use Cmd+Enter.');
		expect(createReplyDrafts(storage).get(QUESTION)).toBe('Use Cmd+Enter.');
	});

	it('keeps another question, execution or ticket empty', () => {
		const drafts = createReplyDrafts(fakeStorage());
		drafts.set(QUESTION, 'Use Cmd+Enter.');
		expect(drafts.get({ ...QUESTION, question: 'att_02' })).toBe('');
		expect(drafts.get({ ...QUESTION, execution: 3 })).toBe('');
		expect(drafts.get({ ...QUESTION, ticket: 'dpaez-x-2' })).toBe('');
	});

	it('clears a draft, and an empty set removes it', () => {
		const storage = fakeStorage();
		const drafts = createReplyDrafts(storage);
		drafts.set(QUESTION, 'text');
		drafts.clear(QUESTION);
		expect(drafts.get(QUESTION)).toBe('');
		drafts.set(QUESTION, 'text');
		drafts.set(QUESTION, '');
		expect(storage.length).toBe(0);
	});

	it('clears only when the reply is confirmed', () => {
		const drafts = createReplyDrafts(fakeStorage());
		drafts.set(QUESTION, 'keep me');
		for (const phase of ['submitting', 'accepted', 'rejected', 'unconfirmed', 'idle'] as const) {
			drafts.settle(QUESTION, phase);
			expect(drafts.get(QUESTION)).toBe('keep me');
		}
		drafts.settle(QUESTION, 'confirmed');
		expect(drafts.get(QUESTION)).toBe('');
	});

	it('falls back to memory when storage throws', () => {
		const drafts = createReplyDrafts(fakeStorage({ failing: true }));
		drafts.set(QUESTION, 'in memory');
		expect(drafts.get(QUESTION)).toBe('in memory');
		drafts.settle(QUESTION, 'confirmed');
		expect(drafts.get(QUESTION)).toBe('');
	});

	it('keeps a confirmed draft cleared when removing it from storage fails', () => {
		const items = fakeStorage();
		let failRemove = false;
		const storage: Storage = {
			...items,
			getItem: (key) => items.getItem(key),
			setItem: (key, value) => items.setItem(key, value),
			removeItem: (key) => {
				if (failRemove) throw new DOMException('blocked', 'SecurityError');
				items.removeItem(key);
			}
		};
		const drafts = createReplyDrafts(storage);
		drafts.set(QUESTION, 'stored');
		expect(storage.getItem(replyDraftKey(QUESTION))).toBe('stored');
		failRemove = true;
		drafts.settle(QUESTION, 'confirmed');
		expect(drafts.get(QUESTION)).toBe('');
		// A new draft for the same question still saves and reads back.
		drafts.set(QUESTION, 'next');
		expect(drafts.get(QUESTION)).toBe('next');
	});

	it('falls back to memory without storage', () => {
		const drafts = createReplyDrafts(null);
		drafts.set(QUESTION, 'in memory');
		expect(drafts.get(QUESTION)).toBe('in memory');
		expect(drafts.get({ ...QUESTION, question: 'att_02' })).toBe('');
	});

	it('prefers a newer memory value when storage starts refusing writes', () => {
		const items = fakeStorage();
		let full = false;
		const storage: Storage = {
			...items,
			getItem: (key) => items.getItem(key),
			removeItem: (key) => items.removeItem(key),
			setItem: (key, value) => {
				if (full) throw new DOMException('full', 'QuotaExceededError');
				items.setItem(key, value);
			}
		};
		const drafts = createReplyDrafts(storage);
		drafts.set(QUESTION, 'old');
		full = true;
		drafts.set(QUESTION, 'newer');
		expect(drafts.get(QUESTION)).toBe('newer');
	});

	it('uses sessionStorage by default when there is one', () => {
		const drafts = createReplyDrafts();
		drafts.set(QUESTION, 'default');
		expect(drafts.get(QUESTION)).toBe('default');
	});
});
