# Development

How to work on the dashboard from a checkout. Start with [Local development](../README.md#local-development) in the README for install, environment and run. We use `pnpm`.

## Storybook

[Storybook](https://storybook.js.org/) renders components in isolation, with the app's real CSS (`src/routes/layout.css`: tokens, Tailwind, Roboto and JetBrains Mono).

```bash
pnpm storybook        # dev server at http://localhost:6006
pnpm build-storybook  # static build in storybook-static/ (gitignored)
```

- **Where stories live:** next to their component, named `<component>.stories.svelte` (for example `src/lib/components/ui/button/button.stories.svelte`). Stories use [Svelte CSF](https://github.com/storybookjs/addon-svelte-csf) (`defineMeta` + `<Story>`). Any `src/**/*.stories.svelte` file is picked up.
- **Themes:** the **Theme** toolbar button switches between Light, Dark and Light and dark. Light and Dark toggle the `.dark` class on `<html>`, the same way ModeWatcher does in the app. Light and dark renders the story twice, side by side, with the right pane inside a `.dark` wrapper.
- **Stories are tests:** `pnpm test` runs a `storybook` Vitest project next to `server` and `client`. It renders every story in headless Chromium in the light and dark side-by-side theme, so a story that throws fails the suite. Accessibility checks (`@storybook/addon-a11y`) run too, but are report-only for now. If Chromium is missing, run `pnpm exec playwright install chromium`.

## Environment

| Variable                     | Required | Meaning                                                                       |
| ---------------------------- | -------- | ----------------------------------------------------------------------------- |
| `FACTORY_API_URL`            | yes      | Factory server base URL, without `/v1` (for example `http://127.0.0.1:7731`). |
| `FACTORY_API_TOKEN`          | yes      | An `act`-scoped factory server token.                                         |
| `FACTORY_OPERATOR_NAME`      | no       | Operator name sent with commands as `X-Factory-On-Behalf-Of`.                 |
| `FACTORY_DASHBOARD_ENV_FILE` | no       | Env file read on each request when a process variable is empty.               |

These are private runtime variables: they stay on the SvelteKit server and never reach the browser. A non-empty process variable wins for each key. Otherwise the value is read, on every request, from `FACTORY_DASHBOARD_ENV_FILE` when that is set, or from `$WORKSPACE_DIR/.factory/dashboard.env` when `WORKSPACE_DIR` is set. Nothing is cached, so a token that `factory-up` replaces is picked up without a restart. With neither path set, only the process variables are used.

A missing URL or token, or a token the factory server rejects (unauthorized or insufficient scope), renders the configuration error page naming `FACTORY_API_URL` and `FACTORY_API_TOKEN`, never an empty list. If the factory server is down or answers unexpectedly, the page says it is unreachable; an unknown ticket key is a 404.

## Tests

`pnpm test` runs three vitest projects: `server` (view models, factory client reads, route loads and `/api/factory/*` handlers), `client` (rune state modules and component behaviour in a browser) and `storybook` (every story renders in light and dark panes, and its `play` function asserts the state). Unit tests use fake `fetch` responses and the typed fixtures in `src/lib/factory/fixtures`; they never need a factory server. Component states are proved there. Playwright never starts Storybook.

`pnpm test:e2e` runs Playwright against a production build, for critical user paths only. It builds once per run. Then each worker starts its own fake factory (`test/fake-factory.ts`, plain `node`, typed fixtures, bearer token checked) and its own `node build` pointed at it, both on free ports, through the shared fixture `test/fixtures.ts`. Tests pick fake options with `test.use({ fakeOptions })`. Each test has 30 s and no retries. End-to-end tests never send commands to a real factory.

See [`test/README.md`](../test/README.md) for the layers, the fixture and how to add a feature spec.

## Factory API contract

The dashboard's types for the factory server API come from a committed OpenAPI snapshot, `openapi/factory.openapi.json`, and the TypeScript generated from it, `src/lib/factory/generated/factory-api.d.ts` (never hand-edit it; it is excluded from Prettier). Builds, `pnpm check` and `pnpm test` read only these committed files and never need a running factory.

To refresh both against a local factory server (`factory-up` starts it on port `7731` and writes its URL and token to `.factory/dashboard.env`):

```bash
FACTORY_API_URL=http://127.0.0.1:7731 pnpm api:sync   # api:pull (snapshot) + api:generate (types)
```

`api:pull` fetches `GET $FACTORY_API_URL/openapi.json` without a token and rejects anything that is not a JSON OpenAPI document exposing `/v1/tickets`. Commit both files together and review the diff.

To check for drift without touching the committed files:

```bash
FACTORY_API_URL=http://127.0.0.1:7731 pnpm api:check
```

It exits non-zero and names the file(s) that differ from the live server. It needs the network and is not part of `pnpm test`.
