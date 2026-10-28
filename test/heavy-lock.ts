import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A lock shared by every e2e run on this machine, from any worktree, around
 * the step that needs the most memory: the production build. Two runs at
 * once then take turns at it instead of building side by side, which ran the
 * sandbox out of memory (a build killed with exit 137, a browser tab crashed).
 *
 * The lock is a directory (`mkdir` is atomic) holding its owner's pid. A lock
 * whose owner is gone, such as one left by a killed run, is taken over.
 */
const LOCK = join(tmpdir(), 'factory-dashboard-e2e-heavy.lock');
const WAIT_MS = 15 * 60_000;
const POLL_MS = 500;

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function ownerAlive(): boolean {
	let pid: number;
	try {
		pid = Number(readFileSync(join(LOCK, 'pid'), 'utf8'));
	} catch {
		// Taken a moment ago and its pid not yet written: held, unless that was
		// long ago and its owner died in between.
		try {
			return Date.now() - statSync(LOCK).mtimeMs < 10_000;
		} catch {
			return false;
		}
	}
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/** Run `step` while holding the machine-wide heavy-step lock. */
export function withHeavyLock<T>(name: string, step: () => T): T {
	const deadline = Date.now() + WAIT_MS;
	let announced = false;
	for (;;) {
		try {
			mkdirSync(LOCK);
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
		}
		if (!ownerAlive()) {
			rmSync(LOCK, { recursive: true, force: true });
			continue;
		}
		if (Date.now() > deadline) throw new Error(`${name}: waited 15 min for ${LOCK}`);
		if (!announced) {
			console.log(`${name}: another e2e run holds ${LOCK}, waiting`);
			announced = true;
		}
		sleep(POLL_MS);
	}
	try {
		writeFileSync(join(LOCK, 'pid'), String(process.pid));
		return step();
	} finally {
		rmSync(LOCK, { recursive: true, force: true });
	}
}
