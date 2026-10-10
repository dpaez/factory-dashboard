import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-sqlite';

import { createScratchDb, type ScratchDb } from '../../../test/scratch-db';
import { readFixture, seedReadFixture } from '../../../test/seed';
import { getOverview, getTicketDetail, getTicketList, usdFromMicros, type ReadDb } from './read';

const scratchDbs: ScratchDb[] = [];

function track(scratch: ScratchDb): ScratchDb {
	scratchDbs.push(scratch);
	return scratch;
}

afterEach(() => {
	while (scratchDbs.length > 0) {
		scratchDbs.pop()?.dispose();
	}
});

/** A fresh scratch v2 database seeded with the shared multi-ticket fixture. */
function seededDb(): ReadDb {
	const scratch = track(createScratchDb());
	seedReadFixture(scratch.db);
	return drizzle({ client: scratch.openReadOnly() }) as ReadDb;
}

/** Collect every key of a plain object/array structure. */
function collectKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
	if (Array.isArray(value)) {
		for (const item of value) collectKeys(item, keys);
	} else if (value !== null && typeof value === 'object') {
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			keys.add(key);
			collectKeys(item, keys);
		}
	}
	return keys;
}

describe('usdFromMicros', () => {
	it('converts zero, sub-cent, and large integer micros to USD', () => {
		expect(usdFromMicros(0)).toBe(0);
		expect(usdFromMicros(1)).toBe(0.000001);
		expect(usdFromMicros(12_345)).toBe(0.012345);
		expect(usdFromMicros(1_000_000)).toBe(1);
		expect(usdFromMicros(1_000_000_000_000)).toBe(1_000_000);
	});

	it('is the only micros conversion in src/', () => {
		const srcDir = path.resolve(import.meta.dirname, '..', '..');
		const readModule = path.join(srcDir, 'lib', 'server', 'read.ts');
		const offenders: string[] = [];

		const walk = (dir: string) => {
			for (const entry of readdirSync(dir)) {
				const file = path.join(dir, entry);
				if (statSync(file).isDirectory()) {
					walk(file);
					continue;
				}
				if (!/\.(ts|svelte)$/.test(entry) || file === readModule) continue;
				// The conversion itself, not mere mentions of the number: a
				// division by one million (or multiplication by its inverse).
				if (/\/\s*1_000_000\b|\/\s*1000000\b|\*\s*0\.000001\b/.test(readFileSync(file, 'utf8'))) {
					offenders.push(file);
				}
			}
		};
		walk(srcDir);

		expect(offenders).toEqual([]);
	});
});

describe('getOverview', () => {
	it('counts current executions per stage and by status', async () => {
		const overview = await getOverview(seededDb());

		expect(overview.stageCounts).toEqual({ plan: 0, work: 1, review: 0, wrapup: 0, done: 1 });
		expect(overview.completeCount).toBe(1);
		expect(overview.activeCount).toBe(1);
	});

	it('sums totals from the latest cumulative snapshot per session, not both snapshots of a resumed session', async () => {
		const overview = await getOverview(seededDb());

		// Ticket A work session is resumed: snapshots carry cumulative
		// $1.00 then $2.50. The total must use only the latest
		// ($2.50). Summing both cumulative rows would give 5.0 USD;
		// summing deltas for the total would also be wrong.
		expect(overview.totals).toEqual({
			costUsd: 4,
			tokensInput: readFixture.totalTokensInput,
			tokensOutput: readFixture.totalTokensOutput,
			tokensCacheRead: readFixture.totalTokensCacheRead,
			tokensCacheWrite: readFixture.totalTokensCacheWrite,
			tokensTotal: readFixture.totalTokensTotal
		});
		expect(overview.totals.costUsd).toBe(4);
	});

	it('returns the open attention list with ticket titles', async () => {
		const overview = await getOverview(seededDb());

		expect(overview.openAttention).toHaveLength(1);
		expect(overview.openAttention[0]).toMatchObject({
			id: readFixture.attentionOpen,
			executionId: readFixture.executionA1,
			ticketId: readFixture.ticketA,
			ticketTitle: 'Resumed session ticket',
			kind: 'agent_question',
			status: 'open',
			question: 'Which layout should the overview use?',
			createdAt: '2026-01-01T04:30:00.000Z',
			answeredAt: null,
			resolvedAt: null
		});
	});

	it('derives updatedAt from the newest execution update', async () => {
		const overview = await getOverview(seededDb());

		expect(overview.updatedAt).toBe(readFixture.updatedAt);
	});

	it('returns zeroed totals and empty lists on an empty database', async () => {
		const scratch = track(createScratchDb());
		const db = drizzle({ client: scratch.openReadOnly() }) as ReadDb;

		const overview = await getOverview(db);

		expect(overview).toEqual({
			stageCounts: { plan: 0, work: 0, review: 0, wrapup: 0, done: 0 },
			completeCount: 0,
			activeCount: 0,
			totals: {
				costUsd: 0,
				tokensInput: 0,
				tokensOutput: 0,
				tokensCacheRead: 0,
				tokensCacheWrite: 0,
				tokensTotal: 0
			},
			openAttention: [],
			updatedAt: null
		});
	});
});

