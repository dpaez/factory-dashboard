# 1. Dashboard reads SQLite directly; fstate server is events-only

Date: 2026-09-29

## Status

Superseded by ADR 0004 (2026-10). There is no `fstate server` — the CLI it described no longer exists. Direct SQLite reads remain the decision, but they are now **read-only** (`node:sqlite` `readOnly: true`) against the controller's six dashboard views, and the change cursor is `events.revision` filtered to `direction = 'domain'` (indexed by `dashboard_events`). No notification transport exists yet; the SSE subscription described here was never built.

## Context

The dashboard needs factory state (tickets, tasks, blockers, sessions, usage) and needs to know when that state changes. Two candidate architectures: route all data through the `fstate server` HTTP process, or keep direct SQLite reads and use the server only for notifications. The existing `fstate server` (`fstate cli.mjs server`) serves `/health` and an SSE `/events` stream derived from the `events` table, but exposes no data endpoints.

## Decision

The dashboard queries the factory SQLite DB directly (as it does today via drizzle) and subscribes to `fstate server`'s SSE `/events` purely as an invalidation signal, resuming with `Last-Event-ID`. The server remains events-only until it earns data endpoints.

## Consequences

- Reads stay fast, local, and framework-free; no HTTP round-trip per query and no second implementation of query logic in the server.
- The dashboard and the server must point at the same factory root; a stale direct read between event and refetch is bounded by event delivery latency, which is acceptable for a read-only monitor.
- If the dashboard is ever deployed off-host (remote DB), this decision must be revisited — that is the scenario the fstate-server-serves-everything alternative was kept for.
