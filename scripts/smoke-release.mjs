#!/usr/bin/env node
// Extracts the release tarball into an empty directory and checks that
// `PORT=7732 node build`, with no factory configuration, serves the page
// that tells you to run factory-up.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
const port = '7732';

if (!version) {
	console.error('Usage: node scripts/smoke-release.mjs <version>');
	process.exit(1);
}

const tarball = join(root, 'release', `factory-dashboard-${version}.tgz`);
const dir = await mkdtemp(join(tmpdir(), 'factory-dashboard-smoke-'));
const extracted = spawn('tar', ['-xzf', tarball, '-C', dir], { stdio: 'inherit' });
if ((await exitCode(extracted)) !== 0) {
	console.error(`Could not extract ${tarball}. Run release:pack first.`);
	process.exit(1);
}

const child = spawn('node', ['build'], {
	cwd: dir,
	stdio: ['ignore', 'pipe', 'pipe'],
	env: {
		PATH: process.env.PATH,
		HOME: process.env.HOME,
		TMPDIR: process.env.TMPDIR,
		LANG: process.env.LANG ?? 'C.UTF-8',
		PORT: port,
		HOST: '127.0.0.1'
	}
});

let logs = '';
const capture = (chunk) => {
	logs = (logs + chunk.toString()).slice(-4000);
};
child.stdout.on('data', capture);
child.stderr.on('data', capture);

try {
	const body = await waitForHint();
	if (!body.includes('factory-up')) {
		throw new Error('the page did not mention factory-up');
	}
	console.log(`factory-dashboard-${version} serves the configuration page on port ${port}.`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	if (logs.trim()) console.error(logs.trim());
	process.exitCode = 1;
} finally {
	child.kill('SIGTERM');
	await exitCode(child);
	await rm(dir, { recursive: true, force: true });
}

async function waitForHint() {
	const deadline = Date.now() + 20_000;
	let last = 'the server did not answer';
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`node build exited ${child.exitCode} before serving`);
		}
		try {
			const response = await fetch(`http://127.0.0.1:${port}/`);
			const text = await response.text();
			if (text.includes('factory-up')) return text;
			last = `status ${response.status} without the factory-up hint`;
		} catch (error) {
			last = error instanceof Error ? error.message : String(error);
		}
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
	}
	throw new Error(`Timed out waiting for the configuration page: ${last}`);
}

/** @param {import('node:child_process').ChildProcess} childProcess */
function exitCode(childProcess) {
	if (childProcess.exitCode !== null) return Promise.resolve(childProcess.exitCode);
	return new Promise((resolvePromise) => {
		childProcess.on('error', () => resolvePromise(1));
		childProcess.on('exit', (code) => resolvePromise(code ?? 1));
	});
}
