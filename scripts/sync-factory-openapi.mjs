#!/usr/bin/env node
// api:pull — fetch the live factory OpenAPI document and write the snapshot.
// Usage: FACTORY_API_URL=http://127.0.0.1:7731 node scripts/sync-factory-openapi.mjs [outFile]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	OpenApiSnapshotError,
	fetchOpenApiDocument,
	formatSnapshot,
	resolveBaseUrl
} from './lib/openapi-snapshot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SNAPSHOT_PATH = resolve(root, 'openapi/factory.openapi.json');

/**
 * @param {string} outFile
 * @param {string | undefined} rawUrl
 */
export async function pullSnapshot(outFile, rawUrl) {
	const baseUrl = resolveBaseUrl(rawUrl);
	const doc = await fetchOpenApiDocument(baseUrl);
	await mkdir(dirname(outFile), { recursive: true });
	await writeFile(outFile, formatSnapshot(doc));
	return { baseUrl, outFile };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const outFile = process.argv[2] ? resolve(process.argv[2]) : SNAPSHOT_PATH;
	try {
		const { baseUrl } = await pullSnapshot(outFile, process.env.FACTORY_API_URL);
		console.log(`api:pull: wrote ${outFile} from ${baseUrl}/openapi.json`);
	} catch (error) {
		const message =
			error instanceof OpenApiSnapshotError
				? error.message
				: error instanceof Error
					? error.stack
					: String(error);
		console.error(`api:pull failed: ${message}`);
		process.exit(1);
	}
}
