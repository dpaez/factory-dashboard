# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers, software engineers, and AI engineers who personally run GEUT's factory (the Pi + factory-skills supervision system inside Docker sandbox compose kits). The dashboard is a personal operator companion: the same person drives tickets in the terminal (Herdr/Pi) and watches them in the browser alongside. Tone expectation: professional.

## Product Purpose

Visualize the state of a running software factory: ticket activity and progress through stages, blockers and items waiting for the user, and token/cost usage. It turns the factory's SQLite state into a calm, at-a-glance overview so the operator knows where to pay attention without reading terminal panes. Success means the operator can see, in seconds, which tickets are active, which need their input, how far each ticket has advanced, and what it is costing.

## Positioning

External observability accessory to GEUT's factory (sbx-shell-pi image + factory-skills), reading the factory's own state DB directly. Unlike generic agent-monitoring UIs, it speaks the factory's exact vocabulary (tickets, tasks, stages, statuses, review rounds, blockers, usage) and mirrors its real pipeline — no invented abstractions. It stays out of the control path: the terminal remains where work is directed.

## Operating Context

- The operator runs factory tickets through the supervised flow: plan → work → review → wrapup → done, with statuses active / waiting_for_user / blocked / failed / complete.
- State lives in one factory SQLite DB (`<factory root>/.factory/db/state.sqlite`), tables: meta, tickets, tasks, task_blocked_by, blockers, sessions, usage, events.
- The dashboard currently reads the DB server-side via drizzle-orm on page load (SvelteKit + adapter-node, `DB_URL` runtime env).
- Planned: an external local server that reads/watches the factory SQLite DB and pushes live updates to the dashboard over websockets (sketched in `factory-integration-idea.png`).
- Usage setting: browser window alongside the terminal during factory runs; the dashboard refreshes as tickets progress.

## Capabilities and Constraints

- **Read-only at least for the initial stage.** No in-dashboard responses to `waiting_for_user` or blockers; interaction stays in the terminal. Future control-surface work is explicitly undecided, not denied.
- **Single factory:** the current sandbox-compose setup means exactly one factory DB per dashboard deployment. Multi-factory/multi-project is out of scope for now.
- Surfaces today: overview (active count, cost/tokens, attention/blocked, workflow stage counts, tickets table), tickets list, ticket detail (stage progress, tasks, blockers, review verdict/round, usage, timeline, agent messages).
- Factory state v0 keeps verdicts, round counts, token and cost usage, and unresolved blockers; detailed reviews remain in Pi sessions — the dashboard must not pretend to hold data the state DB doesn't carry.
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
- `src/lib/db/drizzle/schema.ts` — real state model the UI is built against.
- `.env` — `DB_URL=file:../chan/.factory/db/state.sqlite` (example local factory root).
- Routes and components under `src/` implementing overview, tickets list, and ticket detail with seeded/mock-shaped data.
- Absences future work must not fabricate: no live websocket feed implemented yet, no real multi-user data, no testimonials/customers/benchmarks, no pricing, no published releases.

## Product Principles

1. **Observe first, control later.** Read-only clarity earns the operator's trust before any interaction is added.
2. **The state DB is the only truth.** The dashboard renders what the factory records — verdicts, rounds, usage, blockers — and invents nothing.
3. **Speak factory.** Exact vocabulary and pipeline shapes; no generic agent-monitoring metaphors.
4. **Answer "where do I look?" in seconds.** Blocked and waiting-for-user states are first-class; everything else supports them.
5. **Cost is a surface metric.** Token and USD usage belong on the main view, not buried in detail pages.

## Accessibility & Inclusion

No product-specific accessibility standard has been established. Light and dark modes are shipped and toggled manually; numeric data uses tabular figures.
