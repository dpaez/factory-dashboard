# Factory Dashboard

The operator's command center for one factory: it shows where every ticket is, what needs a person, and what it costs. It reads everything from the factory server API.

**WIP - The project is in active development**

## Who this is for

This dashboard is planned to be used as an external accessory of GEUT's factory. You can see more [here](https://github.com/geut/sbx-shell-pi) and [here](https://github.com/geut/factory-skills). How it will be shipped into a factory sandbox is described in [sbx-shell-pi kit integration](#sbx-shell-pi-kit-integration-in-progress).

## Stack

The stack is mostly: Svelte with SvelteKit (adapter-node), shadcn-svelte, Tailwind CSS, TypeScript, TanStack Table and `openapi-fetch`.

The dashboard is a client of the factory server API. Its SvelteKit server loads read tickets, executions, runs and agents from `FACTORY_API_URL` with a private token; the browser never sees the token. Commands and live updates over the factory's event stream are planned (see [ADR 0005](./docs/adr/0005-factory-api-client-and-command-center.md)).

## sbx-shell-pi kit integration (in progress)

> **Status: planned** — the mixin kit is not published yet. The shape below is the agreed integration; track it in [sbx-shell-pi PR #6](https://github.com/geut/sbx-shell-pi/pull/6).

The dashboard ships as a v3 **mixin** kit, because a set has no Dockerfile and can only list published kits, so the dashboard's files need their own kit. [sbx-shell-pi](https://github.com/geut/sbx-shell-pi) then publishes a **set** (the factory workload plus this mixin) as one image to `sbx run`. Until that set exists, the mixin also works on its own with `--kit` on the factory workload.

Reference: `ghcr.io/dpaez/sbx-kit-factory-dashboard:0.1.0`. It may move to `ghcr.io/geut` later.

It requires `node >= 24` and [`io.github.geut/pi-factory >= 1`](https://github.com/geut/sbx-shell-pi#factory-contract). The workload's `pi-factory@1` was renamed into the `io.github.geut/` namespace, because bare names belong to Docker's `com.docker.kit/` vocabulary. It also needs sbx 0.47 or newer, because the factory workload declares `long-running@1`.

The dashboard relies on that [factory contract](https://github.com/geut/sbx-shell-pi#factory-contract): `factory-up` starts `factory serve` on container port `7731` (`0.0.0.0`) and writes `.factory/dashboard.env` (mode `0600`) with `FACTORY_API_URL` and an `act` `FACTORY_API_TOKEN` for the `dashboard` client.

**Planned startup.** A background lifecycle startup hook launches the dashboard on every boot, beside Herdr. Herdr stays the entrypoint. The dashboard listens on container port `7732` (`HOST=0.0.0.0`), published as `factory-dashboard`. Until `factory-up` has run, it shows the configuration page telling you to run `factory-up`. After that, it reads `$WORKSPACE_DIR/.factory/dashboard.env` on each request, so a rotated token is picked up without a restart. Real environment variables take precedence.

**Planned walkthrough**

1. On the host:

   ```bash
   sbx run --name factory ghcr.io/geut/sbx-shell-pi:node-24-factory /path/to/project \
     --kit ghcr.io/dpaez/sbx-kit-factory-dashboard:0.1.0
   ```

   Once the set is published, a single image reference replaces this.

2. In the sandbox, set up the factory in the repository so that `.factory/FACTORY.json` exists.
3. In the sandbox, in a Herdr pane at the repository root: `factory-up`.
4. On the host, run `sbx ports factory` to find the host port for `factory-dashboard`, then open it in a browser.

The mixin set is fixed when the sandbox is created, so changing it means creating a new sandbox.

## Development

We are using `pnpm`.

### Install

```bash
pnpm i
```

### Run local server

```bash
pnpm run dev
```

### Storybook

[Storybook](https://storybook.js.org/) renders components in isolation, with the app's real CSS (`src/routes/layout.css`: tokens, Tailwind, Roboto and JetBrains Mono).

```bash
pnpm storybook        # dev server at http://localhost:6006
pnpm build-storybook  # static build in storybook-static/ (gitignored)
```

- **Where stories live:** next to their component, named `<component>.stories.svelte` (for example `src/lib/components/ui/button/button.stories.svelte`). Stories use [Svelte CSF](https://github.com/storybookjs/addon-svelte-csf) (`defineMeta` + `<Story>`). Any `src/**/*.stories.svelte` file is picked up.
- **Themes:** the **Theme** toolbar button switches between Light, Dark and Light and dark. Light and Dark toggle the `.dark` class on `<html>`, the same way ModeWatcher does in the app. Light and dark renders the story twice, side by side, with the right pane inside a `.dark` wrapper.
- **Stories are tests:** `pnpm test` runs a `storybook` Vitest project next to `server` and `client`. It renders every story in headless Chromium in the light and dark side-by-side theme, so a story that throws fails the suite. Accessibility checks (`@storybook/addon-a11y`) run too, but are report-only for now. If Chromium is missing, run `pnpm exec playwright install chromium`.

### Factory server setup

The dashboard reads factory state only from a running factory server. No database is needed, and nothing
in this repo opens factory state files.

1. **Run a factory server** for the project you want to watch: `factory serve`, or `factory-up` from that
   project's root. `factory-up` starts `factory serve` on `127.0.0.1:7731` and writes the URL and a token to
   `.factory/dashboard.env`.
2. **Configure the dashboard** in `.env` (copy `.env.example`):

   | Variable                | Required | Meaning                                                                  |
   | ----------------------- | -------- | ------------------------------------------------------------------------ |
   | `FACTORY_API_URL`       | yes      | Factory server base URL, without `/v1` (for example `http://127.0.0.1:7731`). |
   | `FACTORY_API_TOKEN`     | yes      | An `act`-scoped factory server token.                                    |
   | `FACTORY_OPERATOR_NAME` | no       | Operator name sent with commands as `X-Factory-On-Behalf-Of`.            |

   These are private runtime variables: they stay on the SvelteKit server and never reach the browser.
3. **Start the dashboard** with `pnpm run dev`.

A missing URL or token, or a token the factory server rejects (unauthorized or insufficient scope), renders
the configuration error page naming `FACTORY_API_URL` and `FACTORY_API_TOKEN`, never an empty list. If the
factory server is down or answers unexpectedly, the page says it is unreachable; an unknown ticket key is a
404.

### Tests

`pnpm test` runs the unit and Storybook tests. Unit tests use fake `fetch` responses and the typed fixtures
in `src/lib/factory/fixtures`; they never need a factory server.

`pnpm test` runs three vitest projects: `server` (view models, factory client reads, route loads and
`/api/factory/*` handlers), `client` (rune state modules and component behaviour in a browser) and `storybook`
(every story renders in light and dark panes, and its `play` function asserts the state). Component states
are proved there. Playwright never starts Storybook.

`pnpm test:e2e` runs Playwright against a production build, for critical user paths only. It builds once
per run. Then each worker starts its own fake factory (`test/fake-factory.ts`, plain `node`, typed fixtures,
bearer token checked) and its own `node build` pointed at it, both on free ports, through the shared fixture
`test/fixtures.ts`. Tests pick fake options with `test.use({ fakeOptions })`. Each test has 30 s and no
retries. The whole run takes under a minute (about 16 s of build and 36 s of tests). End-to-end tests never
send commands to a real factory.

See [`test/README.md`](test/README.md) for the layers, the fixture and how to add a feature spec.

### Factory API contract

The dashboard's types for the factory server API come from a committed OpenAPI snapshot,
`openapi/factory.openapi.json`, and the TypeScript generated from it,
`src/lib/factory/generated/factory-api.d.ts` (never hand-edit it; it is excluded from Prettier). Builds,
`pnpm check` and `pnpm test` read only these committed files and never need a running factory.

To refresh both against the local factory server (`factory-up` from the repo root starts it on
`127.0.0.1:7731` and writes its URL and token to `.factory/dashboard.env`):

```bash
FACTORY_API_URL=http://127.0.0.1:7731 pnpm api:sync   # api:pull (snapshot) + api:generate (types)
```

`api:pull` fetches `GET $FACTORY_API_URL/openapi.json` without a token and rejects anything that is not a
JSON OpenAPI document exposing `/v1/tickets`. Commit both files together and review the diff.

To check for drift without touching the committed files:

```bash
FACTORY_API_URL=http://127.0.0.1:7731 pnpm api:check
```

It exits non-zero and names the file(s) that differ from the live server. It needs the network and is
not part of `pnpm test`. See `.env.example` for the runtime `FACTORY_API_*` variables.
