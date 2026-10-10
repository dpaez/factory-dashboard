# 4. The dashboard reads controller views over a read-only connection, against a pinned schema version

Date: 2026-10-09

## Status

Accepted. Supersedes ADR 0001 (events-only server) and ADR 0002 (docs via fstate), and amends ADR 0003 (no local state mutation).

The factory controller (`geut/factory-skills`, `src/state/schema.sql`) owns `state.sqlite` and is its only writer; it publishes six SQL views explicitly as the dashboard's read contract. The dashboard therefore opens that file with `node:sqlite` `readOnly: true`, queries the views with hand-written SQL and hand-written row types, and refuses to serve anything whose `schema_meta.schema_version` is not `2` — there is no migration path and no drizzle table mirror. Test fixtures are built by applying a vendored, provenance-stamped copy of the reference `schema.sql` (`test/fixtures/state-schema.sql`) to a scratch database, because `factory-skills` is private and unpublished, so a test run cannot depend on finding it on disk.

## Considered Options

- **Mirror the schema as drizzle `sqliteTable`/`sqliteView` definitions** (what the repo did for the legacy database). Rejected: it duplicates roughly two hundred columns owned by another repo, buys no safety because the dashboard never migrates or writes, and drifts silently when the controller changes. The views already encode the joins correctly.
- **Import the controller's `openStateDatabase({ readOnly: true })`** from factory-skills. Rejected: it makes the dashboard's runtime and its test suite depend on an unpublished private package being present at a checkout path, which breaks a plain `git clone && pnpm test`.
- **Resolve `schema.sql` from the installed factory-skills at test time** instead of vendoring. Rejected for the same reason; vendoring also makes the supported version a reviewable, diffable artifact.
- **Support both v1 and v2 databases** behind a compatibility shim. Rejected: the controller itself refuses to migrate a legacy database and tells the operator to back it up or remove it. A dashboard that quietly rendered stale v1 state would be worse than one that says "unsupported".

## Consequences

- Schema drift becomes a loud operator-visible rejection rather than a wrong number on a page. When the controller ships v3, the guard fires, and refreshing the vendored copy plus the read module is a deliberate, reviewed change.
- The read module's typed row shapes (`src/lib/server/types.ts`) — not a generated ORM type — are the contract the Svelte pages consume. Adding a field to a page means editing SQL and a type, not re-running introspection.
- Read-only is enforced by the operating system, not by convention: `PRAGMA journal_mode` and any write statement fail on the connection. This supersedes the "never mutate" half of ADR 0003 with something stronger, while reversing its "including scratch copies" clause: tests do create and populate scratch v2 databases, and the schema's own `CHECK` constraints and triggers are what keep those fixtures from describing impossible states.
- The vendored `schema.sql` copy must carry its source URL and commit SHA so a refresh is mechanical.
