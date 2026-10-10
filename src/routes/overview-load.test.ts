import { afterEach, describe, expect, it, vi } from 'vitest';

import { createScratchDb, type ScratchDb } from '../../test/scratch-db';
import { readFixture, seedReadFixture } from '../../test/seed';
import { usdFromMicros } from '$lib/server/read';

// Same pattern as `client.test.ts`: in `serve` mode `$env/dynamic/private` is
// a snapshot, so the mock exposes a live getter over `process.env`.
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
		const scratch = scratchDbs.pop();
		// `load` memoizes its database through `getDb()`; closing the handle
		// before disposal keeps the module cache from outliving the file.
		vi.resetModules();
		scratch?.dispose();
	}
	delete process.env.DB_URL;
	vi.resetModules();
});

/** Import `load` fresh, with `DB_URL` already pointed at `path`. */
async function importLoad(path: string) {
	process.env.DB_URL = path;
	vi.resetModules();
	const { load } = await import('./+page.server');
	return (event: unknown) => load(event as never) as ReturnType<typeof load>;
}

describe('overview load', () => {
	it('returns the overview and ticket rows derived from the v2 read module', async () => {
		const scratch = track(createScratchDb());
		seedReadFixture(scratch.db);
		const load = await importLoad(scratch.path);

		const data = (await load({})) as {
			overview: Record<string, unknown> & {
				stageCounts: Record<string, number>;
				completeCount: number;
				activeCount: number;
				totals: Record<string, number>;
				openAttention: { ticketId: string; ticketTitle: string | null; question: string }[];
				updatedAt: string | null;
			};
			tickets: Record<string, unknown>[];
		};

		// Stage counts over current executions: A gen2 at `work`, B at `done`.
		expect(data.overview.stageCounts).toEqual({ plan: 0, work: 1, review: 0, wrapup: 0, done: 1 });
		expect(data.overview.completeCount).toBe(1);
		expect(data.overview.activeCount).toBe(1);

		// Cost arrives in USD, converted from micros by the read module.
		expect(data.overview.totals.costUsd).toBe(usdFromMicros(readFixture.totalCostMicros));
		expect(data.overview.totals.tokensInput).toBe(readFixture.totalTokensInput);
		expect(data.overview.totals.tokensOutput).toBe(readFixture.totalTokensOutput);
		expect(data.overview.totals.tokensCacheRead).toBe(readFixture.totalTokensCacheRead);
		expect(data.overview.totals.tokensCacheWrite).toBe(readFixture.totalTokensCacheWrite);

		// Attention comes from `open_attention`, not from `status === 'blocked'`.
		expect(data.overview.openAttention).toHaveLength(1);
		expect(data.overview.openAttention[0]).toMatchObject({
			ticketId: readFixture.ticketA,
			ticketTitle: 'Resumed session ticket',
			question: 'Which layout should the overview use?'
		});

		// A real timestamp from the database, not a hard-coded string.
		expect(data.overview.updatedAt).toBe(readFixture.updatedAt);

		// Tickets list: current executions only, newest first, cost in USD.
		expect(data.tickets).toHaveLength(2);
		expect(data.tickets[0]).toMatchObject({
			id: readFixture.ticketA,
			title: 'Resumed session ticket',
			stage: 'work',
			status: 'active',
			costUsd: 3
		});
		expect(data.tickets[1]).toMatchObject({
			id: readFixture.ticketB,
			stage: 'done',
			status: 'complete',
			costUsd: 1
		});
		// No legacy shape leaks through the payload.
		for (const row of data.tickets) {
			expect(Object.keys(row)).not.toContain('usages');
			expect(Object.keys(row)).not.toContain('cost_usd_micros');
		}
	});

	it('returns zeroed counts, zero totals, and no tickets for an empty database', async () => {
		const scratch = track(createScratchDb());
		const load = await importLoad(scratch.path);

		const data = (await load({})) as {
			overview: {
				stageCounts: Record<string, number>;
				completeCount: number;
				activeCount: number;
				totals: Record<string, number>;
				openAttention: unknown[];
				updatedAt: string | null;
			};
			tickets: unknown[];
		};

		expect(data.overview.stageCounts).toEqual({ plan: 0, work: 0, review: 0, wrapup: 0, done: 0 });
		expect(data.overview.completeCount).toBe(0);
		expect(data.overview.activeCount).toBe(0);
		expect(data.overview.totals.costUsd).toBe(0);
		expect(data.overview.totals.tokensTotal).toBe(0);
		expect(data.overview.openAttention).toEqual([]);
		expect(data.overview.updatedAt).toBeNull();
		expect(data.tickets).toEqual([]);
	});

	it('maps a missing database onto a readable 500 HttpError', async () => {
		const load = await importLoad('/nonexistent/factory/state.sqlite');

		let result: { status?: number; body?: { message?: string } } | null = null;
		try {
			await load({});
		} catch (cause) {
			result = cause as { status?: number; body?: { message?: string } };
		}

		expect(result).not.toBeNull();
		expect(result?.status).toBe(500);
		expect(result?.body?.message).toMatch(/cannot open factory database/);
	});
});
