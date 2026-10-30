---
name: Factory Dashboard
description: Control-room observability for the GEUT software factory
colors:
  beacon-yellow: "oklch(0.852 0.199 91.936)"
  beacon-yellow-dark: "oklch(0.795 0.184 86.047)"
  beacon-ink: "oklch(0.421 0.095 57.708)"
  instrument-ink: "oklch(0.148 0.004 228.8)"
  cold-paper: "oklch(0.955 0.006 220)"
  panel-white: "oklch(0.985 0.004 220)"
  recess-grey: "oklch(0.925 0.010 220)"
  hairline: "oklch(0.86 0.012 220)"
  fault-red: "oklch(0.577 0.245 27.325)"
  fault-red-dark: "oklch(0.704 0.191 22.216)"
  chart-blue-1: "oklch(0.828 0.111 230.318)"
  chart-blue-2: "oklch(0.685 0.169 237.323)"
  chart-blue-3: "oklch(0.588 0.158 241.966)"
  chart-blue-4: "oklch(0.5 0.134 242.749)"
  chart-blue-5: "oklch(0.443 0.11 240.79)"
  signal-run: "oklch(0.80 0.13 155)"
  signal-run-dark: "oklch(0.72 0.12 155)"
  signal-wait: "oklch(0.79 0.15 70)"
  signal-wait-dark: "oklch(0.72 0.14 70)"
  signal-standby: "oklch(0.72 0.012 228)"
  signal-standby-dark: "oklch(0.62 0.012 228)"
  signal-fault: "oklch(0.55 0.19 25)"
  signal-fault-dark: "oklch(0.57 0.18 25)"
  signal-clear: "oklch(0.53 0.13 245)"
  signal-clear-dark: "oklch(0.55 0.12 245)"
typography:
  headline:
    fontFamily: "system-ui sans stack (Roboto self-hosted, wiring pending)"
    fontSize: "2.25rem"
    fontWeight: 300
    lineHeight: "tight"
  title:
    fontFamily: "system-ui sans stack"
    fontSize: "1.5rem"
    fontWeight: 300
    lineHeight: "tight"
  metric:
    fontFamily: "'JetBrains Mono Variable', monospace"
    fontSize: "clamp(1.5rem, 3vw, 3rem)"
    fontWeight: 700
    letterSpacing: "normal"
  body:
    fontFamily: "system-ui sans stack"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
  label:
    fontFamily: "'JetBrains Mono Variable', monospace"
    fontSize: "0.75rem"
    fontWeight: 300
    letterSpacing: "0.025em"
rounded:
  square: "0px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  gutter: "32px"
components:
  button-beacon:
    backgroundColor: "{colors.beacon-yellow}"
    textColor: "{colors.beacon-ink}"
    rounded: "{rounded.square}"
    padding: "8px 16px"
  button-beacon-hover:
    backgroundColor: "{colors.beacon-yellow}"
    textColor: "{colors.beacon-ink}"
  button-outline:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.instrument-ink}"
    rounded: "{rounded.square}"
    padding: "16px 16px"
  badge-signal:
    textColor: "{colors.instrument-ink}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-signal-terminal:
    textColor: "{colors.panel-white}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  card-metric:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.instrument-ink}"
    rounded: "{rounded.square}"
    padding: "16px"
---

# Design System: Factory Dashboard

## Overview

**Creative North Star: "The Control Room"**

This is an instrument panel, not a webpage. A single operator watches a running software factory from a browser window parked beside a terminal, and the interface behaves like the wall of displays in an industrial control room: cool grey metal surfaces, near-black ink, hard square geometry, and every measurement set in monospace tabular figures. Nothing decorates. Everything reports.

The one warm voice is Beacon Yellow (`oklch(0.852 0.199 91.936)`), the safety color of heavy machinery. It appears only where the system is alive or attention is owed: a stage card that just changed value, the progress fill of a ticket's pipeline, the cap-band of a detail stat, a primary action. Its rarity against the grey field is exactly what makes it legible. Below the beacon, five desaturated signal colors carry the entire semantic state language of the factory — run, wait, standby, fault, clear — and nothing else in the UI gets to be colorful.

Type is a two-instrument pair: JetBrains Mono is the voice of data (values, counts, IDs, timestamps, table cells), and a light system sans is the voice of structure (page titles, section headings, prose descriptions). Headings are deliberately thin (weight 300) at large sizes so the heavy mono numbers remain the loudest thing on the page.

