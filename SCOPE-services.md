# Scope: the Services page

_Drafted 2026-10-06 from the design canvas "Garnet Services Page"
(https://claude.ai/artifact/QBjDRyZ3xV3qrj49pGECqx). The settled boards are
F (concept C fleshed out: the three figures and Medium tiles), G (the year
lens), I (the tiles up close and which metric leads) and, on the header
canvas, N3 (the figures in the left column under the bar). Boards A, B and E
are the rounds that led there. The owner's decisions are in §5 and their
answers to the questions in §8; the build order is §7._

## 1. Goal

The Services page redrawn in the widgets' language, with the analytics at a
glance the owner's mum asked for: **three figures always in view** (this
month, the calendar year, the financial year), the lit one being the lens
the page looks through, and **every service a Medium tile** led by its own
metric, so a glance says which service it is and where it stands.

**Done means:** the page matches boards Q, R, S, K and M (the tool in one
container, V-D9; the lighter tiles three across, V-D10), light and dark, on a
desktop, an iPad and a phone; moving from a month to the next, to the year
and to the financial year takes one tap each and never more; the tiles say
the right thing for every kind of service; `npm run check` passes; the demo
matches the canvas.

## 2. What exists today (facts the scope builds on)

- **The page** (`src/app/(app)/services/page.tsx`): one month at a time,
  `?m=YYYY-MM` up to next month, with arrows and "This month"; four stats
  (Due, Paid, To pay, Still to come); a tile per service and per main service
  (name, provider, this month's figure, a twelve-month sparkline, a status
  chip, the change on the bill before), in the household's groups then My
  Services; All · Household · Mine for people with their own services; Arrange
  (SCOPE-header.md H-D3); Add service.
- **The numbers** come from `servicesMonth()` (`src/lib/services-month.ts`):
  by due date, each instalment in its own month, bills in full when due
  (2026-10-01); `MonthItem` carries the month's bills and their statuses, the
  change on the bill before, the next expected bill, and the twelve months'
  spark. `monthlySeries` / `totalsForRange` (`src/lib/stats.ts`) give totals
  by month and for a range; `fiscalYearBounds` (`src/lib/periods.ts`) the
  financial year from `household.fiscal_year_start_month`.
- **The service's metrics**: usage a day and the limit (`src/lib/consumption.ts`,
  `homeData().services[].usage`), the housemates' shares paid of what's due
  next (`shares`), instalments paid of a notice (`src/lib/instalments.ts`),
  the price (`fixedPrice`), the expected next bill (`src/lib/expected.ts`).
  The Home per-service widget already leads with, in order: overdue, usage,
  shares still to come, days until due, paid (W2).
- **The widgets' pieces** (`src/components/home/pieces.tsx`, `widgets.css`):
  `WxCard` at s/m/l, rings and gauges, `WxFig`, `WxRow`, `WxKv`; the Services
  page's tiles today are plain glass (`.st-tile`, `screens.css`).
- **Exports**: the zip of every bill (`/api/export?kind=zip`), the bills CSV,
  and the member statement by financial year (`fy=`). The zip gains `fy=`
  (V-D5): that financial year's bills, their files and spreadsheets only.
- **The layout**: under the bar the page has the whole width inside the
  1600 px cap; the column the side menu had is free (SCOPE-header.md §3i).

## 3. The design

### 3a. The analytics tool (F, N3; owner 2026-10-06: one container)

One glass card at the page's left, 340 px wide, headed **Analytics**: the
analytics tool, in its own container. Inside it the three lenses sit one
above the other, each a section with its own name and period arrows:

1. **This month**: the month with arrows (step month to month; "This month"
   to come back), the month's total as the figure, the change on the month
   before ("↑ 4% on August · 5 bills, 2 paid"), the twelve months to this
   one as bars with this month lit (tapping a bar opens that month), then
   three facts: Paid, To pay, To come.
2. **This year**: the calendar year with arrows, the year's total so far,
   the change on last year to the same date and the bill count, every month
   as a bar with last year drawn hollow behind each, then: a month on
   average, the highest month, the whole of last year.
3. **Financial year**: July to June (from the household's fiscal year start;
   shown even when it starts in January, so every household's page reads the
   same), the same shape, with: a month on average, what is expected to the
   year's end, the whole of last financial year, and **Download bills**, a
   zip of that year's bills for the accountant.

The lit section is the page's lens and shows everything: its figure, its
line, its bars and its facts. The other two stay in view but fold to their
name, period and figure with the change line under it, so all three totals
are always readable at a glance; tapping one lights it and unfolds it. A
thin rule separates the sections; nothing else in the card is chrome. On a
phone the card is a row that swipes sideways, one lens per screen, above
the tiles.

### 3b. The tiles (Q, N, S; owner 2026-10-06)

Every service and main service is a **tile the shape of a Home Medium
widget**, about 340 × 150, three across in the width beside the tool from
1400 px and two across below that, in the household's groups (each heading
in the display face with the lens's total beside it), then My Services.
There is no All · Household · Mine: the figures cover the household's bills
plus the viewer's own, and My Services is always its own section.

A tile carries six things and says nothing twice: the icon disc and the name
in the service's colour, with the provider under it only where it differs
from the name (a main service shows its count: "3 services", "2 vehicles");
a status chip top-right (Due Thu, Paid 18 Sep, Due in 13 days, Overdue in
Pyrope, Unusual, Nothing due); the ring that says most about that kind of
service; the figure; one line under it; and one fact, the thing the tile
has not already said (your share, or against last year). No bars on the
month lens; the year lenses give each tile a bar a month (3c). The whole
tile opens the service's page.

