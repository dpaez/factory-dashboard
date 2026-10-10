# Factory Dashboard

A custom factory agents dashboard to visualize activity|blockers, ticket progress, and token usage.

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
