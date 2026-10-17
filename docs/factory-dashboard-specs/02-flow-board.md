# Flow board components

## Repository composition

Replace the root overview's workflow summary/list with the operational board in `src/routes/+page.svelte`; keep `/tickets` as the existing list. Retain `PageProps`, `$props()` and `$derived()` route conventions. New feature components live under proposed `$lib/components/factory/`, with kebab-case filenames.

| Spec component | Concrete implementation |
| --- | --- |
| FlowBoardPage | Existing root route coordinates proposed `flow-board.svelte` |
| BoardSummary | Compact mono summary; reuse `info-card.svelte` only if full metric cards are needed, not a duplicate KPI row |
| AttentionStrip | Proposed `attention-strip.svelte`, composed from Card/Badge/Button; question text can reuse AgentMessage |
| FlowBoard / StageLane | Proposed `flow-board.svelte` / `stage-lane.svelte`; CSS grid and keyed Svelte each blocks |
| BacklogLane / BacklogCard | Proposed `backlog-lane.svelte` / `backlog-card.svelte`, local Card.*, Badge and Button |
| TicketCard | Proposed `ticket-card.svelte`; local Card surface with a semantic link or selection button and shared status badge |
| TaskProgress | Proposed `task-progress.svelte` using existing Progress and mono approved/total text |

Use callbacks such as `onselect`/`onstart` rather than network access inside cards. Stable keys combine factory identity, canonical ticket identity and execution. Local Card.Root renders a div; adding `onclick` alone does not make it keyboard-operable.

`work-card.svelte` is a fixed-width stage-count metric, not a ticket card or lane. Extract/reuse its intended count-change treatment in lane headings, or add a compact/fluid variant deliberately. Do not repeat its full h-16 count well above every lane.

## FlowBoardPage

**Responsibility:** combine operational overview, unstarted backlog, active executions, and the shared ticket inspector.

**Inputs:** query states for tickets, backlog and active agents; selected ticket; current capability; pending commands. **Outputs:** select ticket, start backlog item, open attention item, navigate to Stats.

The page coordinator fetches data and issues commands. Child components only receive display models and emit intent.

## BoardSummary

Displays open executions, active agents, and eligible backlog items. Labels are explicit: “in progress,” “agents running,” and “ready to start.”

- Count active agents from the agents read model; do not count running tickets as a substitute.
- Ready excludes umbrella issues and unresolved blockers according to the dashboard eligibility policy.
- If a source is unavailable, mark that count unavailable while retaining known counts.

**Acceptance:** counts update after reconciliation and never claim a partial list is a complete total.

## AttentionStrip

**Inputs:** attention items `{identity, reason, since, recommendedAction}`, selection, load/freshness state. **Output:** `onSelectTicket(selection)`.

- Summarize decisions, paused/failed work, and ready handoffs. Count distinct tickets; a ticket with multiple reasons contributes once to the headline.
- “Open next” uses a stable priority: unanswered decisions and failed/paused work first, then handoffs; oldest item first within a priority group.
- Repeated activation advances through unresolved items; resolving an item removes it from the queue.
- Use authoritative needs-user information where available. Add handoffs as a separate attention category rather than pretending they are unanswered questions.
- Empty state: “No attention needed.” Do not leave an active “Open next” button with no target.

**Acceptance:** the summary and destination agree; selection does not jump spontaneously when new events arrive.

## FlowBoard and StageLane

`FlowBoard` receives ordered lane models. `StageLane` receives its label, count, ticket models, and empty/loading/error state; emits ticket selection.

| Lane | Projection |
| --- | --- |
| Backlog | Tracker issues not yet admitted as factory tickets; separate data source |
| Plan | Current execution in planning |
| Work | Current execution in implementation |
| QA | Current execution in optional QA |
| Review | Current execution in review |
| Handoff | Wrap-up preparation and ready-for-handoff states, distinguished by badge |

Handoff is a product label, not a new API stage. Running wrap-up must say “Preparing handoff”; only validated handoff readiness says “Ready for handoff.” Completed/cancelled executions leave the active lanes, but an open inspector can retain their details.

QA stays visible when enabled or when a visible ticket has QA history/current activity. If QA configuration cannot be determined, use the preview's “optional” label rather than asserting it is disabled.

The current repository's `ExecutionStage` is only `plan | work | review | wrapup | done`; its schema-v2 read model cannot supply QA. Use the new API-backed stage model when enabling this lane. Do not cast `qa` into the old union or invent a zero count that claims support.

Preserve stage/status separately: a paused worker stays in Work. Review-to-Work movement can mean changes requested or the next task; display the actual reason when available. Do not infer it from direction alone.

Keep ordering stable within a lane, using entry time where available and a deterministic fallback such as ticket key. Do not reorder on each message or cost update. Unknown stages get a visible “Other” fallback with their raw label until the adapter is updated.