describe('getTicketList', () => {
	it('returns one row per current execution, newest update first, with cost in USD', async () => {
		const rows = await getTicketList(seededDb());

		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			id: readFixture.ticketA,
			executionId: readFixture.executionA1,
			title: 'Resumed session ticket',
			type: 'feature',
			sourceKind: 'github',
			sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/1',
			stage: 'work',
			status: 'active',
			costUsd: 3,
			updatedAt: readFixture.updatedAt
		});
		expect(rows[1]).toMatchObject({
			id: readFixture.ticketB,
			executionId: readFixture.executionB1,
			type: null,
			sourceRef: null,
			stage: 'done',
			status: 'complete',
			costUsd: 1
		});
	});

	it('reports only the is_current = 1 execution of a ticket with a superseded generation', async () => {
		const rows = await getTicketList(seededDb());

		const ticketARows = rows.filter((row) => row.id === readFixture.ticketA);
		expect(ticketARows).toHaveLength(1);
		expect(ticketARows[0].executionId).toBe(readFixture.executionA1);
	});

	it('returns an empty array on an empty database', async () => {
		const scratch = track(createScratchDb());
		const db = drizzle({ client: scratch.openReadOnly() }) as ReadDb;

		expect(await getTicketList(db)).toEqual([]);
	});
});

