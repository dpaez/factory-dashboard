# Stats components

## Repository composition

Add a proposed `src/routes/stats/+page.server.ts` / `+page.svelte` route; no Stats route exists in the inspected tree. Use `PageProps`, `$props()` and `$derived()` with server-prepared metrics. Place feature compositions under proposed `$lib/components/factory/stats/`.

| Spec component | Reuse / addition |
| --- | --- |
| MetricSummaryRow | Extend info-card.svelte for token/merge metrics and info-cost-card.svelte for cost with token footnotes |
| TokensByStage / StageTokenDetails | New composition of local Card/Table, semantic Buttons and simple bars using chart tokens |
| TimeBreakdown | New Card.* composition, mono durations and Instrument Blue bars |
| TicketsQuality / EfficiencySignals | New Card.* panels with mono data and explicit denominators |
| ContributingTickets | Extend existing tickets-table.svelte with optional selection callback, or reuse its Table/cell conventions with a dedicated row model |
| ConfigurationComparison | Local Table for simple rows; existing TanStack v9 feature conventions if sorting/pagination are required |
| MeasurementNotes | Native details/summary within a square semantic surface; no new accordion dependency needed |

The summary row is a fluid full-width strip (`InfoCard` `fluid`), not the centered fixed-width cards. Other routes keep the fixed metric-card widths. Tokens by stage and Time to handoff share `grid-cols-1 lg:grid-cols-2 gap-6`. All inherit `not-prose` where necessary.

Do not install a chart library for the simple bars in this design. Use the existing `--chart-1`…`--chart-5` tokens, with mono numeric labels and text legends. The prototype's green/purple/gold chart palette and rounded panels are superseded. Beacon Yellow remains reserved for actual activity/progress/actions, not general token or time bars.

## StatsPage and measurement boundary

Stats is a feature coordinator that supplies independently renderable panels. Each panel receives already-normalized facts/metrics and emits selection intents. Components must not each invent a different cohort, token total, or duration formula.

`CohortSummary` defines the factory, start-time window, observation time, definition version, factory versions, and counts. The baseline is the last 30 days, matching the preview. A date-range control can be added without changing the panel contracts.

Use the same `from`/`to` values across reads. A ticket belongs to the window by start time, not by merge time. Expose observation freshness; open-ticket cost can continue changing after the start window closes.

The API's ticket-versus-execution aggregation must be confirmed at implementation. Label the selected unit consistently, count it once, and never mix ticket-level outcomes with duplicated execution rows. Preserve execution identity for drill-down when the data provides it.

## Shared Metric contract

Proposed client view model:

```ts
type Metric = {
  key: string;
  label: string;
  value: number | null;
  unit: 'tokens' | 'USD' | 'ms' | 'count' | 'ratio';
  numerator?: number;
  denominator?: number;
  sampleSize: number | null;
  availability: 'complete' | 'partial' | 'unavailable';
  cohortId: string;
  definition: string;
  excludedCount?: number;
  unavailableReason?: string;
};
```

Zero is a measurement. Unknown is not zero. Ratios with a zero denominator are unavailable. Do not average subgroup averages or percentages without their weights. A partial paginated response cannot produce a complete cohort median, P90, or share.

## MetricSummaryRow

**Inputs:** total tokens, total cost, merge rate and cohort counts. **Output:** inspect outcome cohort.

- Total tokens and cost include all outcomes in the selected start-time cohort, with coverage disclosed.
- Average tokens per started ticket uses that same cohort and labels missing usage if any.
- Merge rate is `merged / (merged + abandoned + cancelled)` under stats.v1. Open and unknown outcomes are excluded from its denominator.
- “Inspect cohort” expands outcome counts without changing the time window.

**Acceptance:** all displayed subtotals reconcile; null usage does not become zero; the denominator is visible.

## TokensByStage

**Inputs:** ordered stage rows with normalized token categories, total, cost, coverage, and definition metadata. **Output:** select stage.

Stages: Plan, Work, QA, Review, Wrap-up. Handoff readiness is not an additional agent stage; Wrap-up accounts for the preparation work.

- Show total tokens per stage on a shared quantitative scale.
- Where supported, stack Input (uncached), Cache read, Cache write, Output. Pair colors with legend labels and accessible numeric values.
- Include initial attempts and repeat runs. Zero usage, skipped stage, and missing usage have different states.
- Keep total and selected stage detail visible when a row is selected.
- Never present “tokens saved” from cache counts alone; token traffic and billed cost are different quantities.