**Key Characteristics:**
- Grey-on-grey tonal layering; zero shadows; 1px rings and hairlines only
- Absolutely square surfaces (`--radius: 0rem`) — pills and dots are the only curves
- Beacon Yellow reserved for live signal, never for decoration
- Every number monospace and `tabular-nums`; states never spelled without their signal color
- Full light/dark parity via CSS custom properties; the operator picks, the system remembers nothing

## Colors

The palette is an industrial grey field with one amber warning voice and a five-value signal strip for factory states. Theme colors are defined as shadcn CSS variables in `src/routes/layout.css` (oklch is the normative format); the signal strip below is the normative status palette, defined there as `--signal-*` tokens.

### Primary
- **Beacon Yellow** (`oklch(0.852 0.199 91.936)` light, `oklch(0.795 0.184 86.047)` dark): the `--primary` token. Used for: changed-value flash on workflow stage cards, timeline/progress fill and reached step dots, the top cap border and tinted background of detail stat cards, agent message bubbles' tint source, and the primary button. Text on it is always **Beacon Ink** (`oklch(0.421 0.095 57.708)`), never white.

### Secondary / Data
- **Instrument Blue ramp** (`--chart-1`…`--chart-5`, `oklch(0.828 0.111 230.318)` → `oklch(0.443 0.11 240.79)`): the chart scale for any future usage/velocity plotting. Deep-to-light navy; not used for surfaces today.

### Danger
- **Fault Red** (`oklch(0.577 0.245 27.325)` light, `oklch(0.704 0.191 22.216)` dark): the `--destructive` token, used at 10–20% washes for destructive buttons and error tints. Full-strength it doubles as the fault signal below.

### Signal strip (status semantics — normative)
Defined in `src/routes/layout.css` as `--signal-{run,wait,standby,fault,clear}` with matching `--signal-*-foreground` inks, in both `:root` and `.dark`, and exposed as Tailwind colors (`bg-signal-run text-signal-run-foreground`). `src/lib/factory/status.ts` is the single mapping from API statuses to signals. The rule is tonal weight = state weight: in-progress and attention states are light chips carrying ink text; terminal states are deep chips carrying paper-white text. Every chip/ink pair meets WCAG AA (≥ 4.5:1) in both themes.

