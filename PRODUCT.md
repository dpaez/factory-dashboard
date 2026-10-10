# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers, software engineers, and AI engineers who personally run GEUT's factory (the Pi + factory-skills supervision system inside Docker sandbox compose kits). The dashboard is a personal operator companion: the same person drives tickets in the terminal (Herdr/Pi) and watches them in the browser alongside. Tone expectation: professional.

## Product Purpose

Visualize the state of a running software factory: ticket activity and progress through stages, attention requests waiting for the operator, and token/cost usage. It turns the factory's SQLite state into a calm, at-a-glance overview so the operator knows where to pay attention without reading terminal panes. Success means the operator can see, in seconds, which tickets are active, which need their input, how far each ticket has advanced, and what it is costing.

## Positioning

External observability accessory to GEUT's factory (sbx-shell-pi image + factory-skills), reading the factory's own state DB directly. Unlike generic agent-monitoring UIs, it speaks the factory's exact vocabulary (tickets, ticket executions, tasks, stages, statuses, review rounds, attention requests, usage) and mirrors its real pipeline — no invented abstractions. It stays out of the control path: the terminal remains where work is directed.

## Operating Context

- The operator runs factory tickets through the supervised flow: stages plan → work → review → wrapup → done, with the ten execution statuses queued / active / waiting_for_user / paused / resuming / resume_failed / failed / ready_for_handoff / complete / cancelled.
- State lives in one controller-owned factory SQLite DB (`<project>/.factory/db/state.sqlite`, state schema version 2), tables: tickets, ticket_executions, tasks, task_dependencies, agent_sessions, agent_runs, attention_requests, usage_snapshots, events, plus six dashboard views (current_ticket_executions, latest_usage_by_session, execution_usage_totals, execution_usage_by_stage, open_attention, ready_task_frontier).
- The dashboard reads the DB server-side on page load (SvelteKit + adapter-node, `DB_URL` runtime env) over a read-only `node:sqlite` connection, with hand-written SQL against the controller's views and a hard guard rejecting anything that is not schema version 2 (ADR 0004).
- Cost and token usage are stored as integer USD micros and converted to USD on read, in a single helper.
- Planned: an external local server that reads/watches the factory SQLite DB and pushes live updates to the dashboard over websockets (sketched in `factory-integration-idea.png`).
- Usage setting: browser window alongside the terminal during factory runs; the dashboard refreshes as tickets progress.

## Capabilities and Constraints

- **Read-only at least for the initial stage.** No in-dashboard responses to `waiting_for_user` statuses or attention requests; interaction stays in the terminal. Future control-surface work is explicitly undecided, not denied.
- **Single factory:** the current sandbox-compose setup means exactly one factory DB per dashboard deployment. Multi-factory/multi-project is out of scope for now.
- Surfaces today: overview (active count, cost/tokens, open attention requests, workflow stage counts, tickets table), tickets list, ticket detail (stage progress, tasks and dependencies, attention requests, review verdict/round, usage by stage, sessions, agent messages).
- Factory state v2 keeps verdicts, round counts, token and cost usage, and attention requests; detailed reviews remain in Pi sessions — the dashboard must not pretend to hold data the state DB doesn't carry.
- Stack: SvelteKit (Svelte 5), TypeScript, Tailwind CSS 4, shadcn-svelte/bits-ui, TanStack Svelte Table, drizzle-orm (rc), pnpm.
- Terminology follows the factory-skills vocabulary table: factory (the system, never a work item), ticket, task, supervisor, stage, status, worktree, factory root, ticket directory.

## Brand Commitments

- Name: Factory Dashboard (working title; header currently labels the product "Chan").
- Professional, developer-tool voice; concise, factual copy. Phrasing patterns from factory-skills apply, e.g. "Ticket PROJ-123 is waiting for user input"; never call a ticket "a factory".
- An incumbent visual implementation exists (shadcn-svelte-based, light/dark); refinements preserve it unless the user declares a redesign.

## Evidence on Hand

- `README.md` — product intent, stack, planned websocket observer server.
- `Screenshot.png` — current dashboard appearance.
- `factory-integration-idea.png` — planned integration sketch (external observer server → websockets → dashboard).
- `src/lib/server/read.ts` and `src/lib/server/types.ts` — the read module and typed row shapes the UI is built against; `test/fixtures/state-schema.sql` — vendored copy of the controller's reference schema (state schema version 2, provenance in its header).
- `.env` (untracked) — `DB_URL=/absolute/path/to/<project>/.factory/db/state.sqlite` (example local factory root; see README “Development data”).
- Routes and components under `src/` implementing overview, tickets list, and ticket detail with seeded/mock-shaped data.
- Absences future work must not fabricate: no live websocket feed implemented yet, no real multi-user data, no testimonials/customers/benchmarks, no pricing, no published releases.

## Product Principles

1. **Observe first, control later.** Read-only clarity earns the operator's trust before any interaction is added.
2. **The state DB is the only truth.** The dashboard renders what the factory records — verdicts, rounds, usage, attention requests — and invents nothing.
3. **Speak factory.** Exact vocabulary and pipeline shapes; no generic agent-monitoring metaphors.
4. **Answer "where do I look?" in seconds.** Open attention requests and waiting-for-user states are first-class; everything else supports them.
5. **Cost is a surface metric.** Token and USD usage belong on the main view, not buried in detail pages.

## Accessibility & Inclusion

No product-specific accessibility standard has been established. Light and dark modes are shipped and toggled manually; numeric data uses tabular figures.
