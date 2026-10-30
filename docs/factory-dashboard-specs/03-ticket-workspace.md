# Ticket workspace components

## Repository composition

Extract reusable content from `src/routes/tickets/[slug]/+page.svelte` into proposed `$lib/components/factory/ticket-inspector.svelte` and focused children. Render it both from the detail route and the board's expanded region. The detail route becomes `/tickets/[key]` (API ticket key, `encodeURIComponent`-encoded) with `?execution=n&tab=…`; database-era `[slug]` links are not redirected (ADR 0005).

| Spec component | Reuse / addition |
| --- | --- |
| TicketHeader | Existing generation Badge, ticket status cell and detail-heading treatment |
| TicketActionBar | New component composed from existing Button variants |
| ReplyComposer | AgentMessage for question context; add local Label, Textarea, Button |
| CancellationConfirmation | Add shadcn AlertDialog; use local destructive Button styling |
| Tasks/Activity/Evidence/Usage tabs | Add local Tabs; preserve URL/tab state in the coordinator |
| TaskList | Extract the detail page's dependency-aware task rendering; reuse tasks-table-status-cell |
| RunTimeline | New run-history list; reuse agent-message.svelte for latest activity text |
| EvidencePanel | New composition of Card/Table/Badge backed by API run details |
| UsagePanel | Extract existing stage Table and adapt usage-list.svelte |
| TicketComposer | New component using added Input/Label/Textarea and existing Button |

The board wraps this same content in a non-modal drawer over the lanes. The ticket page renders it in the document. Do not rebuild the content for either placement.

The existing detail page already handles nullable executions, generation history, real task dependencies and null findings. Preserve these cases. Its “last review” heuristic chooses the highest round across tasks; that is not necessarily the current run's latest review. Replace that heuristic only when authoritative API task/run context is available.

## TicketInspector

**Responsibility:** inspect and operate one execution without losing its board or stats context.

**Inputs:** selection, ticket query state, run query states, available actions, pending commands. **Outputs:** close, select tab/task/run/execution, command intent.

On the board the placement is a drawer over the right side of the lanes: the page does not scroll, the drawer has its own scroll, and the lanes stay in view beside it (or can be scrolled clear of it). Opening does not move focus off the card. Closing, including Escape outside a text field, returns focus to the initiating control. A stats drill-down opens the same component with the relevant tab and retains a route back to the cohort.

Selected execution is explicit. Historical executions are readable; mutating controls target only an eligible current execution. Changing execution clears incompatible task/run selection, but not unrelated page state.

**States:** closed, loading, loaded, stale, not found, permission error, partial run-detail failure. Completion/cancellation removes the card from active lanes but does not force-close its inspector.

## TicketHeader

Displays title, source reference/link, execution number, stage, status, current task/round, and close control. A history control appears when previous executions are available. Show source/tracker warnings separately from execution failures.

