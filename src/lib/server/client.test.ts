import { afterEach, describe, expect, it, vi } from 'vitest';

import { createScratchDb, type ScratchDb } from '../../../test/scratch-db';

// In `serve` mode (which vitest uses), `$env/dynamic/private` is generated as a
// snapshot object at config load, so the mock exposes a live getter instead.
vi.mock('$env/dynamic/private', () => ({
	env: {
		get DB_URL() {
			return process.env.DB_URL;
		}
	}
}));

const scratchDbs: ScratchDb[] = [];

function track(scratch: ScratchDb): ScratchDb {
	scratchDbs.push(scratch);
	return scratch;
}

afterEach(() => {
	while (scratchDbs.length > 0) {
		scratchDbs.pop()?.dispose();
	}
	delete process.env.DB_URL;
	vi.resetModules();
});

describe('getDb', () => {
	it('opens the database named by DB_URL once and memoizes it', async () => {
		const scratch = track(createScratchDb());
		process.env.DB_URL = scratch.path;
		vi.resetModules();

		const { getDb } = await import('./client');
		const first = getDb();

		expect(first.db.$client).toBe(first.client);
		expect(getDb()).toBe(first);
		first.client.close();
	});

	it('refuses to run without DB_URL', async () => {
		const scratch = track(createScratchDb());
		process.env.DB_URL = scratch.path;
		vi.resetModules();
		const { getDb } = await import('./client');
		getDb().client.close();

		// A fresh module instance has no memoized database and no DB_URL.
		delete process.env.DB_URL;
		vi.resetModules();
		const fresh = await import('./client');

		expect(() => fresh.getDb()).toThrowError(/DB_URL is required/);
	});
});
