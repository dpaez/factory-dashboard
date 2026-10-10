# 2. Plan/task docs reach the dashboard through fstate, never the filesystem

Date: 2026-09-29

## Status

Superseded by ADR 0004 (2026-10). There is no `fstate serve` — the CLI it described no longer exists, and schema v2 stores `ticket_executions.plan_path` and `adr_path` as opaque paths, not content. The operative boundary stands unchanged: the dashboard does not read `.factory/` files. Doc rendering needs a transport that does not exist, so the UI shows paths and ids and never fabricates content.

## Context

Plan docs (`plan.md`) and task docs (`NN-task-*.md`) are durable markdown artifacts in the factory root (`<code-root>/.factory/tickets/<id>/`). The dashboard's drill-down should show them, but they are not in the state DB. The dashboard's Node process could read those files directly — the DB path even implies the root's location — but doc serving is specified as an (`fstate serve`) responsibility that does not exist yet.

## Decision

The dashboard never reads `.factory/` files. Doc content comes from fstate when it serves it (base URL configured, e.g. `DOCS_URL`); until then the UI degrades to task ids and plain links with no fabricated content. For design work, mocked docs are used and clearly isolated from production code paths.

## Consequences

- One owner of factory-root artifacts (fstate), one trust boundary; the dashboard stays a pure client of state + served docs.
- A `DOCS_URL`-shaped integration contract must be defined *with* the eventual `fstate serve` design — the dashboard side should keep it minimal (static markdown by ticket/task id).
- The degraded mode is permanent until fstate ships docs; reviewers should expect task ids, not file contents, in a live dashboard today.
- Revisit if docs move into the state DB instead (they were rejected there for size/churn reasons and because they are immutable artifacts, not state).
