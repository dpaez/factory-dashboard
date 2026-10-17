# 5. The dashboard is a factory API client and command center

Date: 2026-10-17

## Status

Accepted. Supersedes ADR 0001 (direct SQLite reads), ADR 0003 (no state mutation) and ADR 0004 (read-only controller views, pinned schema). ADR 0002's boundary stands: the dashboard never reads `.factory/` files.

The factory now runs as a **factory server** that owns the controller and serves a versioned HTTP API (`/v1`, OpenAPI 3.1 at `GET /openapi.json`). The dashboard talks to that API only: every read, every command (start, reply, retry, stop, cancel, complete, rerun) and the live event stream. It no longer opens `state.sqlite`, pins a schema version, or vendors the controller's `schema.sql`; `DB_URL`, `node:sqlite` and drizzle are removed in one switch, not page by page, because the schema-v2 reader already cannot open a current factory database.

## Decisions

- **Transport types come from the running factory.** `pnpm api:sync` fetches `${FACTORY_API_URL}/openapi.json`, writes the schema snapshot and runs the `openapi-typescript` CLI; both files are committed so builds, `pnpm test` and factory validation never need a live server. `pnpm api:check` reports drift against the live server and is not part of `pnpm test`. The client is `openapi-fetch`, created per request with SvelteKit's `fetch`.
- **Secrets stay on the SvelteKit server.** `FACTORY_API_URL` and an `act`-scoped `FACTORY_API_TOKEN` are private runtime env. The browser talks only to same-origin loads, form actions and `/api/factory/*` handlers.
- **Live updates are a per-tab passthrough.** Each browser tab opens `/api/factory/events`, which streams the factory's `GET /v1/events` with the token added and `Last-Event-ID` forwarded. Events are invalidation hints; the dashboard rereads the named resources. No server-side fan-out.
- **The factory decides.** The API's `needsUser`, stages, statuses and command validity are authoritative; the dashboard never derives attention or the controller's next stage, and shows an accepted command as pending until a read confirms its effect.
- **No dashboard authentication.** The dashboard is for localhost or a trusted network only: whoever reaches it can act with its token. An optional `FACTORY_OPERATOR_NAME` is sent as `X-Factory-On-Behalf-Of`; the header is omitted when it is unset.
- **Ticket URLs use the ticket key.** `/tickets/[key]?execution=n&tab=…`; database-era execution-id links are not redirected.

## Considered Options

- **Vendor `openapi.json` from factory-skills at a pinned commit.** Rejected as fragile: the pin drifts from the factory actually running beside the dashboard, and the server already publishes its contract.
- **Generate types on the fly (gitignored).** Rejected: every worktree install and validation run would depend on the server being up, and contract changes would not show as reviewable diffs.
- **Keep the SQLite reader during a staged migration.** Rejected: it cannot open schema ≥3 databases, so it would only display failures, and mixing two sources risks presenting two revisions as one.
- **Server-side event fan-out.** Rejected for now: one operator, few tabs; a passthrough is stateless.

## Consequences

- PRODUCT.md's read-only principle is replaced: the dashboard is a command center. The terminal remains a valid control path; both send the same commands.
- Tests no longer build scratch databases. Unit tests use fake `fetch` responses and typed fixtures (`satisfies components['schemas'][…]`); Storybook stories render components with realistic mock data in every state and run as tests. End-to-end tests never send commands to a real factory.
- Measurements the API does not supply are shown as unavailable and filed upstream on factory-skills, never reconstructed from internal state.