**StageTokenDetails:** selected stage, token categories and costs, percentage of cohort tokens, sample/run counts, and coverage. Contributor drill-down requires exact run/ticket attribution; otherwise show stage details without a misleading ticket link.

**Accounting requirement:** provider input totals may already include cached input. Normalize once in the adapter, using documented semantics. Only add categories if they are known to be disjoint. If reasoning/output categories overlap, do not double count them. If a breakdown is unavailable, show the known total and explicitly missing categories.

Existing `UsageTotals` already names `tokensInput`, `tokensOutput`, `tokensCacheRead`, `tokensCacheWrite`, `tokensTotal`, and `costUsd`; info-cost-card already renders the four categories. Reuse this vocabulary rather than introducing incompatible names. This is evidence of existing UI/read-model support, not proof that every new API payload has identical accounting semantics. Preserve server `tokensTotal` and verify how it relates to categories before stacking them.

The current overview totals cover latest session snapshots of current executions. Detail `usageByStage` uses deltas. Neither can be assumed to equal the new start-time cohort stats; never sum cumulative session snapshots or substitute the overview for Stats.

**Acceptance:** stage totals reconcile to the covered cohort; changing stage updates breakdown and scope; scaled bar lengths reflect totals rather than normalized-to-100% rows.

Extend numeric-only info-cost-card props to represent unavailable/partial values safely; its current `value.toFixed(2)` assumes a known number. Format large token values, while preserving exact values in the accessible detail table. Retain the existing input/output arrow and Cache R/W labeling with accessible text.

## TimeBreakdown

**Inputs:** per-ticket timing facts or complete server aggregates, sample count, exclusions, and definition metadata. **Output:** optionally select a stage/contributor when the required facts exist.

Headline: **Average Plan → Handoff**. Define it as ticket execution start to validated handoff readiness, using the documented start-to-handoff facts; it is not time to merge. If the actual start predates planning, disclose that definition rather than silently dropping setup time.

Only records that reached handoff and have valid timestamps belong in this duration sample. Show the number excluded, including open/cancelled-before-handoff work. The total-cost sample can be larger; label the different populations.

| Measure | Definition |
| --- | --- |
| Mean elapsed to handoff | Sum of eligible start-to-handoff durations / eligible count |
| Waiting before handoff | Time waiting for reply, paused, or failed to resume before handoff |
| Factory time | Start-to-handoff elapsed minus waiting before handoff |
| Stage time | Active wall time excluding waiting; Work/QA/Review sum all task visits and returns |
| Agent time | Sum of eligible run durations, using the documented accounting |
| Overhead | Documented stage time minus agent time; validation, launching and queueing |
| Median and P90 | Distribution of the same eligible elapsed durations |

Use authoritative server quantiles when available. Otherwise compute median and nearest-rank P90 over the full eligible set; document the method. Show sample size, especially for small cohorts.

Layout: headline duration; stage bars; waiting in a distinct labeled row; factory/waiting totals; median/P90; optional agent/overhead detail. Stage bars share one duration scale.

Do not force the sample equation “sum of stages = factory time” if actual interval definitions leave gaps or overlap. Show an unexplained/unattributed remainder when meaningful; flag inconsistent negative values rather than clamping them invisibly. Concurrent run sums must not be presented as elapsed wall time.

**Acceptance:** repeated stages count; waiting is not counted twice; handoff-to-merge is excluded; sample eligibility and quantiles use the same records.

## TicketsQuality

**Inputs:** ticket-level quality facts and denominators. **Outputs:** inspect measure, select contributor.

This panel is not a renamed stage first-pass-acceptance score. It reports observable signals across the ticket lifecycle:

| Row | Population / definition |
| --- | --- |
| No returns to work | Handoff-reached tickets with no QA/review return to Work / handoff-reached tickets with complete return history |
| Needed human intervention | Handoff-reached tickets with any documented intervention / eligible handoff sample |
| External changes requested | Merged tickets with at least one qualifying external change-request review / merged tickets with complete PR review facts |
| Follow-up commits after handoff | Sum of documented follow-up commits across the labeled merged-ticket sample |

For intervention, retain the stats.v1 definition, including questions, limit pauses, replies, manual retries, manual completes, and stops. Do not quietly narrow it to replies only.

