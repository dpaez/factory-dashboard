# Factory Dashboard

The operator's command center for one factory: it shows where every ticket is, what needs a person, and what it costs, and sends the factory's commands on the operator's behalf. Factory terms follow the factory's own vocabulary ([factory-skills CONTEXT.md](https://github.com/geut/factory-skills/blob/main/CONTEXT.md)); this glossary adds only what the dashboard needs and pins the choices where the two could drift.

## Language

### People and systems

**Operator**:
The person using the dashboard to watch and direct the factory. Commands record the operator's name on behalf of the dashboard's API client, when one is configured.
_Avoid_: user, admin

**Factory server**:
The long-running process that owns the controller and serves the factory API. It is the dashboard's only source of truth.
_Avoid_: backend, daemon, database

**API client**:
A named holder of a factory server token. The dashboard is one API client (`dashboard`); every command it sends is recorded with that client as actor.
_Avoid_: app, consumer

### Work items

**Issue**:
A work item in the tracker that the factory has not started. It has no plan, tasks, or stage outputs yet; its labels, description, and author are its only context. Starting it puts it on the factory line as a ticket.
_Avoid_: ticket, backlog ticket, before the factory owns it

**Backlog**:
The issues in scope for the factory that are not yet tickets.

**Backlog issue**:
An issue in the backlog, as shown on the Flow board.
_Avoid_: backlog ticket, backlog item

**Umbrella issue**:
An issue with sub-issues. It cannot be started itself; its sub-issues can.
_Avoid_: epic, parent ticket

**Blocked issue**:
A backlog issue another open issue blocks. Starting it is discouraged until the blocker closes.

**Ticket**:
An issue, or a written brief, that the factory has started.
_Avoid_: issue, once the factory owns it; card (that is the board's rendering)

**Ticket key**:
The factory's stable identity for a ticket, used in every read and command.
_Avoid_: ticket id, slug, issue number

**Display reference**:
The human label of a ticket or issue, such as `owner/repo#42`. Not unique across repositories, so never an identity.
_Avoid_: key, id

**Execution**:
One generation of a ticket. A rerun starts a new execution; exactly one execution is current, and earlier ones stay readable.
_Avoid_: generation (in UI copy), attempt

**Task**:
One unit of planned work inside an execution, with dependencies on other tasks. Work, QA, and review run once per task.

**Run**:
One attempt by an agent to produce a stage's output. A retry or correction is a new run, not a new execution.
_Avoid_: job, session, attempt

**Active agent**:
A run that is starting or running right now.
_Avoid_: running ticket (a ticket can be active with no agent running)

### Position and condition

**Stage**:
Where an execution sits in the pipeline: plan, work, QA, review, wrapup, or done (done applies to executions only). A position, not a condition. QA is optional and may be disabled for the factory.
_Avoid_: phase, step, lane

**Status**:
An execution's condition: queued, active, waiting for user, paused, resuming, resume failed, failed, ready for handoff, complete, or cancelled. A condition, not a position: a paused execution stays in its stage.
_Avoid_: state (in UI copy)

**Task status**:
A task's condition: pending, active, done, blocked, or cancelled. An active or blocked task is at a stage (work, QA, or review).

**Needs attention**:
A ticket the factory says is waiting on a person: waiting for a reply, paused, failed, or ready for handoff. The factory decides this; the dashboard never derives it. The attention reason says which of these it is.
_Avoid_: Turn, stalled, blocked, needs user (in UI copy)

**Attention request**:
A question, limit, or approval the factory raised for a person on a ticket: open until it is answered, resolved, or cancelled.
_Avoid_: blocker, owner

**Handoff**:
The end of a ticket's factory work: wrapup prepares it, and the ticket becomes ready for handoff with its pull request. Marking it complete records the handoff; it does not merge code.
_Avoid_: done, merged

### The board

**Flow board**:
The dashboard's root view: the backlog lane followed by one lane per stage, showing each current execution once.
_Avoid_: kanban (cards are not dragged)

**Lane**:
A column of the Flow board: Backlog, Plan, Work, QA, Review, or Handoff. The Handoff lane shows executions in wrapup or ready for handoff.
_Avoid_: stage (a lane renders a stage; Backlog and Handoff are not stages)

**Inspector**:
The single place a ticket's execution is read and operated: tasks, activity, evidence, usage, and its commands. The board, the tickets list, and Stats all open the same inspector.
_Avoid_: drawer, modal, detail page

**Issue preview**:
What the board shows for a selected backlog issue, in the same place as the inspector: its tracker facts, blockers, sub-issues, and Start. Once started, the selection becomes the new ticket's inspector.
_Avoid_: inspector (an issue has no execution to inspect)

**Source**:
The issue (or written brief) a ticket was started from, as the tracker holds it. Shown in the inspector with a link to the tracker, so what was asked can be compared with what was planned.
_Avoid_: origin, brief (unless it was written in the dashboard)

### Commands

**Command**:
An operator's request to the factory: start, reply, retry, stop, cancel, complete, or rerun (see the factory vocabulary for each). The factory server alone decides whether a command is valid.
_Avoid_: action (in prose), mutation

**Accepted command**:
A command the factory has recorded but whose effect has not yet been observed. Accepted is not done: a start can be accepted and its agent launch still fail.
_Avoid_: success, completed

**Event**:
A revision-ordered notice that something on the factory changed. It names what changed, never the new state; the dashboard rereads what it names.
_Avoid_: update, message, push

### Measurement

**Factory stats**:
Measures of how well the factory turns tickets into merged pull requests, under the factory's published stats definitions.
_Avoid_: metrics, analytics, insights

**Cohort**:
The tickets a stats view covers, selected by start time within a window. Every figure on a stats view describes the same cohort.
_Avoid_: dataset, sample (unless a figure deliberately narrows it)

**Unavailable**:
A measurement the factory does not supply or cannot supply completely. Shown as unavailable, never as zero.
_Avoid_: zero, n/a, empty

**Review pressure**:
How hard a task has fought through review: rounds, review verdict, and finding counts.

### Artifacts

**Plan doc / Task doc**:
The durable documents a ticket's planning produced. The dashboard shows their references and never fabricates their content; it has no way to read them yet.
