import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * The vendored controller schema (state schema version 2), with its provenance
 * header. Applied to scratch databases in a single `db.exec`.
 */
export const schemaSql = readFileSync(new URL('./fixtures/state-schema.sql', import.meta.url), 'utf8');

export type ScratchDbOptions = {
	/** Apply the vendored v2 schema. Default true. Set false to build a foreign-shaped database. */
	applySchema?: boolean;
};

export type ScratchDb = {
	/** Absolute path of the scratch database file. */
	readonly path: string;
	/** Read-write handle for seeding. Never expose this to production code. */
	readonly db: DatabaseSync;
	/** Open the scratch file read-only, tracked for cleanup. */
	openReadOnly(): DatabaseSync;
	/** Close every handle opened through this helper and remove the temp directory. */
	dispose(): void;
};

/**
 * Create a temp file, apply the reference schema with a single `db.exec`, and
 * switch it to WAL so the scratch database matches a live controller database.
 * This is the fixture seam every data-layer test uses.
 */
export function createScratchDb(options: ScratchDbOptions = {}): ScratchDb {
	const applySchema = options.applySchema ?? true;
	const dir = mkdtempSync(path.join(tmpdir(), 'factory-dashboard-scratch-'));
	const file = path.join(dir, 'state.sqlite');
	const db = new DatabaseSync(file);
	const opened: DatabaseSync[] = [db];

	if (applySchema) {
		db.exec(schemaSql);
		// The controller opens its database read-write and sets WAL; a scratch
		// copy must look the same to a read-only consumer.
		db.exec('PRAGMA journal_mode = WAL');
	}

	return {
		path: file,
		db,
		openReadOnly() {
			const readOnly = new DatabaseSync(file, { readOnly: true });
			opened.push(readOnly);
			return readOnly;
		},
		dispose() {
			for (const handle of opened) {
				try {
					handle.close();
				} catch {
					// Already closed, or never fully opened; cleanup continues.
				}
			}
			rmSync(dir, { recursive: true, force: true });
		}
	};
}