The API's **external review rounds** metric also includes qualifying non-empty comments. It cannot substitute for the narrower “changes requested” row. If review disposition facts are absent, show “External review rounds” with its actual definition, or mark the proposed row unavailable.

`ContributingTickets` shows the exact population behind a selected measure, reason, counts, and execution/run references when available. A separate all-cohort rework view must state its broader scope; it cannot masquerade as the handoff-only denominator.

Human intervention and follow-up commits are signals for investigation, not automatic defects or failure grades.

**Acceptance:** numerators are subsets of denominators; missing history reduces coverage; selecting a row opens actual contributors; no synthetic quality percentage combines unrelated measures.

## EfficiencySignals

**Inputs:** trustworthy derived metrics plus explanatory labels and data coverage. **Outputs:** inspect supporting records where available.

- **Rework token share:** tokens attributed to correction/rework runs / covered cohort tokens. Requires explicit run-purpose attribution. A second run alone does not imply rework; retry, infrastructure recovery, resumed questions, and new tasks differ.
- **Waiting share:** sum of waiting-before-handoff / sum of elapsed-to-handoff for the same eligible sample. Do not average per-ticket percentages unweighted.
- **Infrastructure usage:** attempts and tokens attributable to infrastructure loss, following the documented definition.
- **Blended cost per merged ticket:** all-outcome cohort cost / merged count. Label “blended”; this is not the average cost of only merged tickets.

Rework and infrastructure classifications may overlap in source facts. Define exclusive categories before rendering them as additive partitions; otherwise display them as separate overlapping measures. Do not copy the mock's “separate” claim without verified attribution.

Show factual comparisons and denominators. Avoid declaring one model superior or recommending configuration changes from a small uncontrolled cohort.

## ConfigurationComparison

**Inputs:** configuration signatures, stage/model/thinking assignments, factory versions, outcome counts, coverage. **Output:** select a configuration cohort.

Compare ticket outcomes by the full stage configuration. Stage-level efficiency belongs to the stage's model setup. Do not credit a whole ticket's merge to its reviewer model alone. Show sample sizes and differences in workload/version; compare only metrics with matching definitions.

## MeasurementNotes

Expandable reference for cohort inclusion, units, token normalization, duration boundaries, missing data, quantile methods, and definition version. Important denominators stay beside the corresponding metric rather than being hidden only here.

## Data readiness

| Measurement | Implementation path |
| --- | --- |
| Summary cost/tokens/outcomes, documented stage metrics, configurations | Use existing stats endpoints; validate exact fields |
| Mean/median/P90 to handoff | Use available server aggregates or complete paginated per-ticket timing facts |
| Waiting share and blended cost per merge | Derive from consistent, complete facts and counts |
| Token types by stage | Verify per-run/provider usage fields; normalize categories once; total-only fallback if unavailable |
| Existing usage UI | Reuse four-category cost-card, stage Table and session usage-list; adapt schema-v2 session types to the new API deliberately |
| No-return ticket cohort and exact contributors | Need ticket-attributed return facts; aggregate stage return counts alone are insufficient |
| Rework/infra token shares | Need usage joined to explicit run-purpose/outcome facts; do not infer from run ordinal |
| Changes-requested ticket share | Need PR review disposition facts; external-review-round totals alone are insufficient |

If an endpoint cannot supply a required fact, record an API enhancement with its exact field/definition rather than reconstructing it from UI text or accessing internal SQLite.

## Example fixture checks

The preview uses illustrative numbers, not production targets:

- Stage tokens: 600k + 3.10M + 800k + 1.50M + 400k = 6.40M.
- Disjoint categories in that fixture: 2.00M uncached input + 3.60M cache read + 400k cache write + 400k output = 6.40M.
- Average stage time: 18 + 48 + 12 + 16 + 8 = 102 minutes; plus 30 minutes waiting = 132 minutes to handoff.
- Outcomes: 16 merged, 2 abandoned, 2 cancelled, 4 open, 2 unknown; merge rate = 16/20 = 80%.
- Cost $48.20 / 16 merged = $3.01 blended cost per merge after rounding.

Build stories for complete, missing, partial, no-handoff, zero-merge, disabled-QA, repeated-stage, and differing-cohort cases. These verify measurement meaning, not just chart rendering.
