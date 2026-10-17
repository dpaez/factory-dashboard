# Foundations and integration

Implementation target: the existing SvelteKit app. Read this with the [repository adaptation](05-repository-adaptation.md) and [OpenAPI integration](06-openapi-integration.md); the abstract component names below map to local `.svelte` files and existing shadcn primitives.

## Ownership boundaries

| Layer | Owns | Must not own |
| --- | --- | --- |
| API adapter / dashboard server | Factory token, typed requests, error mapping, usage normalization | Visual component state |
| SvelteKit route / feature coordinator | Server loads, feature state/cache, event invalidation, command reconciliation | Controller transitions or fabricated facts |
| Domain selectors | Lane projection, attention queue, eligibility presentation, metric derivations | Network calls or side effects |
| UI components | Rendering, local expansion/selection, draft input, intent callbacks | Direct factory calls, token storage, SQLite access |

The server remains authoritative about whether a command is valid. A client eligibility selector can disable an action but cannot grant a transition the server rejects.

Use `PageServerLoad` for initial data, `$env/dynamic/private` for factory configuration, and server-only API calls under `$lib/server/factory/` (proposed). Same-origin SvelteKit handlers expose only the required reads/commands/event stream. Keep database runtime modules out of browser imports. No new client query library is required; use SvelteKit invalidation plus a small Svelte 5 feature controller/context for pending commands and selection.

The SQLite read path (`getDb()`/`getOverview()`/`getTicketList()`, `db.ts`, `client.ts`, `read.ts`, the vendored schema and scratch-database fixtures) is removed in one switch, not page by page (ADR 0005). It cannot open a current factory database, so there is no legacy adapter to keep.

## Shared view-model conventions

These are proposed client contracts, not literal API response shapes.

```ts
type EntityIdentity = {
  factoryId: string;
  ticketKey: string;
  execution: number;
};

type QueryState<T> = {
  data: T | null;
  phase: 'loading' | 'ready' | 'error';
  stale: boolean;
  updatedAt: string | null;
  error: { code: string; message: string } | null;
};

type ActionAvailability = {
  enabled: boolean;
  reason?: string;
};

type TicketSelection = EntityIdentity & {
  tab: 'tasks' | 'activity' | 'evidence' | 'usage';
  runId?: string;
  taskKey?: string;
};
```

Use the server ticket key for identity. Display issue numbers are labels and may collide across repositories. Runs and executions are separate identities. A rerun creates a new execution; a retry creates a new run and does not imply a new ticket.

## ApplicationShell

**Inputs:** factory identity, selected page, connection state, read/act capability, attention count, command notices. **Outputs:** navigate, open ticket composer, retry connection.

- `FactoryHeader`: retain `logo.svelte`, the existing muted header band, and `toggle-mode.svelte`; add factory context/connection status without inventing another wordmark. Do not add a selector until multiple factories can actually be selected.
- `PrimaryNavigation`: retain the existing outline Button links; root Main becomes Flow board, Tickets remains, and Stats links to proposed `/stats`. New ticket is a separate primary action. Backlog is part of Flow board. Add `aria-current="page"` to route links.
- `ConnectionStatus`: connecting, connected, reconnecting, disconnected, authentication failure; include last successful refresh when stale.
- `CommandFeedback`: succinct status with ticket context. Validation errors stay with their form; unresolved command failures remain discoverable after a toast disappears.
- With read-only access, browsing remains functional and mutation actions explain that action access is required.

**Acceptance:** switching pages preserves selection and drafts; reconnecting is distinguishable from a healthy live connection; failed authentication never masquerades as an empty board.

## State ownership

| State | Owner / lifetime |
| --- | --- |
| Tickets, backlog, runs, stats | Shared query cache, keyed by factory and relevant parameters |
| Page, selected ticket/execution/tab, stats cohort | SvelteKit route/query state: `/tickets/[key]?execution=n&tab=…`, keyed by the API ticket key (encoded). Database-era execution-id links are not redirected |
| Expanded rows and selected token stage | Local feature state |
| Reply/new-ticket draft | Form state keyed to ticket/execution/question or composer instance |
| Pending mutation, idempotency key, accepted revision | Shared command coordinator; survives page switches |

Do not replace a dirty reply draft when a background event updates the ticket. If its question is no longer current, preserve the draft and explain why it cannot be sent to the old question.

## Command lifecycle

```text
idle → submitting → accepted / reconciling → observed result
               ↘ rejected
                        ↘ connection lost / outcome unconfirmed
```

1. Create one idempotency key for the user's command intent. Disable duplicate submission for that target while it is pending.
2. Submit through the dashboard server. A successful `202 {ticket, revision, message}` means accepted, not that an agent is already running.
3. Refetch the affected resource after acceptance and when relevant events arrive. Reconcile against authoritative stage/status/run data.
4. An event revision is an ordering/invalidation signal, not proof that dispatch succeeded. Keep “Starting…” until a read confirms the run or a failure.
5. After a network timeout, reuse the intent's key when retrying delivery. Do not issue a new intent simply because the response was lost.
6. For an invalid-state response, refresh the entity and show its current state. Preserve input where applicable.

A command can succeed while a subsequent launch fails. Represent both facts separately.

## API integration map

Routes below are documented in the inspected baseline. Obtain request/response types from the implementation-time OpenAPI schema.

