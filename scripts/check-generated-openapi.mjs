#!/usr/bin/env node
// api:check — compare the committed snapshot and generated types against the live factory.
// Writes only to a temp dir; never touches the committed files.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { OpenApiSnapshotError } from './lib/openapi-snapshot.mjs';
import { SNAPSHOT_PATH, pullSnapshot } from './sync-factory-openapi.mjs';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES_PATH = resolve(root, 'src/lib/factory/generated/factory-api.d.ts');
const GENERATOR = resolve(root, 'node_modules/.bin/openapi-typescript');

/** @param {string} path */
async function readOrNull(path) {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return null;
	}
}

const tmp = await mkdtemp(join(tmpdir(), 'factory-openapi-'));
let exitCode = 0;
try {
	const tmpSnapshot = join(tmp, 'factory.openapi.json');
	const tmpTypes = join(tmp, 'factory-api.d.ts');
	await pullSnapshot(tmpSnapshot, process.env.FACTORY_API_URL);
	await run(GENERATOR, [tmpSnapshot, '-o', tmpTypes], { cwd: root });

	const drifted = [];
	for (const [committed, fresh] of [
		[SNAPSHOT_PATH, tmpSnapshot],
		[TYPES_PATH, tmpTypes]
	]) {
		const [a, b] = await Promise.all([readOrNull(committed), readFile(fresh, 'utf8')]);
		if (a !== b) drifted.push(relative(root, committed) + (a === null ? ' (missing)' : ''));
	}

	if (drifted.length > 0) {
		console.error('api:check: drift against the live factory API:');
		for (const file of drifted) console.error(`  - ${file}`);
		console.error('Run `pnpm api:sync` and review the diff.');
		exitCode = 1;
	} else {
		console.log('api:check: snapshot and generated types match the live factory API.');
	}
} catch (error) {
	const message =
		error instanceof OpenApiSnapshotError
			? error.message
			: error instanceof Error
				? error.message
				: String(error);
	console.error(`api:check failed: ${message}`);
	exitCode = 1;
} finally {
	await rm(tmp, { recursive: true, force: true });
}
process.exit(exitCode);
