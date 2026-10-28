import { execFileSync } from 'node:child_process';

import { withHeavyLock } from './heavy-lock.ts';

/**
 * Build the production app once per `pnpm test:e2e` run. Each worker then
 * serves `build/` itself (`test/fixtures.ts`), on a free port. Concurrent
 * runs take turns at the build (`test/heavy-lock.ts`).
 */
export default function globalSetup() {
	withHeavyLock('vite build', () => execFileSync('pnpm', ['run', 'build'], { stdio: 'inherit' }));
}