describe('getTicketDetail', () => {
	it('returns ticket identity and the current execution', async () => {
		const detail = await getTicketDetail(seededDb(), readFixture.ticketA);

		expect(detail).not.toBeNull();
		expect(detail?.ticket).toEqual({
			id: readFixture.ticketA,
			title: 'Resumed session ticket',
			type: 'feature',
			sourceKind: 'github',
			sourceRef: 'https://github.com/dpaez/factory-dashboard/issues/1',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z'
		});
		expect(detail?.execution).toMatchObject({
			id: readFixture.executionA1,
			generation: 2,
			stage: 'work',
			status: 'active',
			statusReasonCode: 'work_in_progress',
			statusReason: 'Implementing task 02',
			message: 'Writing the read module',
			messageAt: '2026-01-01T05:00:00.000Z',
			planPath: '.factory/tickets/x/plan.md',
			adrPath: '.factory/tickets/x/adr.md',
			worktreePath: '/tmp/worktrees/x',
			worktreeBranch: 'factory/x',
			worktreeBaseBranch: 'main',
			worktreeStatus: 'ready',
			worktreeBaseSha: 'aaaaaaa',
			worktreeHeadSha: 'bbbbbbb',
			finishedAt: null
		});
	});

	it('lists the superseded generation in the generation history', async () => {
		const detail = await getTicketDetail(seededDb(), readFixture.ticketA);

		expect(detail?.priorGenerations).toEqual([
			{
				id: readFixture.executionA0,
				generation: 1,
				stage: 'done',
				status: 'cancelled',
				createdAt: '2026-01-01T00:01:00.000Z',
				updatedAt: '2026-01-01T01:00:00.000Z',
				finishedAt: '2026-01-01T01:00:00.000Z'
			}
		]);
	});

	it('returns tasks ordered by ordinal with their dependencies', async () => {
		const detail = await getTicketDetail(seededDb(), readFixture.ticketA);

		expect(detail?.tasks.map((task) => task.ordinal)).toEqual([1, 2, 3]);
		expect(detail?.tasks.map((task) => task.taskId)).toEqual(['01', '02', '03']);

		const [done, pendingAfterDone, pendingAfterPending] = detail?.tasks ?? [];
		expect(done).toMatchObject({
			title: 'Connection',
			taskFile: '01-task-readonly-v2-connection.md',
			status: 'done',
			reviewRound: 1,
			reviewVerdict: 'approve',
			findingCount: 2,
			blockingCount: 0,
			dependsOnTaskIds: []
		});
		// A pending task with a done prerequisite.
		expect(pendingAfterDone).toMatchObject({ status: 'pending', dependsOnTaskIds: ['01'] });
		// A pending task with a pending prerequisite.
		expect(pendingAfterPending).toMatchObject({ status: 'pending', dependsOnTaskIds: ['02'] });
	});

	it('returns open and resolved attention requests oldest first', async () => {
		const detail = await getTicketDetail(seededDb(), readFixture.ticketA);

		expect(detail?.attention.map((item) => item.id)).toEqual([
			readFixture.attentionResolved,
			readFixture.attentionOpen
		]);
		expect(detail?.attention[0]).toMatchObject({
			kind: 'policy_limit',
			status: 'resolved',
			question: 'Network approval required for github.com',
			answeredAt: '2026-01-01T02:40:00.000Z',
			resolvedAt: '2026-01-01T02:45:00.000Z',
			cancelledAt: null
		});
		expect(detail?.attention[1]).toMatchObject({
			kind: 'agent_question',
			status: 'open'
		});
	});

	it('returns sessions with model, task, context pressure, and latest cumulative usage', async () => {
		const detail = await getTicketDetail(seededDb(), readFixture.ticketA);

		expect(detail?.sessions.map((session) => session.id)).toEqual([
			readFixture.sessionAPlan,
			readFixture.sessionAWork
		]);

		const [plan, work] = detail?.sessions ?? [];
		expect(plan).toMatchObject({
			stage: 'plan',
			taskId: null,
			taskStatus: 'unknown',
			model: 'pi-model',
			status: 'completed',
			contextTokens: 50_000,
			contextWindow: 200_000,
			contextPercent: 25
		});
		expect(plan.usage?.costUsd).toBe(0.5);

		expect(work).toMatchObject({
			stage: 'work',
			taskId: '02',
			taskStatus: 'pending',
			status: 'open',
			contextPercent: 75
		});
		// The resumed session reports only its latest cumulative snapshot.
		expect(work.usage).toEqual({
			costUsd: 2.5,
			tokensInput: 300,
			tokensOutput: 30,
			tokensCacheRead: 20,
			tokensCacheWrite: 10,
			tokensTotal: 360
		});
	});

	it('returns per-stage usage as the sum of deltas', async () => {
		const detail = await getTicketDetail(seededDb(), readFixture.ticketA);

		expect(detail?.usageByStage).toEqual([
			{
				stage: 'plan',
				costUsd: 0.5,
				tokensInput: 1_000,
				tokensOutput: 100,
				tokensCacheRead: 500,
				tokensCacheWrite: 50,
				tokensTotal: 1_650
			},
			{
				// work = delta(run 1) + delta(run 2) = 1.0 + 1.5 USD.
				stage: 'work',
				costUsd: 2.5,
				tokensInput: 300,
				tokensOutput: 30,
				tokensCacheRead: 20,
				tokensCacheWrite: 10,
				tokensTotal: 360
			}
		]);
	});

	it('returns null for an unknown ticket id instead of throwing', async () => {
		expect(await getTicketDetail(seededDb(), 'github:github.com:does-not-exist')).toBeNull();
	});

	it('returns null for an unknown ticket id on an empty database', async () => {
		const scratch = track(createScratchDb());
		const db = drizzle({ client: scratch.openReadOnly() }) as ReadDb;

		expect(await getTicketDetail(db, readFixture.ticketA)).toBeNull();
	});

	it('tolerates a null ticket type', async () => {
		const detail = await getTicketDetail(seededDb(), readFixture.ticketB);

		expect(detail?.ticket.type).toBeNull();
		expect(detail?.execution).toMatchObject({ stage: 'done', status: 'complete' });
		expect(detail?.priorGenerations).toEqual([]);
		expect(detail?.tasks).toEqual([]);
		expect(detail?.attention).toEqual([]);
		expect(detail?.sessions[0].usage?.costUsd).toBe(1);
	});
});

describe('result shapes', () => {
	it('exposes no field name containing micros', async () => {
		const db = seededDb();
		const results = [
			await getOverview(db),
			await getTicketList(db),
			await getTicketDetail(db, readFixture.ticketA)
		];

		for (const result of results) {
			for (const key of collectKeys(result)) {
				expect(key.toLowerCase()).not.toContain('micros');
			}
		}
	});
});
