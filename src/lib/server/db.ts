import { error, isHttpError } from '@sveltejs/kit';
import { DatabaseSync } from 'node:sqlite';

/**
 * The only factory state schema version this dashboard understands. The
 * controller (`geut/factory-skills`, `src/state/schema.sql`) owns the database
 * and is its only writer; there is no migration path here (ADR 0004).
 */
export const REQUIRED_SCHEMA_VERSION = 2;

/** Base class for every database failure the dashboard reports to operators. */
export class DashboardDatabaseError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = new.target.name;
	}
}

/** The database file is missing, unreadable, or not a SQLite database at all. */
export class CannotOpenDatabaseError extends DashboardDatabaseError {
	constructor(
		public readonly dbUrl: string,
		options?: { cause?: unknown }
	) {
		const causeMessage = options?.cause instanceof Error ? `: ${options.cause.message}` : '';
		super(`cannot open factory database at ${dbUrl}${causeMessage}`, {
			cause: options?.cause
		});
	}
}

/** The database opened, but its `schema_meta.schema_version` is not supported. */
export class UnsupportedSchemaError extends DashboardDatabaseError {
	constructor(
		public readonly dbUrl: string,
		public readonly foundVersion: number | null,
		public readonly requiredVersion: number = REQUIRED_SCHEMA_VERSION
	) {
		super(
			`unsupported factory database schema at ${dbUrl}: found schema version ${
				foundVersion ?? 'missing'
			}, required version ${requiredVersion}`
		);
	}
}

/** A pre-v2 legacy database, detected the way the controller detects it. */
export class LegacyDatabaseError extends DashboardDatabaseError {
	constructor(public readonly dbUrl: string) {
		super(
			`legacy pre-v2 state database at ${dbUrl} is not supported; back it up or remove it, then point DB_URL at a controller state database`
		);
	}
}

function pragmaNumber(client: DatabaseSync, pragma: 'application_id' | 'user_version'): number {
	const row = client.prepare(`PRAGMA ${pragma}`).get() as Record<string, unknown> | undefined;
	const value = row ? Object.values(row)[0] : undefined;
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : -1;
}

function hasTable(client: DatabaseSync, name: string): boolean {
	return (
		client.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
		undefined
	);
}

function readSchemaVersion(client: DatabaseSync): number | null {
	if (!hasTable(client, 'schema_meta')) {
		return null;
	}
	const row = client.prepare('SELECT schema_version FROM schema_meta WHERE singleton = 1').get() as
		{ schema_version?: unknown } | undefined;
	if (row === undefined) {
		return null;
	}
	const parsed = Number(row.schema_version);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Reject anything that is not a state-schema-v2 database. Read-only: this never
 * writes, never migrates, and never shells out to drizzle-kit.
 */
export function assertSupportedSchema(client: DatabaseSync, dbUrl: string): void {
	const foundVersion = readSchemaVersion(client);
	if (foundVersion === REQUIRED_SCHEMA_VERSION) {
		return;
	}
	// A legacy factory database: tickets present, but no schema_meta and no
	// application_id — the controller refuses to migrate these, and so do we.
	if (
		pragmaNumber(client, 'application_id') === 0 &&
		!hasTable(client, 'schema_meta') &&
		hasTable(client, 'tickets')
	) {
		throw new LegacyDatabaseError(dbUrl);
	}
	throw new UnsupportedSchemaError(dbUrl, foundVersion);
}

/**
 * Open the factory state database read-only, set the read-safe connection
 * pragmas, and enforce the schema guard.
 *
 * `dbUrl` accepts both `/abs/path` and `file:/abs/path` (node:sqlite handles
 * both). No `PRAGMA journal_mode` is issued: a read-only connection cannot set
 * it, and reading a live WAL database read-only already works.
 *
 * Every open failure — missing file, unreadable file, a WAL database whose
 * `-shm` cannot be read — surfaces as {@link CannotOpenDatabaseError}, never a
 * raw `ERR_SQLITE_ERROR`.
 */
export function openReadOnlyStateDatabase(dbUrl: string): DatabaseSync {
	let client: DatabaseSync;
	try {
		client = new DatabaseSync(dbUrl, { readOnly: true });
	} catch (cause) {
		throw new CannotOpenDatabaseError(dbUrl, { cause });
	}

	try {
		client.exec('PRAGMA busy_timeout = 5000');
		client.exec('PRAGMA foreign_keys = ON');
		// The first read is what touches a WAL `-shm` file, so the guard query
		// stays inside this try: an unreadable WAL database must surface as the
		// same readable "cannot open" error.
		assertSupportedSchema(client, dbUrl);
	} catch (cause) {
		try {
			client.close();
		} catch {
			// Closing a broken handle must not mask the real failure.
		}
		if (cause instanceof DashboardDatabaseError) {
			throw cause;
		}
		throw new CannotOpenDatabaseError(dbUrl, { cause });
	}

	return client;
}

/**
 * Map a failure from the database layer onto a SvelteKit `error(...)` response
 * so both routes share one readable failure path. Unexpected errors pass
 * through untouched. Always throws.
 */
export function throwKitError(cause: unknown): never {
	if (isHttpError(cause)) {
		throw cause;
	}
	if (cause instanceof DashboardDatabaseError) {
		throw error(500, { message: cause.message });
	}
	throw cause;
}
