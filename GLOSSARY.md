# Glossary

The domain vocabulary of the Factory Dashboard. Terms here are conceptual; implementation details live in code and specs.

## Turn

Whose move it is on a ticket at this moment. Derived, never stored. Exactly one of **needs attention**, **running**, or **stalled** (done tickets are out of the turn question entirely).

## Needs attention

A ticket whose Turn is the operator: execution status `waiting_for_user`, or an open **attention request** the operator must answer (kind `agent_question`, `policy_limit`, or `manual_approval`; status `open`). The machine is paused on something *the operator* can act on. The only state that leads the overview.

## Running

A ticket whose Turn is the agents: execution status `active`, `queued`, `paused`, or `resuming` with no open attention request. Work is progressing or parked without owing the operator anything.

## Stalled

A running ticket whose work is stuck without anything the operator can act on — e.g. a `blocked` task with no open attention request, or a `resume_failed` / `failed` execution the operator has not been asked about. The machine is stuck, but acting now would not help. Rendered as a modifier on a running ticket, never as its own bucket.

## Handoff

The wrap-up output that transitions a ticket to human ownership: the pull request and the supervisor's last message. The dashboard shows the handoff; it does not produce one (the dashboard is read-only).

## Plan doc / Task doc

The durable markdown artifacts a ticket's planning produced (`plan.md`, per-task files). They belong to the factory root; state v2 records them only as opaque paths (`ticket_executions.plan_path`, `ticket_executions.adr_path`, `tasks.task_file`). No doc-serving transport exists, so the dashboard shows the paths and ids and never fabricates content — and it never reads the filesystem itself (ADR 0002, as superseded by ADR 0004).

## Ticket execution

One generation of running a ticket (`ticket_executions`). A ticket can be executed more than once; exactly one execution is current, and it carries the stage, status, worktree, and usage the dashboard renders.

## Attention request

A question or approval the factory raised that needs the operator (`attention_requests`): kind `agent_question`, `policy_limit`, or `manual_approval`; status `open` until `answered`, `resolved`, or `cancelled`. Replaces the legacy "blocker with an owner" model.

## Ticket summary

The ticket-level "what's done" statement shown at the top of a ticket's detail. Interim source: the ticket's latest message. Durable source: a persisted summary recorded at wrap-up (upstream requirement in factory-skills).

## Stage

Where a ticket execution sits in the pipeline: `plan`, `work`, `review`, `wrapup`, `done`. A position, not a condition. (Agent sessions carry the same stage values minus `done`.)

## Status

The ticket execution's condition: `queued`, `active`, `waiting_for_user`, `paused`, `resuming`, `resume_failed`, `failed`, `ready_for_handoff`, `complete`, `cancelled`. A condition, not a position. Turn is derived from status *plus* open attention requests. Tasks have their own status vocabulary: `pending`, `working`, `ready_for_review`, `reviewing`, `done`, `blocked`, `cancelled`.

## Review pressure

How hard a task has fought through review: round count, verdict, finding counts. Signals quality risk on a task before it is done.

## Context pressure

How close a running session is to exhausting its context window (`agent_sessions.context_percent`). A ticking clock the operator may need to act on before an agent run degrades.

## Event

A row in the factory's revision-ordered `events` log. `events.revision` filtered to `direction = 'domain'` is the change cursor a future live-update transport would resume from (ADR 0004); no transport exists yet, so events are not a dashboard surface today. The SQLite state remains the source of *what is*.

## Factory root

The repo-local `.factory/` directory holding one factory's state and ticket artifacts. One dashboard watches exactly one factory root (via its state DB).

## Operator

The single human user of this dashboard: the developer running the factory in a terminal elsewhere. The dashboard informs the operator; control lives in the terminal.
