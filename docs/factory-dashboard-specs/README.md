# Factory dashboard — component specifications

Design baseline: the refined Flow board explored in this conversation, adapted to `dpaez/factory-dashboard` on 17 October 2026. Status: proposed implementation contract for the existing Svelte 5 / SvelteKit / Tailwind 4 / shadcn-svelte application. Product behavior comes from the refined board; visual treatment and implementation conventions come from the repository's DESIGN.md and inspected source.

## Specification map

| Specification | Owns |
| --- | --- |
| [Foundations and integration](01-foundations.md) | Composition, data boundaries, commands, live updates, shared states, visual rules |
| [Flow board](02-flow-board.md) | Backlog, stages, attention, ticket cards, starting work |
| [Ticket workspace](03-ticket-workspace.md) | Inspector, actions, tasks, runs, evidence, usage, new-ticket form |
| [Stats](04-stats.md) | Cohorts, token accounting, timing, quality, efficiency, configuration comparison |
| [Repository adaptation and reuse map](05-repository-adaptation.md) | Existing component contracts, additions, design drift, route placement, API migration |
| [OpenAPI integration](06-openapi-integration.md) | Schema sync, generated types, server client, commands, errors, SSE, drift checks |

## Composition

```text
FactoryDashboard
├── ApplicationShell
│   ├── FactoryHeader + ConnectionStatus
│   ├── PrimaryNavigation [Flow board | Tickets | Stats]
│   └── CommandFeedback
├── FlowBoardPage
│   ├── BoardSummary
│   ├── AttentionStrip
│   ├── FlowBoard
│   │   ├── BacklogLane → BacklogCard
│   │   └── StageLane[] → TicketCard → TaskProgress
│   └── TicketInspector
│       ├── TicketHeader + TicketActionBar
│       ├── ReplyComposer / CancellationConfirmation
│       └── Tasks | Activity | Evidence | Usage
├── TicketComposer
└── StatsPage
    ├── CohortSummary + MetricSummaryRow
    ├── TokensByStage → StageTokenDetails
    ├── TimeBreakdown
    ├── TicketsQuality → ContributingTickets
    ├── EfficiencySignals
    ├── ConfigurationComparison
    └── MeasurementNotes
```

## Product decisions

- Backlog is the first board lane. Starting an eligible item moves it to Plan after authoritative confirmation.
- The remaining lanes are Plan, Work, QA, Review, and Handoff. Stage and execution status remain distinct.
- The controller owns stage transitions. Work, QA, and Review can repeat for each task; cards are not draggable between stages.
- Ticket operations live in one shared inspector. Stats drill-down opens that same inspector.
- Stats replaces Insights. Tickets Quality describes observable ticket outcomes, not an invented quality score.
- Keep the existing Tickets list; ticket deep links become `/tickets/[key]` (API ticket key). The board becomes the root view; Stats adds a route. Reuse the existing logo, theme toggle, outline navigation, and metric/table components.
- Apply the repository's Control Room design: zero-radius surfaces, no shadows, Beacon Yellow actions, five semantic status signals, and JetBrains Mono measurements. The preview's rounded green styling is superseded.
- Demo controls, static fixture values, and “Advance sample event” are excluded from the application.

## Implementation slices

1. Reuse and extend local primitives and application components; add required form/tab/dialog primitives using the existing shadcn configuration. Build component states as Storybook stories with mock data typed from the API.
2. Introduce the factory HTTP API adapter using the [OpenAPI integration contract](06-openapi-integration.md) and switch every route off SQLite in one change ([ADR 0005](../adr/0005-factory-api-client-and-command-center.md)).
3. Connect the root board and extracted ticket inspector to API reads and event invalidation. Preserve the Tickets route and encoded identity handling.
4. Add Backlog/new-ticket start and ticket commands with accepted/pending/resolved feedback.
5. Add Stats using confirmed API facts; expose unsupported measurements as unavailable until the necessary facts exist.

Components can be built independently against view models. Use Svelte 5 `$props`, `$derived`, snippets and callback props, as the repository does. Integration adapters translate generated API types into those models; no component imports database runtime code or implements the controller state machine. Existing type-only imports from `$lib/server/types` are safe but represent the old database contract and require deliberate adaptation.

## Sources and limits

The API baseline is the [repository README](https://github.com/geut/factory-skills#api), [stats.v1 definitions](https://github.com/geut/factory-skills/blob/main/docs/stats-v1.md), and current [OpenAPI contract](https://github.com/geut/factory-skills/blob/main/openapi.json). The dashboard generates its types from the running factory's `GET /openapi.json` and commits the snapshot and generated types so the contract diff is reviewable ([ADR 0005](../adr/0005-factory-api-client-and-command-center.md)). These specs distinguish API response types from proposed client models and measurements that need additional facts.

The original preview demonstrates composition and interactions. Its sample task dependencies, usage allocations, counts, and instant command completion are not production behavior.

Repository inspection covered [DESIGN.md](https://github.com/dpaez/factory-dashboard/blob/main/DESIGN.md), `components.json`, `package.json`, all application components in `src/lib/components`, installed primitive directories, `layout.css`, layout/overview/detail routes, server types/client and ADR 0004. See the [reuse map](05-repository-adaptation.md) for source links and observed limitations. These are specification changes only; repository code and the earlier interactive preview have not been changed.
