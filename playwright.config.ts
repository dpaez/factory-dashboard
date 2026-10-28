import { availableParallelism } from 'node:os';

import { defineConfig } from '@playwright/test';

// No fixed ports and no web servers: each worker starts its own app and fake
// factory on free ports (test/fixtures.ts), after test/global-setup.ts has
// built the app once for the run. Component states are proved by story
// `play` functions in the vitest stories project (`pnpm test`), not here.

// Each worker runs a browser, an app and a fake factory. A quarter of the
// cores per run (Playwright's default is half) leaves room for a second run
// from another worktree at the same time. `E2E_WORKERS` overrides it.
const workers =
	Number(process.env.E2E_WORKERS) || Math.max(1, Math.floor(availableParallelism() / 4));

export default defineConfig({
	workers,
	// Playwright's defaults, stated: a real hang fails in 30 s, and a failure is
	// a failure, never retried into a pass. No spec overrides either.
	timeout: 30_000,
	retries: 0,
	globalSetup: './test/global-setup.ts',
	testMatch: '**/*.e2e.{ts,js}',
	testDir: './test',
});