Use the repository grid breakpoints: one lane per row below md, three at md, six at lg. Shared max-width/gutters remain in the existing layout. The backlog divider uses `border-border`; cards and lane headings remain square and shadow-free.

**Acceptance:** one card per current execution; no dragging between lanes; empty lanes remain recognizable; a live move preserves ticket selection and keyboard focus.

## BacklogLane

**Inputs:** backlog items, freshness, capability, pending starts. **Outputs:** start, inspect sub-issues, refresh backlog.

Lives in the first column, separated by a subtle divider at desktop widths. A failed backlog read is contained to this lane; the rest of the factory remains usable.

Empty state: “Backlog clear.” Loading uses card-shaped placeholders. Failure offers retry and preserves stale items with a timestamp when available.

## BacklogCard

**Display model:** issue reference, title, labels (plain badges), source link, blockers, umbrella flag, available child references, start availability, command state. Selecting the card opens the Issue preview.

A backlog issue is unprocessed: no plan, tasks or stage outputs. Its labels (bug, enhancement, investigation, …) and description are its only context. Labels render as plain outline badges, never color-coded; the lane offers a label filter.

Start uses local `<Button variant="default">` (Beacon Yellow), and sub-issues use outline/ghost. Ready is a semantic availability label, not the terminal Clear state. Blockers use Signal Wait with ink text. New cards must not copy the legacy `bg-green-500`/white status styling.

| State | Content / action |
| --- | --- |
| Eligible | Ready badge; Start button |
| Blocked | Blocker reference(s); start unavailable with reason |
| Umbrella | Umbrella badge; sub-issue links; cannot start the umbrella |
| Submitting | Starting…; prevent repeated submission |
| Accepted, not yet observed | Start accepted; keep a pending representation until reconciliation |
| Start failed | Inline reason and retry when valid |
| Read only | Start unavailable; explain access requirement |

Blocking dependency restrictions are a dashboard policy based on backlog facts; the API remains the final authority. Starting a prerequisite does not automatically unblock a dependent issue. Refresh the tracker relationship.

Umbrella detection is documented; child-list availability must be verified. If child references are not returned, link to the source issue rather than inventing children.

**Start sequence:** emit the source reference → submit once → show acceptance → fetch ticket and backlog → remove backlog representation and show the returned ticket in its authoritative lane. Deduplicate across the two sources during this handoff.

**Acceptance:** Start moves an eligible item to Plan when the server confirms that stage; delayed launches are not shown as running; rejected starts retain their source card; duplicate clicks cannot create duplicate work.

## IssuePreview

**Placement:** the same region below the board as the TicketInspector; selecting a backlog card or a ticket card behaves identically. Content is a separate component, not an inspector mode.

**Display model:** display reference, title, labels, tracker link ("Open in tracker", external), blockers and sub-issues as links, start availability and command state. Planned when the API supplies them ([factory-skills issue](https://github.com/geut/factory-skills/issues) — backlog issue details): author, created/updated time, and the description rendered as markdown. Until then those fields render **Unavailable** with the tracker link; fixtures and stories include them so the full layout is designed.

**After Start:** the preview shows “Starting…”. When the accepted command's ticket key appears in a read, the same selection becomes that ticket's inspector (Plan lane). Rejected starts keep the preview and show the reason.

## TicketCard

**Display model:** identity, display reference, title, current stage/status, current task summary, approved/total tasks, review round, entered-stage timestamp or unknown, known spend, attention reason, selected state.

**Output:** `onSelectTicket(identity)`; the whole card is one accessible selection control.

Content priority:

1. Reference and title.
2. Status/attention badge.
3. Current task summary.
4. Approved-task progress.
5. Stage age, review round when relevant, and known cost.

Keep stage age and review round simultaneously available; they answer different questions. Progress measures approved tasks, not stage completion. During planning, unknown task count reads “Planning tasks,” never “0/0 complete.”

Do not include nested Stop/Cancel buttons inside the clickable card. Those operations belong to the inspector. Missing cost reads “Unavailable,” not `$0.00`.

Reuse the existing title/type and cost-cell behavior where appropriate, with explicit null handling and mono numbers. Ticket statuses go through a shared mapping used by `tickets-table-status-cell.svelte` as well as the board. Do not create another independent label/color map.

Existing `TicketListRow` supplies opaque ID, execution ID, title/type/source, stage/status, cost and updatedAt. It does not supply task progress, active run, stage-entry time or review round. Populate those from API summaries/detail facts; `updatedAt` is not a stage-entry timestamp. The UI must omit or mark unavailable unsupported fields during migration.

**Acceptance:** long titles wrap; selection survives a stage change; status is announced textually; latest task and round correspond to the current execution.

## Optional next increment: stage-age signal

Not required for the initial implementation. Compare current stage age with historical durations for the same stage and comparable workload. Show the elapsed age plus a labeled threshold only when sample size and timing facts are adequate. Paused time must not be confused with active stage time. Do not invent an arbitrary “stuck” threshold.
