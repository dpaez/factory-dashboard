# OpenAPI integration

## Decision

Use `openapi-typescript` to generate TypeScript definitions and `openapi-fetch` as the small typed HTTP client. Both support OpenAPI 3.x, and `openapi-fetch` accepts a `fetch` implementation, which lets the adapter use SvelteKit's request-aware `fetch` in server loads and tests.

The generated contract is the transport boundary. Components consume dashboard view models, not `paths` or raw response objects. Factory credentials and all upstream calls stay in server-only modules. The browser talks to SvelteKit loads, form actions and same-origin `/api/factory/*` handlers.

This gives compile-time checks for path strings, parameters, request bodies and JSON responses. It does not validate arbitrary data at runtime and does not turn streamed SSE or NDJSON records into typed objects by itself.

## Proposed files

```text
openapi/
  factory.openapi.json                # reviewed snapshot, checked in
scripts/
  sync-factory-openapi.mjs            # fetch, verify, format, write snapshot
  check-generated-openapi.mjs         # regenerate in temp storage and compare
src/lib/factory/
  generated/factory-api.d.ts          # generated; never hand-edited
  models.ts                            # component-facing view models
  adapters.ts                          # API response → view-model mapping
src/lib/server/factory/
  client.ts                            # authenticated openapi-fetch client factory
  errors.ts                            # Problem normalization
  reads.ts                             # typed read operations
  commands.ts                          # typed mutations and command headers
  events.ts                            # upstream SSE parser/proxy support
src/routes/api/factory/events/+server.ts
```

Keep the generated types outside `$lib/server` so type-only imports can be shared safely. Keep the client, token and private environment access inside `$lib/server`.

## Dependencies and scripts

Add `openapi-typescript` as a development dependency and `openapi-fetch` as a runtime dependency. Enable TypeScript's `noUncheckedIndexedAccess`, as recommended by the generator documentation.

Use separate pull and generation steps:

```json
{
  "scripts": {
    "api:pull": "node scripts/sync-factory-openapi.mjs",
    "api:generate": "openapi-typescript openapi/factory.openapi.json -o src/lib/factory/generated/factory-api.d.ts",
    "api:sync": "pnpm api:pull && pnpm api:generate",
    "api:check": "node scripts/check-generated-openapi.mjs"
  }
}
```

`api:pull` reads `${FACTORY_API_URL}/openapi.json`, requires a successful JSON response, verifies `openapi`, `info` and `paths`, and writes a stable formatted snapshot. It must not send the bearer token because the schema endpoint is public. Reject HTML, an empty document, or a schema without the expected `/v1/tickets` path.

