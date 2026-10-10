import { afterEach, describe, expect, it, vi } from 'vitest';

import { createScratchDb, type ScratchDb } from '../../../../test/scratch-db';
import {
	insertTask,
	insertTaskDependency,
	insertTicket,
	readFixture,
	seedReadFixture
} from '../../../../test/seed';
import type { TicketDetail } from '$lib/server/types';

// Same pattern as `overview-load.test.ts`: in `serve` mode `$env/dynamic/private` is
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
	return (slug: string) => load({ params: { slug } } as never) as Promise<{ detail: TicketDetail }>;
}

/**
 * Extend the shared fixture with a fourth task (ordinal 4, depending on the
 * pending task 03) so the detail page is proven against four ordered tasks
 * with a dependency edge whose prerequisite is *not* done.
 */
function seedDetailFixture(scratch: ScratchDb): void {
	seedReadFixture(scratch.db);
	insertTask(scratch.db, {
		executionId: readFixture.executionA1,
		taskId: '04',
		ordinal: 4,
		title: 'Detail page',
		taskFile: '04-task-ticket-detail-page.md',
		status: 'pending',
		createdAt: '2026-01-01T01:02:00.000Z',
		updatedAt: '2026-01-01T01:02:00.000Z'
	});
	insertTaskDependency(scratch.db, readFixture.executionA1, '04', '03');
}

async function loadDetail(slug: string): Promise<{ detail: TicketDetail }> {
	const scratch = track(createScratchDb());
	seedDetailFixture(scratch);
	const load = await importLoad(scratch.path);
	return load(slug);
}

describe('ticket detail load', () => {
	it('returns the full v2 detail payload for a seeded ticket', async () => {
		const { detail } = await loadDetail(readFixture.ticketA);

		// Identity and current execution.
		expect(detail.ticket.id).toBe(readFixture.ticketA);
		expect(detail.execution).toMatchObject({
			id: readFixture.executionA1,
			generation: 2,
			stage: 'work',
			status: 'active',
			message: 'Writing the read module',
			messageAt: '2026-01-01T05:00:00.000Z'
		});

		// Two generations: the superseded one is in the history.
		expect(detail.priorGenerations).toHaveLength(1);
		expect(detail.priorGenerations[0]).toMatchObject({ generation: 1, status: 'cancelled' });

		// Four tasks, ordered by ordinal, with dependency edges.
		expect(detail.tasks.map((task) => task.taskId)).toEqual(['01', '02', '03', '04']);
		expect(detail.tasks[3]).toMatchObject({ ordinal: 4, dependsOnTaskIds: ['03'] });
		expect(detail.tasks[0]).toMatchObject({
			status: 'done',
			reviewRound: 1,
			reviewVerdict: 'approve',
			findingCount: 2,
			blockingCount: 0
		});

		// The open agent_question is in the attention list.
		const open = detail.attention.find((item) => item.status === 'open');
		expect(open).toMatchObject({
			id: readFixture.attentionOpen,
			kind: 'agent_question',
			question: 'Which layout should the overview use?'
		});

		// Two sessions; the resumed work session reports only its latest
		// cumulative snapshot, in USD, and carries its task's status directly.
		expect(detail.sessions.map((session) => session.id)).toEqual([
			readFixture.sessionAPlan,
			readFixture.sessionAWork
		]);
		expect(detail.sessions[0]).toMatchObject({
			taskId: null,
			taskStatus: 'unknown',
			contextPercent: 25
		});
		expect(detail.sessions[0].usage?.costUsd).toBe(0.5);
		expect(detail.sessions[1]).toMatchObject({
			taskId: '02',
			taskStatus: 'pending',
			contextPercent: 75
		});
		expect(detail.sessions[1].usage).toMatchObject({ costUsd: 2.5, tokensInput: 300 });

		// Per-stage usage from deltas, plan → work order, cost in USD.
		expect(detail.usageByStage.map((row) => row.stage)).toEqual(['plan', 'work']);
		expect(detail.usageByStage[0].costUsd).toBe(0.5);
		expect(detail.usageByStage[1].costUsd).toBe(2.5);

		// Nothing legacy leaks through the payload, and no micros integer survives.
		expect(Object.keys(detail).sort()).toEqual(
			[
				'ticket',
				'execution',
				'priorGenerations',
				'tasks',
				'attention',
				'sessions',
				'usageByStage'
			].sort()
		);
		expect(JSON.stringify(detail)).not.toMatch(/micros/i);
	});

	it('returns empty lists and a null execution for a ticket without one', async () => {
		const scratch = track(createScratchDb());
		seedDetailFixture(scratch);
		insertTicket(scratch.db, { id: 'github:github.com:CCC', title: 'Bare ticket' });
		const load = await importLoad(scratch.path);

		const { detail } = await load('github:github.com:CCC');

		expect(detail.execution).toBeNull();
		expect(detail.priorGenerations).toEqual([]);
		expect(detail.tasks).toEqual([]);
		expect(detail.attention).toEqual([]);
		expect(detail.sessions).toEqual([]);
		expect(detail.usageByStage).toEqual([]);
	});

	it('raises a 404 for an unknown ticket id', async () => {
		const scratch = track(createScratchDb());
		seedDetailFixture(scratch);
		const load = await importLoad(scratch.path);

		let result: { status?: number } | null = null;
		try {
			await load('github:github.com:does-not-exist');
		} catch (cause) {
			result = cause as { status?: number };
		}

		expect(result).not.toBeNull();
		expect(result?.status).toBe(404);
	});

	it('maps a missing database onto a readable 500 HttpError', async () => {
		const load = await importLoad('/nonexistent/factory/state.sqlite');

		let result: { status?: number; body?: { message?: string } } | null = null;
		try {
			await load(readFixture.ticketA);
		} catch (cause) {
			result = cause as { status?: number; body?: { message?: string } };
		}

		expect(result?.status).toBe(500);
		expect(result?.body?.message).toMatch(/cannot open factory database/);
	});

	it('maps an unsupported schema version onto a readable 500 HttpError', async () => {
		const scratch = track(createScratchDb());
		// schema_meta carries CHECK (schema_version = 2), so a "v1" database is
		// built by replacing the table rather than updating it (db.test.ts pattern).
		scratch.db.exec('DROP TABLE schema_meta');
		scratch.db.exec(
			'CREATE TABLE schema_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), schema_version INTEGER NOT NULL)'
		);
		scratch.db.exec('INSERT INTO schema_meta (singleton, schema_version) VALUES (1, 1)');
		const load = await importLoad(scratch.path);

		let result: { status?: number; body?: { message?: string } } | null = null;
		try {
			await load(readFixture.ticketA);
		} catch (cause) {
			result = cause as { status?: number; body?: { message?: string } };
		}

		expect(result?.status).toBe(500);
		expect(result?.body?.message).toMatch(/unsupported factory database schema/);
	});
});
