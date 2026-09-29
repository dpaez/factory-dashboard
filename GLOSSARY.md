# Glossary

The domain vocabulary of the Factory Dashboard. Terms here are conceptual; implementation details live in code and specs.

## Turn

Whose move it is on a ticket at this moment. Derived, never stored. Exactly one of **needs attention**, **running**, or **stalled** (done tickets are out of the turn question entirely).

## Needs attention

A ticket whose Turn is the operator: status `waiting_for_user`, status `failed`, or a blocker owned by `user`. The machine is paused on something *the operator* can act on. The only state that leads the overview.

## Running

A ticket whose Turn is the agents: status `active` with no user-owned blocker. Work is progressing or parked without owing the operator anything.

## Stalled

A running ticket that is `blocked` with blocker owner `agent` or `external`. The machine is stuck, but acting now would not help. Rendered as a modifier on a running ticket, never as its own bucket.

## Handoff

The wrap-up output that transitions a ticket to human ownership: the pull request and the supervisor's last message. The dashboard shows the handoff; it does not produce one (the dashboard is read-only).

## Plan doc / Task doc

The durable markdown artifacts a ticket's planning produced (`plan.md`, per-task files). They belong to the factory root, are served by fstate, and the dashboard only ever *links or renders what fstate serves* — it never reads the filesystem itself.

## Ticket summary

The ticket-level "what's done" statement shown at the top of a ticket's detail. Interim source: the ticket's latest message. Durable source: a persisted summary recorded at wrap-up (upstream requirement in factory-skills).

## Stage

Where a ticket sits in the pipeline: `plan`, `work`, `review`, `wrapup`, `done`. A position, not a condition.

## Status

The ticket's condition: `active`, `waiting_for_user`, `blocked`, `failed`, `complete`. A condition, not a position. Turn is derived from status *plus* blocker ownership.

## Review pressure

How hard a task has fought through review: round count, verdict, finding counts. Signals quality risk on a task before it is done.

## Context pressure

How close a running session is to exhausting its context window (`contextPercent`). A ticking clock the operator may need to act on before an agent run degrades.

## Event

A row in the factory's revision-ordered `events` log. The dashboard's only liveliness signal: events say *what* changed; the SQLite state remains the source of *what is*.

## Factory root

The repo-local `.factory/` directory holding one factory's state and ticket artifacts. One dashboard watches exactly one factory root (via its state DB).

## Operator

The single human user of this dashboard: the developer running the factory in a terminal elsewhere. The dashboard informs the operator; control lives in the terminal.
