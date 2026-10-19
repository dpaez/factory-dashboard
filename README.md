# Factory Dashboard

A custom factory agents dashboard to visualize activity, attention requests, ticket progress, and token usage.

**WIP - The project is in active development**

![dashboard screenshot](./Screenshot.png)

## Who this is for

This dashboard is planned to be used as an external accessory of GEUT's factory. You can see more [here](https://github.com/geut/sbx-shell-pi) and [here](https://github.com/geut/factory-skills). How it will be shipped into a factory sandbox is described in [sbx-shell-pi kit integration](#sbx-shell-pi-kit-integration-in-progress).

## Stack

The stack is mostly: Svelte with SvelteKit, shadcn-svelte, tailwindcss, TS,d TanStack table and others.

There will be an external (local) server used to read and watch (observe) the factory sqlite db. We will probably connect it with the dashboard via websockets to have some instant updates.

![factory integration sketch](./factory-integration-idea.png)

## sbx-shell-pi kit integration (in progress)

> **Status: in progress** — the mixin kit is not published yet. Everything below is the planned shape of the integration; track it in [sbx-shell-pi PR #6](https://github.com/geut/sbx-shell-pi/pull/6).

[sbx-shell-pi](https://github.com/geut/sbx-shell-pi) is migrating its sandbox images to **kits** (v3 sandbox kits: `pi`, `pi-docker`, `factory`). Kits compose: a **mixin** kit adds a capability to a workload kit instead of shipping yet another full image.

This dashboard is planned to be published as one of those mixins — tentatively `ghcr.io/geut/sbx-kit-factory-dashboard` (name and version are not final). It will require `node >= 24` and `pi-factory >= 1`. Only the sbx-shell-pi `factory` workload provides those names, so the mixin composes only onto that kit and cannot be installed on the single-pi kits.

Once composed:

- **Herdr stays the entrypoint.** The mixin does not replace or wrap the terminal workflow.
- The dashboard runs beside Herdr and reads the project's `.factory/db/state.sqlite` — the same read-only observation described in [PRODUCT.md](./PRODUCT.md). The terminal remains the control path.

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

### Development data

The dashboard reads a factory controller state database (state schema version 2) **read-only**, named by
the runtime `DB_URL` environment variable (`/abs/path` or `file:/abs/path`). There are two ways to get one
to develop against:

1. **A real database** from a factory run: point `DB_URL` at `<project>/.factory/db/state.sqlite` of any
   project driven by [factory-skills](https://github.com/geut/factory-skills).

   ```bash
   DB_URL=/absolute/path/to/<project>/.factory/db/state.sqlite pnpm run dev
   ```

2. **A scratch database** built from the vendored reference schema (`test/fixtures/state-schema.sql`, a
   provenance-stamped copy of the controller's `schema.sql` — see its header and ADR 0004). This yields an
   empty but valid v2 database; tests populate scratch copies the same way via `test/scratch-db.ts` and
   `test/seed.ts`.

   ```bash
   node -e "
     const { DatabaseSync } = require('node:sqlite');
     const { readFileSync } = require('node:fs');
     const db = new DatabaseSync('/tmp/scratch-state.sqlite');
     db.exec(readFileSync('test/fixtures/state-schema.sql', 'utf8'));
     db.close();
   "
   DB_URL=/tmp/scratch-state.sqlite pnpm run dev
   ```

A missing database, or one whose `schema_meta.schema_version` is not 2, renders a readable error page
instead of serving stale or wrong data. Nothing in this repo ever writes to factory state.

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