`api:generate` runs the [openapi-typescript CLI](https://openapi-ts.dev/cli) against the checked-in snapshot. Normal builds, `pnpm test` and factory validation must not require a running factory or network access. `api:check` fetches the live schema into temporary storage, regenerates, and reports a diff against both committed files; it is run by hand (or by a future CI job), is not part of `pnpm test`, and never commits automatically. The repository has no CI today.

Commit both the schema snapshot and generated definitions. A schema change then produces a reviewable contract diff and the application remains reproducible when the factory is unavailable.

## Environment contract

```dotenv
FACTORY_API_URL=http://127.0.0.1:7731
FACTORY_API_TOKEN=...
```

`FACTORY_API_URL` is the origin/base URL, without `/v1`; generated paths already contain `/v1`. Read both values through `$env/dynamic/private` or deployment-injected private configuration. Never expose either value through `$env/static/public`, serialized page data, browser bundles, error payloads or logs.

The server checks `/health` for reachability and `/v1/me` for the configured client identity. The current `Me` response identifies the client and on-behalf-of value but does not report the token's scopes. Until the API exposes effective scopes, authorization failures remain authoritative; the UI may use a deployment setting to hide actions, but it must still handle `403 insufficient_scope`.

## Typed server client

Create one client per request context or pass `fetch` into a small client factory. Add only the bearer token in shared middleware. Pass idempotency and operator attribution per command.

```ts
import createClient from 'openapi-fetch';
import type { paths } from '$lib/factory/generated/factory-api';

type FactoryClientOptions = {
  baseUrl: string;
  token: string;
  fetch: typeof globalThis.fetch;
};

export function createFactoryClient(options: FactoryClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/$/, ''),
    fetch: options.fetch
  });

  client.use({
    onRequest({ request }) {
      request.headers.set('authorization', `Bearer ${options.token}`);
      return request;
    }
  });

  return client;
}
```

Call paths as string literals so TypeScript can resolve the operation:

```ts
const { data, error, response } = await client.GET('/v1/tickets', {
  params: { query: { limit: 100 } }
});
```

Do not export a global client initialized from environment values at module import time. Request-scoped construction is easier to test, supports SvelteKit's `fetch`, and avoids coupling initialization to build-time environment availability.

Use schema aliases only where they improve local code:

```ts
import type { components } from '$lib/factory/generated/factory-api';

export type ApiTicketSummary = components['schemas']['TicketSummary'];
export type ApiProblem = components['schemas']['Problem'];
export type ApiEventPayload = components['schemas']['EventPayload'];
```

Do not copy these shapes into handwritten interfaces. Handwritten types should describe transformed UI concepts such as `BoardTicket`, `AttentionItem` and `MetricAvailability`.

## Reads and view-model adapters

Server loads call small domain operations such as `listTickets`, `getTicket`, `getBacklog` and `getStatsSummary`, not the generic client directly. Each operation:

1. supplies typed parameters;
2. normalizes a successful response;
3. converts `application/problem+json` into `FactoryApiError`;
4. maps the API model to a dashboard view model where presentation needs differ;
5. preserves unknown/null facts instead of converting them to zero.

The current database types must not become aliases for new API types. The OpenAPI contract includes the `qa` ticket stage and API task states `pending | active | done | blocked | cancelled`; these differ from the schema-v2 types and require explicit UI signal mapping.

Use the API's stable ticket key as the command and read identity. Preserve `displayRef` as a label. Keep ticket execution, run ID and tracker issue ID distinct.

## Commands and idempotency

All mutations go through SvelteKit form actions or same-origin `POST` handlers. For each user intent:

1. The browser creates an intent ID with `crypto.randomUUID()` and keeps it while the command is unresolved.
2. The dashboard validates the intent ID and forwards it as `idempotency-key`.
3. The server derives `x-factory-on-behalf-of` from authenticated dashboard identity when one exists. It must not trust an arbitrary operator string from the submitted form.
4. The adapter sends the typed request body and accepts `202 CommandAccepted`.
5. The UI stores the returned `revision`, waits for the event stream to reach or pass it, then refetches the affected resource.
6. A delivery retry reuses the same intent ID. A distinct user action creates a new one.

An accepted command is displayed as pending/reconciling. It is not rendered as completed until a read confirms the new authoritative state. `start` invalidates tickets and backlog; ticket commands invalidate the detail, list and relevant stats; run stop invalidates both the run and its ticket.

## Error contract

Normalize transport failures and API problems into one server-side error without leaking credentials or upstream internals:

```ts
type FactoryApiFailure = {
  status: number;
  type: string;
  title: string;
  detail?: string;
  fieldErrors?: Array<{ path: string; message: string }>;
  retryable: boolean;
};
```

The schema defines stable problem types including `validation_error`, `unauthorized`, `insufficient_scope`, `not_found`, `ticket_not_found`, `invalid_state`, `not_waiting_for_reply`, `tracker_unavailable` and `internal_error`. Map them deliberately:

| Problem | Dashboard behavior |
| --- | --- |
| `validation_error` | Attach `errors[].path` messages to form fields; retain input |
| `unauthorized` / `insufficient_scope` | Show configuration/access failure; do not present an empty result |
| `invalid_state` / `not_waiting_for_reply` | Refetch ticket and explain its current state |
| `ticket_not_found` / `not_found` | Show missing-resource state; remove stale board selection where appropriate |
| `tracker_unavailable` | Keep current data marked stale and offer retry |
| network / `internal_error` | Keep outcome unconfirmed for mutations; retry reads with bounded backoff |

If the response is neither the documented success media type nor a parseable Problem document, report a contract/transport failure and log a safe request correlation value. Do not pass raw upstream response bodies to the browser.

## SSE integration

Native browser `EventSource` cannot attach the factory bearer header, so expose a same-origin SvelteKit proxy at `/api/factory/events`:

```text
Browser EventSource
  → GET /api/factory/events (same origin)
  → SvelteKit adds Authorization
  → GET {FACTORY_API_URL}/v1/events
```

The proxy forwards the upstream body as a stream rather than buffering it. Forward the browser's `Last-Event-ID` header and the supported initial cursor/query parameter, preserve `text/event-stream`, disable intermediary buffering where the deployment supports it, and abort the upstream request when the browser disconnects. Never expose the upstream token or URL in the response.

OpenAPI describes the HTTP SSE body as a string. The schema's `EventPayload` type can type parsed `data`, but it cannot validate stream frames. The event parser must handle chunk boundaries, multiple events per chunk, comments/heartbeats, `id`, `event`, multiline `data`, reconnects and malformed data. Validate the minimal required payload fields before dispatch.

Treat events as revisioned invalidation hints. Coalesce affected query keys and refetch typed HTTP resources; do not build canonical ticket state by replaying partial event payloads. After reconnect, refetch visible board/detail resources even when `Last-Event-ID` was supplied.

## Stats export and runtime validation

Regular JSON responses are statically checked at call sites but remain untrusted at runtime. Handle invalid JSON, unexpected content types and missing required response data as contract failures. Add narrow runtime guards where streamed or external data is decoded.

`/v1/stats/export` is NDJSON and is represented as a string stream in OpenAPI. Parse it line by line, validate the row discriminator and the fields used by the dashboard, and retain malformed-line diagnostics without treating partial output as a complete cohort. This export is the likely source for cross-stage token-category aggregation and quality calculations that are not present in the aggregate stats responses.

If runtime validation expands beyond SSE and NDJSON, adopt one generated validator pipeline for the whole API boundary. Do not maintain a second handwritten schema beside OpenAPI.

## Testing and contract drift

Test the boundary rather than the generator. There is no fake factory server: unit tests fake `fetch`, and components are exercised through Storybook stories with mock data.

- API operation tests use a fake `fetch` and fixtures declared with `satisfies components['schemas'][...]`. The same fixtures (`src/lib/factory/fixtures/`) back the Storybook stories, so components render "real"-shaped data in every state.
- Command tests assert bearer, idempotency and on-behalf-of headers; `202` remains pending until a confirming read.
- Problem tests cover every UI-relevant stable type and field-error mapping.
- SSE tests split frames at arbitrary byte boundaries and cover multiple frames, heartbeats, malformed JSON, reconnect cursors and abort.
- NDJSON tests cover partial chunks, blank lines, malformed records and incomplete exports.
- Route tests verify secrets never appear in serialized load data or browser responses.
- `pnpm check`, `pnpm lint` and `pnpm test` (unit + Storybook story tests) pass on every ticket; `pnpm api:check` is run when syncing the contract. Playwright flows are read-only or intercept command requests; they never send commands to a real factory.

The implementation pull request includes the schema snapshot diff when the factory contract changes. Generated type errors are treated as migration work, not suppressed with casts. A deployed dashboard may report schema version/checksum mismatch as an operator diagnostic, but it should base compatibility on the actual contract used to generate the client rather than only `info.version`.

## Implementation sequence

1. Add dependencies, schema snapshot, generation scripts and the generated file.
2. Add private configuration, the client factory, Problem normalization and `/health`/`/v1/me` checks.
3. Implement typed read operations and adapters for tickets, backlog, runs and stats.
4. Switch all routes from SQLite to API-backed loads in one change and delete the SQLite path (ADR 0005).
5. Add the SSE proxy and event-driven invalidation.
6. Add command handlers and the shared pending-command coordinator.
7. Add NDJSON-derived metrics only after their runtime validation and cohort completeness rules exist.
8. (Removed: the SQLite adapter is deleted in step 4.)

## Acceptance

- A developer can run one command to refresh the schema and generated types from `GET /openapi.json`.
- A normal build is reproducible without a live factory.
- Invalid paths, parameters, bodies and response property access fail TypeScript checks.
- No factory token enters the browser bundle, page data, browser network requests to the factory origin, or logs.
- Commands preserve idempotency across uncertain delivery and reconcile after `202`.
- SSE reconnects and causes authoritative refetches without buffering the stream.
- Problem responses produce actionable UI states and validation messages.
- Schema drift is visible in review, and `pnpm api:check` reports it against the running factory.

References: [openapi-typescript introduction](https://openapi-ts.dev/introduction), [openapi-fetch documentation](https://openapi-ts.dev/openapi-fetch/), [factory OpenAPI contract](https://github.com/geut/factory-skills/blob/main/openapi.json).
