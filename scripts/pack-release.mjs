#!/usr/bin/env node
// Stages build/ and a minimal package.json into factory-dashboard-<version>.tgz
// plus a sha256sum checksum file. The kit's Dockerfile checks that file.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;

if (!version || !versionPattern.test(version)) {
	console.error('Usage: node scripts/pack-release.mjs <version>');
	process.exit(1);
}

const outDir = join(root, 'release');
const name = `factory-dashboard-${version}.tgz`;
const tarball = join(outDir, name);
const stage = join(tmpdir(), `factory-dashboard-pack-${process.pid}`);

await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(join(root, 'build'), join(stage, 'build'), { recursive: true });
await writeFile(
	join(stage, 'package.json'),
	JSON.stringify({ name: 'factory-dashboard', version, private: true, type: 'module' }, null, '\t') +
		'\n'
);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const packed = spawn('tar', ['-czf', tarball, 'build', 'package.json'], {
	cwd: stage,
	stdio: 'inherit',
	env: { ...process.env, COPYFILE_DISABLE: '1' }
});
if ((await exitCode(packed)) !== 0) {
	console.error('Failed to write the release tarball.');
	process.exit(1);
}

const hash = createHash('sha256').update(await readFile(tarball)).digest('hex');
// Two spaces, the format `sha256sum -c` expects.
await writeFile(`${tarball}.sha256`, `${hash}  ${name}\n`);
await rm(stage, { recursive: true, force: true });
console.log(tarball);
console.log(`${tarball}.sha256`);

/** @param {import('node:child_process').ChildProcess} child */
function exitCode(child) {
	return new Promise((resolvePromise, reject) => {
		child.on('error', reject);
		child.on('exit', (code) => resolvePromise(code ?? 1));
	});
}
