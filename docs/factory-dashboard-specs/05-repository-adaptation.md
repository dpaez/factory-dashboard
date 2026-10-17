# Repository adaptation and reuse map

Inspected the public `main` tree of [dpaez/factory-dashboard](https://github.com/dpaez/factory-dashboard) on 17 October 2026. This document records observed source contracts and proposed changes; it does not claim the application was built or run.

## Precedence

1. The requested product behavior: a command center with integrated backlog and expanded Stats.
2. Repository DESIGN.md for visual constraints and local components for actual APIs.
3. Existing SvelteKit/Svelte 5 conventions and installed package versions.
4. The earlier interactive preview for information layout and interaction intent, not its CSS or mock data mutations.

The repo's current read-only product/architecture statements describe the existing application. The user's API-client direction is a deliberate next version, not a reason to remove Start/Stop/Cancel from these specs. Record the architecture change explicitly when implementing.

## Observed stack and configuration

From [package.json](https://github.com/dpaez/factory-dashboard/blob/main/package.json), [components.json](https://github.com/dpaez/factory-dashboard/blob/main/components.json) and source:

| Area | Observed configuration | Constraint |
| --- | --- | --- |
| Framework | Svelte `^5.56.1`, SvelteKit `^2.70.3`, adapter-node `^5.5.7` | Svelte 5 runes/snippets; SvelteKit server boundaries |
| Styling | Tailwind `^4.3.0`, typography plugin | Existing CSS variable theme and `not-prose` conventions |
| Components | shadcn-svelte `^1.6.1`, Bits UI `^2.18.0` | Extend local generated source; do not replace the design system |
| Registry style | `mira`, base color `mist`, TypeScript enabled | Preserve components.json; do not run a fresh initialization |
| Tables | `@tanstack/svelte-table ^9.2.4` | Reuse `createTable`, features, ColumnDef and FlexRender patterns; avoid v8 example APIs |
| Icons / theme | `@lucide/svelte`, `mode-watcher` | Retain existing icon and theme components |
| Tools | pnpm, Vitest, Playwright, svelte-check, Prettier | Use repository scripts for implementation validation |

These are manifest ranges, not claims about exact lockfile-resolved versions. Use the installed lockfile and component source when implementing.

Aliases: `$lib/components`, `$lib/components/ui`, `$lib/utils`, `$lib/hooks`, `$lib`. The hooks alias is configured; a hook directory was not part of the inspected library listing.

Installed UI directories: **badge, bubble, button, card, message, progress, separator, table**. New feature components go outside `ui`; reserve that directory for shared primitives.

## Existing application components

All paths in this table are relative to `src/lib/components/` and were inspected.

| Component | Current contract / behavior | Plan |
| --- | --- | --- |
| `logo.svelte` | FD mono wordmark and Lucide grid mark | Reuse unchanged |
| `toggle-mode.svelte` | Local outline icon Button, ModeWatcher toggle | Reuse; preserve accessible label |
| `info-card.svelte` | `$props`: title, value, subtitle; fixed metric widths | Reuse for summaries; type props and add availability/fluid options only where needed |
| `info-cost-card.svelte` | Numeric USD value plus input/output/cache-read/cache-write counts | Extend for partial/null values and exact/compact token formatting |
| `work-card.svelte` | title/value count card, muted background and intended beacon flash | Reuse count language; add compact variant or extract heading. Fix previous-value tracking before relying on flash |
| `light-card.svelte` | title and string/Snippet content; h-24 beacon-capped mini-card | Reuse for small live detail stats only; use ordinary Card for larger/static stats panels |
| `timeline.svelte` | steps/currentStep/totalSteps, Progress and Tween | Adapt lifecycle location, QA, unknown/degenerate cases and reduced motion; not task completion |
| `agent-message.svelte` | agentName, content, optional createdAt; Bubble/Message primitives | Reuse for question context and latest agent text |
| `usage-list.svelte` | sessions with model, task, usage, context%, task status | Preserve presentation; distinguish sessions from API runs, correct missing-cost display |
| `tickets-table.svelte` | data/columns; TanStack v9; row click navigates to encoded detail URL | Retain Tickets view; optional onselect callback for inspector/contributor use, with accessible row links |
| `tickets-table-columns.ts` | Existing TicketListRow column mapping | Keep for the legacy list; adapt deliberately to API view model; do not force new stats rows into it |
| `tickets-table-features.ts` | Filtering/sorting/pagination/selection feature definitions | Reuse v9 patterns; UI controls and server paging remain separate implementation work |
| `tickets-table-title-cell.svelte` | nullable title/type, optional type badge | Reuse null behavior; don't propagate its 8px type-badge text into new controls |
| `tickets-table-cost-cell.svelte` | number cost formatted as USD | Extend null handling when reused with partial API data; set mono explicitly outside table inheritance |
| `tickets-table-status-cell.svelte` | ten execution statuses plus unknown; raw palette classes | Retain labels and exhaustive mapping; delegate tone rendering to shared token-based status badge |
| `tasks-table-status-cell.svelte` | seven task statuses plus unknown; raw palette classes | Same shared token treatment, retaining task vocabulary |

Source inventory: [application components](https://github.com/dpaez/factory-dashboard/tree/main/src/lib/components), [installed primitives](https://github.com/dpaez/factory-dashboard/tree/main/src/lib/components/ui).

## New components and primitives

Proposed feature directory:

```text
src/lib/components/factory/
  flow-board.svelte
  stage-lane.svelte
  backlog-lane.svelte
  backlog-card.svelte
  ticket-card.svelte
  attention-strip.svelte
  task-progress.svelte
  status-badge.svelte
  connection-status.svelte
  command-feedback.svelte
  ticket-inspector.svelte
  ticket-actions.svelte
  reply-composer.svelte
  cancel-execution-dialog.svelte
  ticket-composer.svelte
  task-list.svelte
  run-timeline.svelte
  evidence-panel.svelte
  usage-panel.svelte
  stats/
    tokens-by-stage.svelte
    stage-token-details.svelte
    time-breakdown.svelte
    tickets-quality.svelte
    efficiency-signals.svelte
    configuration-comparison.svelte
```

This is a responsibility map, not a requirement to create a file for every trivial wrapper. Keep small headings and simple metric rows inline until reuse warrants extraction.

Add **Tabs, AlertDialog, Input, Textarea, Label** via the current local shadcn configuration. Audit generated primitives for zero radius, token colors, shadow removal, and Svelte 5 compatibility before use. Do not install Sidebar, Sheet, a new data-table library, a chart library, or a global query library for this design.

The [shadcn theming convention](https://www.shadcn-svelte.com/docs/theming) supports the project's surface/foreground variable pairs. Add new signal tokens in `:root`, `.dark`, and Tailwind's `@theme inline`; do not scatter raw color literals across components. [AlertDialog](https://shadcn-svelte.com/docs/components/alert-dialog) supplies the confirmation structure; use the project's local Button variants for its actions. Avoid older Svelte 4 builder APIs.

## Signal mapping

Centralize these semantic groups, retaining all labels. Resolve any new API vocabulary explicitly rather than falling through silently.

| Signal | Execution examples | Task examples | Ink |
| --- | --- | --- | --- |
| Run | active, resuming | working | Instrument ink |
| Wait | waiting_for_user, queued, ready_for_handoff | ready_for_review, reviewing | Instrument ink |
| Standby | paused, cancelled, unknown | pending, cancelled, unknown | Instrument ink |
| Fault | failed, resume_failed | blocked | Light ink |
| Clear | complete | done | Light ink |

This preserves the current code's useful groupings while applying DESIGN.md's five-signal tokens. Cancelled remains explicitly labeled and never becomes Clear. Queued may share Wait's tone but is not automatically a human-attention item. Attention eligibility is separate from badge color.

DESIGN.md mentions an older task label `in_progress`; current source uses `working`. Follow the actual typed vocabulary. The signal token definitions are proposed in DESIGN.md but absent from current layout.css; implementing them is a prerequisite, not a claim of existing support.

## Repository drift to handle in the implementation

- **Count flash:** `work-card` sets `lastValue = $derived(value)`, so its comparison does not retain a prior snapshot. Use real previous-count state and a bounded flash with cleanup; skip the first render and respect reduced motion.
- **Timeline:** current percentage and step-dot positions use different conventions; add endpoint tests. Include QA only with a compatible API model, and avoid showing prior stages as permanently complete through task loops.
- **Usage:** existing session usage can be null but renders missing cost as zero. Preserve unknown when adapting the API; never sum repeated cumulative usage snapshots.
- **Tables:** DESIGN.md says empty state is unimplemented, but current `tickets-table` already renders “No results.” Retain it. Pagination features exist without visible pagination controls; do not assume every server row is shown.
- **Statuses:** legacy palettes and white ink on all chips conflict with the new Two-Ink signal rule; migrate in one shared mapping.
- **Fonts:** Roboto is imported/tokenized but not assigned to `--font-sans`. Do not rebrand body typography as Roboto or change fonts as part of this feature.
- **Theme:** current code mounts ModeWatcher. Preserve it; do not infer a no-persistence guarantee from prose in DESIGN.md.

These are source-inspection findings to address when touched, not claims from a runtime test or requests to broaden the current specification task into a code rewrite.

## Routes and data migration

| Existing / proposed route | Responsibility |
| --- | --- |
| Existing `src/routes/+layout.svelte` | Reuse shell, logo, ToggleMode, Button navigation and Separator; add Stats and New ticket |
| Existing root `+page.server.ts` / `+page.svelte` | API-backed initial board snapshot and interactive board |
| Existing `/tickets` | Retain the list-oriented entry point and future finished-ticket history |
| `/tickets/[key]` (renamed from `[slug]`) | API ticket key, `?execution=n&tab=…`; render extracted inspector content directly |
| Proposed `/stats` | Cohort loads and Stats panels |
| Proposed `/api/factory/...` server handlers | Same-origin scoped reads, commands and SSE proxy; endpoint names finalized with the API adapter |

The current `src/lib/server/client.ts` opens `DB_URL` read-only, and ADR 0004 pins schema version 2. [ADR 0005](../adr/0005-factory-api-client-and-command-center.md) supersedes it: all command-center reads and commands go through the factory HTTP API. PRODUCT.md and README.md are updated in the migration ticket.

Proposed server adapter location: `$lib/server/factory/`. Keep public view models/generated API types separate from secrets/runtime code, e.g. `$lib/factory/`. Existing type-only imports from `$lib/server/types` are erased at runtime, but their schema-v2 assumptions must not silently become the API contract. The exact generation, client, proxy, error and drift-check contracts are in [OpenAPI integration](06-openapi-integration.md).

Identity is the API ticket key plus execution number; run IDs and tracker issue IDs stay distinct. Database ticket/execution IDs (colon-encoded today) disappear with the SQLite path; their deep links are not redirected.

Switch all routes to the API in one change and delete the SQLite path (`db.ts`, `client.ts`, `read.ts`, `types.ts`, `test/fixtures/state-schema.sql`, `test/seed.ts`, `test/scratch-db.ts`, drizzle and `DB_URL`). Do not keep a legacy page.

## Implementation validation

Use existing scripts: `pnpm check`, `pnpm lint`, `pnpm test:unit`, and scoped `pnpm test:e2e` for changed flows. No repository tests were run for this spec-only edit.

Validate Svelte prop types and callback contracts, token contrast in both themes, keyboard cards/row links, Tabs/dialog focus, unknown usage, encoded identities, repeated-stage progress, pending commands and live refetches. Replace the SQLite loader/read tests with API adapter/command tests using fake `fetch` and typed fixtures. Components are developed and tested in Storybook (SvelteKit framework, Svelte CSF) with realistic mock data built from the generated API types; stories run as tests through `@storybook/addon-vitest` inside `pnpm test`. End-to-end tests never send commands to a real factory.

Primary references: [DESIGN.md](https://github.com/dpaez/factory-dashboard/blob/main/DESIGN.md), [layout.css](https://github.com/dpaez/factory-dashboard/blob/main/src/routes/layout.css), [server types](https://github.com/dpaez/factory-dashboard/blob/main/src/lib/server/types.ts), [ADR 0004](https://github.com/dpaez/factory-dashboard/blob/main/docs/adr/0004-read-only-controller-views-pinned-schema.md).