- **Signal Run** (`oklch(0.80 0.13 155)` light, `oklch(0.72 0.12 155)` dark): machine working. Execution `active`/`resuming`, task `active` at any stage. Ink text (11.1:1 / 8.4:1).
- **Signal Wait** (`oklch(0.79 0.15 70)` light, `oklch(0.72 0.14 70)` dark): a human is needed. Execution `queued`, `waiting_for_user`, `ready_for_handoff`. Ink text (9.9:1 / 7.7:1). (Deliberately deeper and one hue-step orange from Beacon Yellow so the system voice and the wait state don't collapse.)
- **Signal Standby** (`oklch(0.72 0.012 228)` light, `oklch(0.62 0.012 228)` dark): not started / not moving / not known. Execution `paused`, `cancelled`; task `pending`, `cancelled`; any unknown value. Ink text (8.0:1 / 5.4:1).
- **Signal Fault** (`oklch(0.55 0.19 25)` light, `oklch(0.57 0.18 25)` dark): stopped broken. Execution `failed`, `resume_failed`; task `blocked`. Paper-white text (5.3:1 / 4.9:1).
- **Signal Clear** (`oklch(0.53 0.13 245)` light, `oklch(0.55 0.12 245)` dark): stopped clean. Execution `complete`, task `done`. Paper-white text (5.2:1 / 4.8:1). Lightness and chroma were lowered from the original `oklch(0.55 0.16 245)` proposal, which was out of sRGB gamut and only 4.7:1 against white.

### Neutral
- **Instrument Ink** (`oklch(0.148 0.004 228.8)`): body text / dark-mode background.
- **Cold Paper** (`oklch(0.955 0.006 220)`): the light-mode page background — the same cool metal as the wells and cards, a step lighter than Recess Grey.
- **Panel White** (`oklch(0.985 0.004 220)`): card and popover surfaces, a cool panel rather than pure white; in dark mode this role becomes **Console Slate** (`oklch(0.218 0.008 223.9)`).
- **Recess Grey** (`oklch(0.925 0.010 220)`): the header band, muted surfaces, and untracked step dots; dark mode `oklch(0.275 0.011 216.9)`.
- **Hairline** (`oklch(0.86 0.012 220)`): all 1px borders and separators; dark mode `oklch(1 0 0 / 10%)`.

**The Beacon Rule.** Beacon Yellow is a live-signal color only. If a surface isn't reporting activity, progress, or an action, it doesn't get the beacon. Its scarcity against the grey field is the mechanism.

**The Two-Ink Signal Rule.** Light chips (run/wait/standby) carry instrument ink; deep chips (fault/clear) carry paper white. A chip's ink weight tells you whether the ticket is still moving.

## Typography

**Display/Metric Font:** JetBrains Mono Variable, self-hosted via `@fontsource-variable/jetbrains-mono` (`--font-mono`)
**Body/Headline Font:** system sans stack. Roboto is self-hosted (`@fontsource/roboto`) and tokenized as `--font-roboto` but **not yet wired into `--font-sans`** — known drift; either wire it or drop the import.
**Label Font:** JetBrains Mono Variable at light weights with slight tracking

**Character:** Mono is the instrument readout — values, IDs, timestamps, table data, subtitles. The sans is the calm human layer — page titles, section headings, descriptive copy, chat content. Thin sans headings (300) at large sizes keep the heavyweight mono numbers as the loudest element on every screen.

### Hierarchy
- **Headline** (300, `text-4xl` / 2.25rem, tight, sans): page titles only — "Factory Overview", "Ticket Detail". Preceded by `mt-2`, followed by a muted subtitle.
- **Title** (300, `text-2xl` / 1.5rem, tight, sans): section headings — "Workflow", "Tickets".
- **Metric** (700, `text-4xl`–`text-5xl` / 2.25–3rem, mono, `tabular-nums`): the big number inside stat cards. This is the actual display voice of the product.
- **Body** (400, `text-sm` / 0.875rem, 1.5, sans): descriptive paragraphs (muted color, `font-extralight` at 200 for subtitles), chat message content, table cells at `text-xs`–`text-sm`.
- **Label** (300–400, `text-xs` / 0.75rem, `tracking-wide`, mono): card titles (capitalized), subtitles, timestamps, token counts, badge text.

**The Measurement Monospace Rule.** Any rendered number is mono + `tabular-nums`. No proportionally-spaced digits anywhere in a data position.

## Layout

The Flow board, Tickets, and Stats share one shell, `max-w-screen-2xl`, so the header and nav keep one width on a wide screen. The Flow board (`/`) is a viewport instrument: the shell is also `h-dvh`, and the page does not scroll. Tickets and Stats scroll with the document. The new-ticket route stays in a center column, `max-w-7xl` (80rem). All horizontal gutters are `px-8` (32px). The page stack is header band → nav row → hairline separator → content. On the board, content is a status rail over a lane row; elsewhere, blocks separate by `gap-6` (24px). Card padding stays on the 8-unit rhythm (`spacing(4)` default, `spacing(3)` in `size="sm"` cards).

- **Header:** full-width Recess Grey band, `py-4`, logo + wordmark left, dark-mode toggle right.
- **Nav:** two outline buttons (Main / Tickets), left-aligned, `gap-2`, no active-state underline — current location reads from the button being a link target.
- **Overview grids:** stat row is `grid-cols-1 md:grid-cols-3` of fixed-width cards (`w-64`, `md:w-56`, `lg:w-64`); the workflow row is `grid-cols-2 lg:grid-cols-4` (`w-32`/`w-48` cards). Cards center within their track (`justify-items-center-safe`).
- **Tables:** TanStack tickets table with a sticky header row on the Accent surface (`sticky top-0 bg-accent`, sans extrabold), mono body at `text-xs md:text-sm`; the cost column is hidden below `lg`.
- **Ticket detail:** content sections wrap in a Panel White band (`bg-card p-4 md:px-8`) and cap at `max-w-5xl` for readability; stat mini-cards sit in a `grid-cols-2` with `gap-y-4 gap-x-2`.
- **Stats:** four tiers. A one-line cohort fact, then a full-width strip of three fluid indicator cards (tokens, cost, merge rate) divided by a hairline. Tokens by stage and Time to handoff sit beside each other on Panel White. The Stages table shows six core columns until More columns; Quality, Efficiency and Configurations share one tab band, and contributing executions follow the selected measure.
- **Flow board:** the status rail (title at the Title scale, metric numerals, attention block) stays fixed. Below `md` the title and metric numerals step down one size, and the attention block collapses to its headline until See more. From `lg` up, lanes are one row that fits the viewport, on a Recess Grey well with Panel White cards. Plan, Work, QA, Review and Handoff stay on screen and share the width. Below `lg`, a phone stacks one column and a tablet two, the stack scrolls inside the board, and each column shows one card until See more opens it to a shared fixed height with its own scroll. A lane's header (name, mono count, QA "optional") is pinned; its cards scroll inside the lane. The Backlog is the first column, divided from the pipeline by a trailing hairline, and folds to the left behind an icon button. It folds on its own when the row is too narrow for those five lanes to stay readable, until the operator opens it. When a column has more cards than fit, a short mask of the lane well marks the overflowing edge. Selecting a ticket or issue opens a non-modal drawer on the right of the lanes (`min(40rem, 100%)`, Panel White, 1px leading hairline, its own scroll). The board stays usable underneath. The drawer slides 150ms on enter and exit, and that movement is removed under `prefers-reduced-motion`.
- **Breakpoints:** Tailwind defaults (`md` 768px, `lg` 1024px). From `lg` up, the pipeline lanes stay in one row and shrink to fit. Below `lg`, a phone is one column and a tablet is two, and the rest stack inside the board. Columns do not scroll sideways. Other pages: mobile is single-column stacks with cards at their smaller fixed widths; desktop adds the 3/4-column grids. Typography plugin (`prose`) styles the layout scaffold only; component text opts out with `not-prose`.

## Elevation & Depth

The system is flat by decree. There are no box-shadow tokens in custom components — `light-card` explicitly sets `shadow-none` — and depth is conveyed entirely by **tonal layering**: Cold Paper page → Panel White cards → Accent header strips → Recess Grey bands, each boundary sealed by a 1px ring (`ring-1 ring-foreground/10`) or Hairline border. shadcn primitives carry trace shadows (`shadow-xs` on the table container) but they are near-invisible; treat them as heritage, not vocabulary.

### Named Rules
**The Instrument-Flat Rule.** Zero shadows. If two surfaces need separation, change the tone or draw a 1px hairline — never lift.

## Shapes

`--radius: 0rem`, and every derived step in the scale collapses with it (`--radius-sm` = 0.6×0, `--radius-md` = 0.8×0 …). The result: buttons, cards, badges' competitors, inputs, table cells — all hard right angles. Two sanctioned exceptions carry the only curves in the product:

- **Pills:** badges are `rounded-full` chips — the status ribbon of the control room.
- **Dots:** the timeline's step markers are 16px circles (`size-4 rounded-full`), beacon-lit when reached.

Borders are always 1px, always Hairline or a semantic token (`border-t-primary` on detail stat cards is the signature: a 1px beacon cap-band over a 20% beacon wash surface). The square geometry + hairline grid is what makes the shadcn heritage components read industrial instead of generic.

## Components

### Buttons
- **Shape:** square (radius collapses to 0px despite `rounded-md` in class names).
- **Default (beacon):** `bg-primary` with `beacon-ink` text, `text-xs/relaxed` medium sans, `h-7 px-2` (sizes xs→lg: h-5/h-6/h-7/h-8), icon slots 14–16px. Hover: `bg-primary/80`. Active: `translate-y-px` — the one mechanical feel in the system, a key-press.
- **Outline (nav):** `border-border`, muted hover on `input/50`; used at `size="lg"` with a left icon for the Main/Tickets nav.
- **Ghost / Link:** standard shadcn treatments; **Destructive** is a 10% Fault Red wash with full-red text, not a solid red block.
- **Focus:** `ring-2 ring-ring/30` + border shift, 2px max. Restrained.

### Status Badges (chips)
- **Style:** `rounded-full` pill, `text-[0.625rem]` mono, `px-2 py-0.5`, one of the five signal colors as background with ink chosen per the Two-Ink Rule. Status text replaces underscores with spaces and capitalizes ("waiting for user").
- **Behavior:** every ticket/task row ends with its signal chip; the chip is the row's scan anchor.

### Metric Cards (`info-card`, `info-cost-card`)
- **Corner Style:** square; **Background:** Panel White (Console Slate dark) with `ring-1 ring-foreground/10`; **Border:** none beyond the ring; **Internal Padding:** sm-scale (12px).
- Structure: light capitalized mono label → `h-24` well holding the bold mono number (4xl–5xl) → footnote row. The cost card footnotes the four token flows with up/down arrow glyphs and R/W markers, all `tabular-nums`.

### Stat Mini-Cards (`light-card`)
- **Style:** `bg-primary/20` beacon wash, `shadow-none`, `border-t border-t-primary` — the beacon cap-band. Fixed `h-24`, xs label in muted sans, mono content. Used on Ticket Detail.

### Workflow Stage Cards (`work-card`)
- **Style:** metric card at `h-16` scale; rests on Recess Grey and **flashes to full Beacon Yellow for 300ms** (`transition-colors duration-300`) when its count changes. This flash is the product's signature moment: the board lighting up as the factory moves. The lane count on the Flow board uses the same flash.

### Flow board card and drawer
- **Lane:** Recess Grey well. Header is the stage name in `text-sm` medium sans and the count in mono `text-lg` 700. Only the card list scrolls.
- **Ticket card:** three tiers on Panel White with a 1px ring. Identity is the mono reference and a `text-sm` title (clamped to two lines). Signal is the status chip; a ticket that needs attention carries a 2px Signal Wait leading edge and the words "Needs attention". Telemetry (progress, updated time, tokens) sits under a hairline. Selected is a Beacon wash (`bg-primary/15`) plus a 2px foreground ring. The attention block is a Signal Wait wash behind its 2px edge.
- **Drawer:** Panel White, 1px leading hairline, no shadow and no scrim. It overlays the lanes and does not trap focus. Enter and exit are a 150ms translate, dropped under reduced motion.

### Timeline / Progress (signature)
- **Style:** 4px `bg-muted` track, `bg-primary` fill tweened over 800ms with `cubicInOut`; step dots ride the track (`-mt-4.5`), beacon-filled when reached, grey before, labels below in light xs mono. Current step index maps the pipeline plan→work→review→wrapup→done.

### Agent Messages (`agent-message`)
- **Style:** mono header (agent name) + tinted bubble — background derived from the beacon at reduced chroma (`oklch(from var(--primary) 0.93 calc(c*0.4) h)` light / `0.3 c*0.4` dark), content in **sans** at full width, tabular timestamp right-aligned xs mono.

### Tables (`tickets-table`, `usage-list`)
- **Style:** container border 1px, sticky accent header (sans extrabold, `p-4`), mono body rows, cost column as `text-end` mono, status column as signal chips. Empty state and pagination are not yet implemented.

### Navigation
- Header band with logo ("FD" mono wordmark + filled grid icon in foreground ink) and the manual dark/light toggle button. Two-button tab nav below; no breadcrumbs in v0 (list → detail is one hop back).

## Do's and Don'ts

### Do:
- **Do** keep every current color assignment dual-theme — new tokens need both a `:root` and `.dark` value before they ship.
- **Do** set status chips from the five-signal strip and route them through the Two-Ink Rule; when migrating, define them as CSS variables (`--signal-run` etc.) in `layout.css`, not as utility classes per component.
- **Do** render every numeric value in `font-mono tabular-nums`, including timestamps and IDs.
- **Do** use the 300-weight sans for all headings at large sizes and reserve weight 700 for mono metrics.
- **Do** keep motion to three signal-bearing moments: the work-card beacon flash, the timeline fill, and the board drawer's 150ms slide (removed under reduced motion).
- **Do** separate surfaces with tonal steps or 1px hairlines (`--border`), and rings (`ring-1 ring-foreground/10`) for cards.

### Don't:
- **Don't** add border-radius to any new surface — the scale is zeroed; pills (`rounded-full`) for badges/dots are the only exception.
- **Don't** use Beacon Yellow as decoration, on large text blocks, or as generic "success"; that's Signal Run's job.
- **Don't** add raw Tailwind palette classes (`bg-green-500` and friends) anywhere; they're legacy debt, not vocabulary.
- **Don't** introduce shadows, decorative gradients, or blur/glass; depth is tonal only. The lane overflow cue is a mask of the lane well, not a gradient treatment.
- **Don't** put proportional font digits in data positions or colored-gray text on colored surfaces (secondary text on a signal chip stays in the ink family).
- **Don't** document the Roboto import as the product font until it is actually wired into `--font-sans`; until then system sans is the truth.
