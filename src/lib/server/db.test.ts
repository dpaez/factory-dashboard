import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { error, isHttpError } from '@sveltejs/kit';

import { createScratchDb, type ScratchDb } from '../../../test/scratch-db';
import {
	CannotOpenDatabaseError,
	DashboardDatabaseError,
	LegacyDatabaseError,
	REQUIRED_SCHEMA_VERSION,
	UnsupportedSchemaError,
	openReadOnlyStateDatabase,
	throwKitError
} from './db';
import { createDashboardDb } from './client';

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

function insertTicketAndExecution(scratch: ScratchDb, ticketId: string, executionId: string): void {
	scratch.db
		.prepare('INSERT INTO tickets (id, title, source_kind) VALUES (?, ?, ?)')
		.run(ticketId, 'Scratch ticket', 'github');
	scratch.db
		.prepare(
			`INSERT INTO ticket_executions (id, ticket_id, generation, stage, status, factory_dir)
			 VALUES (?, ?, 1, 'plan', 'active', '/tmp/scratch-factory')`
		)
		.run(executionId, ticketId);
}

describe('read-only v2 connection', () => {
	it('opens a scratch v2 database read-only with read-safe pragmas', () => {
		const scratch = track(createScratchDb());

		const client = openReadOnlyStateDatabase(scratch.path);

		expect(client.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
		expect(client.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 5000 });
		expect(client.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
		client.close();
	});

	it('rejects a write attempt through the dashboard connection', () => {
		const scratch = track(createScratchDb());
		const client = openReadOnlyStateDatabase(scratch.path);

		expect(() =>
			client.exec("INSERT INTO tickets (id, source_kind) VALUES ('write-attempt', 'github')")
		).toThrowError(/attempt to write a readonly database/);
		client.close();
	});

	it('binds drizzle to the constructed client, not an in-memory database', async () => {
		const scratch = track(createScratchDb());
		insertTicketAndExecution(
			scratch,
			'github:github.com:scratch-ticket',
			'github:github.com:scratch-ticket:1'
		);

		const { client, db } = createDashboardDb(scratch.path);

		// `drizzle(client)` (positional) silently opens `:memory:` in
		// drizzle-orm 1.0.0-rc.4; only the object form binds this client.
		expect(db.$client).toBe(client);

		const rows = await db.all(sql`SELECT id, ticket_id FROM current_ticket_executions ORDER BY id`);
		expect(rows).toEqual([
			{
				id: 'github:github.com:scratch-ticket:1',
				ticket_id: 'github:github.com:scratch-ticket'
			}
		]);
		client.close();
	});
});

describe('schema guard', () => {
	it('reports a missing database as a typed cannot-open error naming the path', () => {
		const missing = path.join(tmpdir(), 'factory-dashboard-missing-db', 'db', 'state.sqlite');

		let caught: unknown;
		try {
			openReadOnlyStateDatabase(missing);
		} catch (cause) {
			caught = cause;
		}

		expect(caught).toBeInstanceOf(CannotOpenDatabaseError);
		expect(caught).toBeInstanceOf(DashboardDatabaseError);
		expect((caught as Error).message).toContain(missing);
	});

	it('reports an unreadable database file as the same cannot-open error', () => {
		const scratch = track(createScratchDb());
		chmodSync(scratch.path, 0o000);

		let caught: unknown;
		try {
			openReadOnlyStateDatabase(scratch.path);
			caught = null;
		} catch (cause) {
			caught = cause;
		} finally {
			chmodSync(scratch.path, 0o644);
		}

		expect(caught).toBeInstanceOf(CannotOpenDatabaseError);
		expect((caught as Error).message).toContain(scratch.path);
	});

	it('rejects a schema version that is not 2, naming both versions', () => {
		const scratch = track(createScratchDb());
		// schema_meta carries CHECK (schema_version = 2), so a "v1" database is
		// built by replacing the table rather than updating it.
		scratch.db.exec('DROP TABLE schema_meta');
		scratch.db.exec(
			'CREATE TABLE schema_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), schema_version INTEGER NOT NULL)'
		);
		scratch.db.exec('INSERT INTO schema_meta (singleton, schema_version) VALUES (1, 1)');

		let caught: unknown;
		try {
			openReadOnlyStateDatabase(scratch.path);
		} catch (cause) {
			caught = cause;
		}

		expect(caught).toBeInstanceOf(UnsupportedSchemaError);
		const unsupported = caught as UnsupportedSchemaError;
		expect(unsupported.foundVersion).toBe(1);
		expect(unsupported.requiredVersion).toBe(REQUIRED_SCHEMA_VERSION);
		expect(unsupported.message).toContain(scratch.path);
		expect(unsupported.message).toMatch(/found schema version 1/);
		expect(unsupported.message).toMatch(/required version 2/);
	});

	it('rejects a legacy pre-v2 database with the controller advice', () => {
		const scratch = track(createScratchDb({ applySchema: false }));
		scratch.db.exec('CREATE TABLE tickets (id TEXT PRIMARY KEY, stage TEXT, status TEXT)');

		let caught: unknown;
		try {
			openReadOnlyStateDatabase(scratch.path);
		} catch (cause) {
			caught = cause;
		}

		expect(caught).toBeInstanceOf(LegacyDatabaseError);
		expect((caught as Error).message).toMatch(/legacy pre-v2 state database/i);
		expect((caught as Error).message).toMatch(/back it up or remove it/);
	});
});

describe('vendored schema fixture', () => {
	it('applies in one exec and yields user_version 2 plus all six views', () => {
		const scratch = track(createScratchDb());
		const client = scratch.openReadOnly();

		expect(client.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 });
		expect(
			client.prepare('SELECT schema_version FROM schema_meta WHERE singleton = 1').get()
		).toEqual({ schema_version: 2 });

		const views = client
			.prepare("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name")
			.all()
			.map((row) => (row as { name: string }).name);
		expect(views).toEqual([
			'current_ticket_executions',
			'execution_usage_by_stage',
			'execution_usage_totals',
			'latest_usage_by_session',
			'open_attention',
			'ready_task_frontier'
		]);
		client.close();
	});
});

describe('throwKitError', () => {
	it('maps typed database errors onto a 500 with the readable message', () => {
		const databaseError = new UnsupportedSchemaError('/tmp/state.sqlite', 1);

		let caught: unknown;
		try {
			throwKitError(databaseError);
		} catch (cause) {
			caught = cause;
		}

		expect(isHttpError(caught)).toBe(true);
		if (isHttpError(caught)) {
			expect(caught.status).toBe(500);
			expect((caught.body as { message?: string }).message).toBe(databaseError.message);
		}
	});

	it('passes SvelteKit HttpErrors through untouched', () => {
		// `error()` throws the HttpError it creates.
		let httpError: unknown;
		try {
			error(404, 'Ticket not found');
		} catch (cause) {
			httpError = cause;
		}

		let caught: unknown;
		try {
			throwKitError(httpError);
		} catch (cause) {
			caught = cause;
		}

		expect(caught).toBe(httpError);
	});

	it('rethrows unexpected errors unchanged', () => {
		const unexpected = new Error('boom');

		let caught: unknown;
		try {
			throwKitError(unexpected);
		} catch (cause) {
			caught = cause;
		}

		expect(caught).toBe(unexpected);
	});
});