| Feature | Route |
| --- | --- |
| Client capability | `GET /v1/me` |
| Board tickets / inspector | `GET /v1/tickets`, `GET /v1/tickets/{key}` |
| Backlog | `GET /v1/backlog`; explicit refresh uses `?refresh=true` |
| Active agents | `GET /v1/agents` |
| Run history / detail | `GET /v1/tickets/{key}/runs`, `GET /v1/runs/{id}` |
| Execution history | `GET /v1/tickets/{key}/executions`; documented execution selection on ticket/run reads |
| Start | `POST /v1/tickets` with `{ref}` or `{id, text}` |
| Reply / retry | `POST /v1/tickets/{key}/replies`, `POST /v1/tickets/{key}/retries` |
| Stop | `POST /v1/runs/{id}/stop` |
| Cancel / complete / rerun | `POST /v1/tickets/{key}/cancel`, `/complete`, `/reruns` |
| Live invalidation | `GET /v1/events` |
| Stats | `GET /v1/stats/summary`, `/stages`, `/configurations`, `/tickets`, `/export` |

Keep factory bearer tokens on the dashboard server. A browser communicates with that server. Read capability and act capability affect UI affordances, while server authorization enforces access. Generate the route/request/response types from the running factory's `GET /openapi.json` into a committed snapshot and `.d.ts` (`pnpm api:sync`); do not hand-maintain a parallel API type hierarchy.

## Live updates and partial failure

- Events identify changed resources; refetch them. Do not treat events as complete ticket objects.
- Track stream revision and resume with the documented cursor mechanism. Establish the stream/snapshot sequence so changes during initial loading are followed by a refetch.
- Coalesce bursts; cancel or ignore stale fetch responses using query sequencing. Do not let a late response overwrite a newer state.
- On reconnect, refetch visible resources to reconcile missed changes. Surface freshness rather than showing stale data as live.
- Backlog can be cached by the tracker. Starting an item invalidates both backlog and board queries.
- Independent panels fail independently. A stats failure must not disable ticket operations.
- Resolve pagination before claiming global totals or client-computed cohort metrics.

## Shared visual components

Use `$lib/components/ui/*/index.js` for primitives, `$lib/utils` `cn()` for class composition, and `@lucide/svelte` for icons. The installed primitives are badge, bubble, button, card, message, progress, separator, and table. Tabs, AlertDialog, Input, Textarea and Label are planned additions, not existing imports.

| Component | Contract |
| --- | --- |
| `StatusBadge` | Shared token mapping behind existing ticket/task status cells; label and tone, never color alone |
| `TaskProgress` | Approved / total counts, unknown total state; no percentage when denominator is missing |
| `MetricValue` | Reuse/extend info-card and info-cost-card presentations; unit, precision, availability, denominator |
| `AsyncState` | Loading skeleton, empty explanation, error/retry, stale-content indication |
| `MetricPanel` | Compose local Card.* and Svelte snippets; title, scope, body/detail; no fetching or calculations |
| `ContributingTickets` | Exact contributing records with selection callbacks and pagination |

## Visual and responsive contract — DESIGN.md takes precedence

- Reuse `src/routes/layout.css`: `--radius: 0rem`, square Card/Button/Input surfaces, no added shadows, gradients or blur. Only signal pills and timeline dots are rounded.
- Surfaces use `bg-background`, `bg-card`, `bg-muted`, `bg-accent`, Hairline borders and `ring-1 ring-foreground/10`. Do not copy the prototype's private `--fc-*` palette.
- Primary actions use Button's default Beacon Yellow/Beacon Ink pairing. Destructive uses its existing red wash variant. Do not use yellow for generic success or large decorative chart fills.
- Move status colors to centralized `--signal-*` tokens, with foreground counterparts and explicit `:root`/`.dark` assignments. Run/wait/standby chips use instrument ink; fault/clear use light ink. Existing raw Tailwind status classes are drift to fix, not reusable styling.
- Charts use the existing `--chart-1`…`--chart-5` Instrument Blue ramp. Labels and tables remain semantic foreground/muted-foreground.
- Every data number, ID, timestamp, token count and table cell uses `font-mono tabular-nums`. JetBrains Mono is already wired. Structure uses system sans, `text-4xl font-light` page headings and `text-2xl font-light` section headings; Roboto is imported but is not yet the sans token.
- Reuse `max-w-7xl`, `px-8` gutters, `gap-6` section rhythm and `Card.Root size="sm"` 12px spacing. Do not add the prototype's 8px rounding, 24px gutters or custom 860px/480px breakpoints.
- Board layout: `grid-cols-1 md:grid-cols-3 lg:grid-cols-6`, `gap-3`, `min-w-0` lanes; Tailwind md=768px, lg=1024px. Board cards fill lanes. Existing fixed metric-card widths remain defaults; add an explicit fluid option when a lane needs one.
- Stats summaries reuse the current centered one/three-column metric grid. Detailed panels use one column and `lg:grid-cols-2`. Ticket content retains `bg-card p-4 md:px-8` and `max-w-5xl` reading width.
- Opt component content out of the layout's typography plugin using `not-prose`. Do not add generic CSS that overrides every button/card underneath it.
- Preserve the intended 300ms work-count flash and 800ms timeline transition as the only new data-motion effects; implement reduced-motion variants and do not animate initial population. The work-card flash currently needs a real previous-value implementation.
- Retain ModeWatcher/ToggleMode; do not add another theme store or change persistence during this feature. Existing theme/icon/button micro-interactions are inherited rather than expanded.
- Preserve focus during keyed live updates. Use local shadcn/Bits UI keyboard behavior, visible focus and polite command announcements. Small desktop Button sizes remain; provide a shared coarse-pointer target treatment of at least 44px rather than isolated component overrides.