**Source section:** the issue (or written brief) the ticket started from: `sourceRef`, an external “Open in tracker” link, and — once the API supplies them ([geut/factory-skills#61](https://github.com/geut/factory-skills/issues/61)) — labels, author, dates and the original description, so the operator can compare what was asked with what was planned. Fields the API does not yet return render Unavailable.

**Acceptance:** execution identity is visible after rerun; an old run is never presented as the active agent; ready for handoff is distinguishable from merged/complete.

## TicketActionBar

**Inputs:** action availability supplied by a selector, current execution, targeted run ID, command state. **Output:** a typed command intent. It does not infer the controller's next stage.

| Action | Target and effect | UI behavior |
| --- | --- | --- |
| Stop agent | Active run; stops its agent and pauses its ticket | Label the targeted agent/run; show Stop requested until observed |
| Retry run | Eligible current ticket; retries/relaunches according to server state | Explain that prior context is reused; do not call it a new execution |
| Send reply | Ticket waiting for a response | Use ReplyComposer; preserve answer on failure |
| Cancel execution | Eligible current ticket; ends this execution | Show CancellationConfirmation |
| Mark complete | Eligible handoff-ready ticket | Explain that this records completion and does not merge code |
| Rerun ticket | Complete, cancelled, or failed ticket, where supported | New execution; refresh source; retain earlier history |

Actual legal status combinations must come from the API contract/controller behavior, not the mock's few hard-coded labels. Show a disabled reason when an otherwise relevant action is unavailable. Hide actions that are unrelated to the current context.

If several stoppable runs are exposed, require a run selection; never silently stop an arbitrary one. Stop addresses a run endpoint, while cancel addresses the ticket.

**Acceptance:** read-only capability prevents mutations; commands cannot target a historical execution by accident; every action handles rejection, acceptance with delayed effect, launch failure, and lost connection.

## ReplyComposer

**Inputs:** question identity/context, asking stage and run, question text, draft, capability, submission status. **Outputs:** draft change, submit answer.

- Show the full question before the answer field. Include task/round context when available.
- Require a non-whitespace answer. Use “Send reply & resume” when that effect applies.
- Preserve the draft through background refresh and page/tab changes.
- Clear it only after confirmed acceptance for that question; if resume fails after acceptance, show that the answer was retained and offer the documented retry path.
- If another client answers first, refresh state and explain the conflict; do not redirect the draft to a different question.

**Acceptance:** empty answers cannot submit; a rejected reply remains editable; accepted answer and successful resume are distinguishable.

## CancellationConfirmation

**Inputs:** ticket/execution identity, optional reason draft, pending state. **Outputs:** confirm cancellation, dismiss.

Copy must explain the concrete effect: agents stop, open tasks/questions are cancelled, and the execution ends; branch, worktree, and pull request remain. Offer “Keep execution” and “Cancel execution.”

Use a proper dialog with focus containment and restoration, or the inline confirmation used by the preview with clear reading order. Confirmation is specific to the selected execution and expires if that selection changes.

For this repository, choose local shadcn AlertDialog as the implementation. It is not currently installed: add it using the existing mira/mist configuration and review generated styles against DESIGN.md. Keep the destructive action's pending state controlled so automatic dialog closure does not hide a rejected command.

**Acceptance:** dismissing performs no mutation; cancellation submission uses the same shared command lifecycle; failures do not falsely mark the ticket cancelled.

## Inspector content components

| Component | Inputs | Behavior / acceptance |
| --- | --- | --- |
| `TaskList` | Tasks, true dependency links, review state, selection | Show approved, active, pending and blocked states; dependency links select their task. Do not turn the real graph into a fictional sequential chain. Unknown graph has an explicit planning state. |
| `RunTimeline` | Paginated runs, purpose, stage, task, round, outcome, activity | Group by task/stage; select a run for details. Display latest assistant activity as latest activity, not a complete transcript. Earlier attempts remain distinguishable. |
| `EvidencePanel` | Selected run's validation/checks, findings, verdict, evidence references | Preserve pass/fail/not-run/unknown distinctions. Tie each finding to task/run/round. A missing artifact is unavailable, not passed. |
| `UsagePanel` | Execution and per-run/stage usage, measurement metadata | Show tokens, cost, and stage allocation with explicit units; reuse token normalization from Stats. Missing/partial usage remains labeled. |

Tabs: Tasks, Activity, Evidence, Usage. Lazy-load expensive run detail, but cache it by run ID and execution. A tab's error does not erase the rest of the inspector.

`usage-list.svelte` currently receives `TicketDetailSession[]`, displays four token categories, USD, context percentage and task status. Preserve that useful detail, but a session is not a run: do not pass API runs into it unchanged. Either adapt a supported session view or introduce a separately typed run-usage table. Fix its `usage?.costUsd ?? 0` presentation when adding partial/unknown API usage; unknown cost must remain `—`.

Reuse the visual language of `timeline.svelte` only for a clearly labeled lifecycle locator. It currently uses `steps`, `currentStep`, `totalSteps` and an 800ms Tween; it is not approved-task completion. Add QA conditionally, handle 0/1-step edge cases and unknown stages, and display current stage explicitly. Repeated Work/QA/Review visits belong in run history; a dot must not imply that a later task's review is already complete.

The API baseline exposes run summaries, latest validation, findings, usage, and latest activity. Full transcript, raw log download, diff, and screenshot/file viewers need confirmed retrieval contracts before becoming live controls. Do not link a server filesystem path as though the browser could open it.

## TicketComposer

**Responsibility:** start a ticket from either an existing issue reference or a text brief.

**Inputs:** selected source mode, draft fields, submission state, capability. **Outputs:** change draft, submit `{ref}` or `{id, text}`, cancel.

- Use explicit source modes: Issue reference and Written brief. Exactly one request shape is submitted.
- Source modes can use the same added Tabs primitive. Forms use Svelte 5 typed props/callbacks and server command handlers, not DOM queries copied from the prototype.
- Issue mode accepts the forms the API supports; source resolution errors belong next to the reference.
- Written-brief mode requires a non-empty ID and brief. The server owns canonical key generation and conflict validation.
- Submit label: Start planning. Cancel returns to the previous page with no mutation.
- After acceptance, use the returned ticket key to open the inspector and reconcile its state. Do not generate a fake issue number or immediately invent a running planner.
- Umbrella, tracker-unavailable, validation, permission, and duplicate/conflict responses need actionable messages. Preserve the entered brief on failure.

**Acceptance:** fields from the inactive mode are not sent; keyboard submission works; duplicate submission is prevented; retries do not duplicate the ticket.

## Integration scenarios

1. Open a running Work ticket, stop its active run, observe paused status, then retry and observe the new run.
2. Submit an answer, lose the network response, retry the same intent, and retain one accepted reply.
3. Cancel while a second client changes the execution; refresh and explain the authoritative outcome.
4. Open a ready handoff, mark complete, keep its inspector open, and remove its active card.
5. Rerun a finished ticket; display the new execution while preserving the earlier execution's evidence.
6. Navigate from a Stats contributor to its historical execution; show read-only details rather than the ticket's unrelated latest run.

7. Render the shared inspector inside the board and directly through the existing detail route; keyboard selection, encoded IDs and browser Back work in both placements.
8. Verify added Tabs/AlertDialog focus behavior and all statuses in both themes. Local primitives remain square; only badges and timeline dots are curved.
