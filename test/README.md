# Tests

Each behaviour is proved at the cheapest layer that runs the real code. Playwright covers only critical
paths, which need the built app, a browser and the factory's HTTP.

| Layer         | Files                                      | Runs with                           | Proves                                                                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server vitest | `src/**/*.test.ts` (node)                  | `pnpm test` (`--project server`)    | View models in `src/lib/factory/*.ts`, factory client reads with a fake `fetch` (`src/lib/server/factory/*.test.ts`), route loads (`src/routes/**/page.server.test.ts`) and every `/api/factory/*` status and body (`src/routes/api/factory/**/server.test.ts`), leak checks on those bodies included. |
| Client vitest | `src/**/*.svelte.test.ts` (browser)        | `pnpm test` (`--project client`)    | Rune state modules (`*.svelte.ts`) and component behaviour that needs a real DOM.                                                                                                                                                                                                                      |
| Stories       | `*.stories.svelte` next to their component | `pnpm test` (`--project storybook`) | Every component state (loading, empty, error, unavailable or partial, populated). Every story renders in light and dark side-by-side panes (`[data-theme-pane]`), and its `play` function asserts what the state must show, DESIGN.md styling included.                                                |
| Playwright    | `test/*.e2e.ts`                            | `pnpm test:e2e`                     | Critical paths through the production build against the fake factory: board, backlog and start, new ticket, ticket page and inspector, commands, live updates, stats. Also request logs at the factory and leak sweeps of the page, `__data.json` and `/api/factory/*`.                                |

Playwright never starts or visits Storybook. A component state belongs in a story `play` function, not in
an e2e spec.

## The shared fixture

Every spec imports `test`, `expect` and `gotoLive` from `./fixtures.ts`, never from `@playwright/test`.

- `test/global-setup.ts` builds the app once per run (`pnpm run build`). `test/heavy-lock.ts` makes
  concurrent runs on one machine take turns at the build.
- Each worker starts its own fake factory (`test/fake-factory.ts`) and its own `node build`, both on free
  ports it picked. No port is hard-coded and no server is reused, so runs from other worktrees never
  collide. `baseURL` is the worker's app (`http://localhost:<port>`), so `page.goto('/')` works.
- Before every test the fake is reset to that test's `fakeOptions`. The reset drops open event streams and
  empties the request, command and event logs. The app keeps running.
- Fixtures a test can take:
  - `fake`: `url` and `token` (both must never reach a page), `requests()`, `commands()`,
    `exportRequests()`, `connections()`, `openStreams()`, `emit(event)` and `dropStreams()`.
  - `app`: `{ url }`.
  - `shot(name)`: a full-page screenshot into `$QA_SCREENSHOTS` when that variable is set. The factory QA
    stage uses it.
- `gotoLive(page, url)` opens a page and waits until it is hydrated, its live stream is open and the
  refetch that follows has answered. Use it for dashboard pages. `networkidle` never arrives, because the
  stream stays open.

Config (`playwright.config.ts`): 30 s per test, no retries, a quarter of the cores as workers
(`E2E_WORKERS` overrides it). A spec sets no retries and no larger `test.setTimeout`. A test that needs
more than 30 s is a bug or a hang.

## Picking fake options

`FakeFactoryOptions` in `test/fake-factory.ts` lists every option. Options select fixture cohorts
(`statsCohort`, `statsTicketsCohort`, `statsExportCohort`, `tickets`, `backlog`), failures (`fail*`, each a
Problem), and behaviour (`canAct: false` for read-only access, `commandDelayMs`, `startAddsTicket`,
`heartbeatMs`). A refused token is `{ token: 'other' }`: the app keeps the fixture's token and the fake
refuses it.

Set them per describe or per test:

```ts
import { expect, gotoLive, test } from './fixtures.ts';
import { problemInternalError } from '../src/lib/factory/fixtures/problems.ts';

test.describe('the attention read fails', () => {
	test.use({ fakeOptions: { failAttention: problemInternalError } });

	test('the strip shows its error; the lanes keep working', async ({ page, fake }) => {
		await gotoLive(page, '/');
		// ...
		expect(fake.requests().every((r) => r.method === 'GET')).toBe(true);
	});
});
```

Need new fake data? Add a typed fixture in `src/lib/factory/fixtures/` and an option that selects it. Do not
write a parallel mock.

## Adding a feature spec

1. Check the lower layers first. A route status or body belongs in a server test, and a component state
   in a story `play`. Add an e2e test only for a path a user takes through the running app.
2. Add the test to the feature spec that owns the area: `board`, `tickets-list`, `attention`, `backlog`,
   `start-from-backlog`, `new-ticket`, `ticket-page`, `inspector`, `run-evidence`, `commands`,
   `api-endpoints`, `events-proxy`, `live-connection`, `stats-page` or `stats-execution`. Create
   `test/<feature>.e2e.ts` only for a new feature, and name it after the feature.
3. Keep one leak sweep per feature area. Do not add one per test.
4. Run it alone: `pnpm exec playwright test test/<feature>.e2e.ts -g "<title>"`, then the full suite once.
5. Format: `pnpm exec prettier --write test`.

Never add `test/qa-<ticket>-<task>-*.e2e.ts` files. QA extends the feature specs as well.

## Running

- `pnpm test`: server, client and stories.
- `pnpm test:e2e`: build (about 16 s), then about 130 tests (about 36 s with 2 workers).
- One file: `pnpm exec playwright test test/stats-page.e2e.ts`. One test: add `-g "<title>"`.
- Missing Chromium: `pnpm exec playwright install chromium`.
