import { drizzle } from 'drizzle-orm/node-sqlite';
import type { DatabaseSync } from 'node:sqlite';
import { env } from '$env/dynamic/private';

import { openReadOnlyStateDatabase } from './db';

export type DashboardDb = {
	/** The read-only `node:sqlite` handle. */
	client: DatabaseSync;
	/** Drizzle bound to that exact client — never `drizzle(client)`, which
	 *  silently opens an in-memory database in drizzle-orm 1.0.0-rc.4. */
	db: ReturnType<typeof createDashboardDb>['db'];
};

/**
 * Open `dbUrl` read-only, enforce the v2 schema guard, and bind drizzle to the
 * constructed client via `drizzle({ client })`.
 */
export function createDashboardDb(dbUrl: string) {
	const client = openReadOnlyStateDatabase(dbUrl);
	const db = drizzle({ client });
	return { client, db };
}

let instance: DashboardDb | undefined;

/**
 * The process-wide dashboard database, resolved from `DB_URL` on first use
 * (runtime read, so both `/abs/path` and `file:/abs/path` work). Throws the
 * typed errors from `./db` when the database is missing, unopenable, or not on
 * state schema version 2.
 */
export function getDb(): DashboardDb {
	if (!instance) {
		const url = env.DB_URL;
		if (!url) {
			throw new Error('DB_URL is required: point it at the factory state.sqlite');
		}
		instance = createDashboardDb(url);
	}
	return instance;
}
