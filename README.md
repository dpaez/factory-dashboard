# Factory Dashboard

The operator's command center for one factory: it shows where every ticket is, what needs a person, and what it costs. It reads everything from the factory server API.

**WIP - The project is in active development**

![dashboard screenshot](./Screenshot.png)

## Who this is for

This dashboard is planned to be used as an external accessory of GEUT's factory. You can see more [here](https://github.com/geut/sbx-shell-pi) and [here](https://github.com/geut/factory-skills). How it will be shipped into a factory sandbox is described in [sbx-shell-pi kit integration](#sbx-shell-pi-kit-integration-in-progress).

## Stack

The stack is mostly: Svelte with SvelteKit (adapter-node), shadcn-svelte, Tailwind CSS, TypeScript, TanStack Table and `openapi-fetch`.

The dashboard is a client of the factory server API. Its SvelteKit server loads read tickets, executions, runs and agents from `FACTORY_API_URL` with a private token; the browser never sees the token. Commands and live updates over the factory's event stream are planned (see [ADR 0005](./docs/adr/0005-factory-api-client-and-command-center.md)).

![factory integration sketch](./factory-integration-idea.png)

## sbx-shell-pi kit integration (in progress)

> **Status: in progress** — the mixin kit is not published yet. Everything below is the planned shape of the integration; track it in [sbx-shell-pi PR #6](https://github.com/geut/sbx-shell-pi/pull/6).

[sbx-shell-pi](https://github.com/geut/sbx-shell-pi) is migrating its sandbox images to **kits** (v3 sandbox kits: `pi`, `pi-docker`, `factory`). Kits compose: a **mixin** kit adds a capability to a workload kit instead of shipping yet another full image.

This dashboard is planned to be published as one of those mixins — tentatively `ghcr.io/geut/sbx-kit-factory-dashboard` (name and version are not final). It will require `node >= 24` and `pi-factory >= 1`. Only the sbx-shell-pi `factory` workload provides those names, so the mixin composes only onto that kit and cannot be installed on the single-pi kits.

Once composed:

- **Herdr stays the entrypoint.** The mixin does not replace or wrap the terminal workflow.
- The dashboard runs beside Herdr and reads the project's factory through the factory server API, as described in [PRODUCT.md](./PRODUCT.md). The terminal remains the control path.

Planned usage, once the mixin is published:

```bash
sbx run --name factory ghcr.io/geut/sbx-shell-pi:node-24-factory /path/to/project \
  --kit ghcr.io/geut/sbx-kit-factory-dashboard:0.1.0
```

The `0.1.0` tag is tentative. The mixin set is fixed when the sandbox is created, so changing it means creating a new sandbox.

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

`pnpm test:e2e` runs Playwright against a production build. It starts a fake factory
(`test/fake-factory.ts`, plain `node`) that serves the typed fixtures over GET only and checks the bearer
token, and points the preview server at it. End-to-end tests never send commands to a real factory.

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