**Which metric leads** (board I, amended):

| Service                                        | The ring                                                                                       | The figure             | The line and the fact                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------ |
| Rent, Internet, Subscriptions, any fixed price | Shares in when bills are split ("1 / 3 shares in"); days left to the due date when they aren't | What is due this month | Same every month, with the due day · your share  |
| Electricity, Gas, Water                        | Use a day against the limit (an arc; the reading alone with no limit set)                      | What is due this month | Against the limit · against last year            |
| Council Rates (an instalment plan)             | Instalments paid of the year                                                                   | This instalment        | What is left of the notice · the next instalment |
| A main service with nothing due                | Its icon; days left when something is                                                          | What is due, or a dash | Nothing this month · the next thing coming       |
| Just yours                                     | As the household's, "Just yours" under the name                                                |                        | A tax receipt line for a donation                |

### 3c. The lens changes the tiles (G)

With the year lit, each tile says the year: what the service cost in the
year so far, its average use over the year, how it compares with last year,
a bar a month. The financial year the same from July. The month lens is as
3b.

### 3d. Moving around

One tap each: a month's arrows, a bar in the month card, the year's arrows,
the financial year's arrows. The lens and the period are in the URL
(`?lens=month|year|fy&m=YYYY-MM`, `&y=YYYY`, `&fy=YYYY`), so a page can be
shared and the back button works.

### 3e. What goes

The four stats and the month switcher card (the month card carries them),
the plain tiles and their twelve-month sparkline, and All · Household ·
Mine. Arrange and Add service stay at the top right.

## 4. What changes in the code

- **`src/lib/services-view.ts`** (new, replacing `services-month.ts`'s page
  role): `servicesPage(hh, me, today, lens, period, scope)` with the three
  lenses' figures (totals, change, bars, facts) and a `TileItem` per service
  carrying the lead metric, the chip, the figure, the facts and the bars for
  the lens. The month's per-service numbers come from `servicesMonth()`'s
  rules; the year's from `monthlySeries`; the metrics from consumption,
  instalments and the shares.
- **`src/app/(app)/services/`**: `page.tsx` reads the lens and period;
  `analytics.tsx` (the one card with its three lenses), `tile.tsx` (the
  Medium tile from the widgets' pieces).
- **`src/styles/screens.css`**: the `.sv-*` layout (figures column, tiles
  two across, a phone's swipe row); the old `.st-*` and `.sm-*` rules go.
- **Words** under `services.lens.*`, `services.tile.*`.
- **Tests**: `tests/services-view.test.ts` (the three lenses' figures on a
  known set of bills, the lead metric per kind of service, the URL rules).

## 5. Decisions (the owner's, 2026-10-06)

- **V-D1.** Three figures always in view: this month, the calendar year, the
  financial year, even when the two years coincide. The lit one is the lens.
- **V-D2.** The tiles follow the lens: with the year lit they say the year.
- **V-D3.** Every service is a Medium tile led by its own metric; a service
  with nothing due keeps the same tile, quieter, at the end of its group.
- **V-D4.** Last year is drawn hollow behind each month's bar on the year
  and financial year cards.
- **V-D5.** Download bills on the financial year card is a zip of that
  year's bills only (`fy=` on the zip export).
- **V-D6.** Every group heading carries the lens's total.
- **V-D7.** A phone swipes between the three cards above the tiles, one tile
  a row.
- **V-D8.** All · Household · Mine goes; My Services is always its own
  section, and the figures cover the household's bills plus the viewer's own.
- **V-D9.** The analytics are one tool in one container at the left, not
  three cards: the three lenses stacked inside it, the lit one unfolded, the
  other two folded to their figure.
- **V-D10.** The tiles are lighter than first drawn: no bars on the month
  lens, one fact, the provider only where it differs; three across from
  1400 px, two below; a fixed-price service's ring is shares in when bills
  are split.

## 6. Not in this scope

A service's own page (`/services/[id]`), the main services' pages, the
Services panel in the bar (built), notifications.

## 7. Stages

- **V1 · The numbers.** `servicesPage()` with the three lenses and the tiles'
  metrics, tested. Commit.
- **V2 · The analytics tool.** The one card in the left column with its
  three lenses, the lens and period in the URL, the phone's swipe row.
  Commit.
- **V3 · The tiles.** The Medium tile from the widgets' pieces, each kind of
  service led by its metric, the lens changing them, the old tiles and stats
  gone. Commit.
- **V4 · The sweep.** Dead CSS and words, BRAND.md, the log; a check on the
  demo at every size, light and dark. Commit.

## 8. The questions and the owner's answers (2026-10-06)

- **Q1. Does the lens change the tiles?** **Yes, the tiles follow the lens** (V-D2).
- **Q2. Quiet tiles.** **Medium like the rest, at the end of its group** (V-D3).
- **Q3. Two years, or one.** **Always three** cards, even when the financial
  year is the calendar year (V-D1; the owner, against the recommendation of
  two, so the page reads the same for every household).
- **Q4. Download bills for a year.** **That year's bills only** (V-D5).
- **Q5. Last year behind the bars.** **Last year hollow behind** (V-D4).
- **Q6. Group totals.** **Yes** (V-D6).
- **Q7. The phone.** **A swiping row of the three cards, one tile a row** (V-D7).
- **Q8. All · Household · Mine.** **Drop it** (V-D8).
