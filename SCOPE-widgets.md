# Scope: Home widgets

_Drafted 2026-10-03 from the design canvas the owner and the assistant worked
through that day ("Garnet Home Widgets",
https://claude.ai/artifact/8eR7HgonFF1rQXzV3qXyDt; boards H to P are the
settled design, A to G the rounds that led there). The owner's decisions are in §5 and their
answers to the questions in §8 (all as recommended, the same day); the build
order is §7._

## 1. Goal

Home's widgets redrawn as one system, after Apple's: every widget comes in
**three fixed sizes**, looks like a sibling of every other, and reads at a
glance. The same widgets fill a phone, an iPad, a desktop and the wall.

**Done means:** every widget on Home draws at Small, Medium and Large to the
canvas; Edit Home offers exactly those three sizes; layouts saved before the
change open converted, with nothing lost; the wall shows the same widgets,
bigger and with nothing to tap; `npm run check` passes; the demo matches the
canvas at phone, iPad portrait, iPad landscape and desktop, light and dark.

## 2. What exists today (facts the scope builds on)

- **The grid** (`src/lib/home-grid.ts`): blocks per screen and density
  (desktop and iPad landscape 4×3 · 5×3 · 6×4, iPad portrait 3×4 · 4×5 · 4×6,
  phone 2×3 · 2×4 · 2×5, the wall 4×2), first-fit packing onto pages, moving,
  resizing, swaps for households that don't split or have no postcode.
- **Layouts** are saved per member × device × kind in `home_layout` (density
  plus pages of `{ id, w, h }`; `src/lib/home-layout.ts`).
- **The catalogue** (`src/components/home/catalog.tsx`): 21 widgets plus one
  per service, each listing its own block sizes. There are ten different sizes in use
  (1×1 up to 5×2, including 3×1, 5×1, 2×3 and 3×2), and each widget
  draws differently at each.
- **The numbers** come from `homeData()` (`src/lib/home-data.ts`) once per
  visit as plain data. That stays; this scope changes how widgets draw, not
  what they know.
- **The look today**: a small icon and title on top, then whatever the widget
  needs, laid out per widget (`src/styles/home.css`).

## 3. The design

### 3a. Three sizes

| Size   | Blocks | Holds                                                                  |
| ------ | ------ | ---------------------------------------------------------------------- |
| Small  | 1 × 1  | the instrument, one figure and a name                                  |
| Medium | 2 × 1  | the instrument beside a title, the figure and two or three facts       |
| Large  | 2 × 2  | Medium's layout on top, then a chart or a list, then the action if any |

Large is exactly two blocks plus the gap between them. No other sizes.

### 3b. The layout: one instrument leads

Glass cards (BRAND.md §5), 24 px corners, 16 px padding. Each widget is led
by **one instrument**, the same at every size:

- **A ring or a gauge** only where it measures real progress toward
  something: the month's bills paid, days left, usage against a limit, shares
  paid, instalments paid, setup steps done. A gauge (three-quarter arc) is for
  a reading against a limit; a ring is for part of a whole.
- **An icon and one big figure** everywhere else (weather, inbox, trend,
  forecast, set aside, calendar, activity, heads-up, services, just yours,
  the week, season ahead).

Inside a ring: the figure, then a quiet word under it ("paid", "day left").
Fractions read "2 / 3", never "2 of 3". A measurement's **unit** shares the
number's line when number and unit together are four characters or fewer
("412L"); longer, the unit sits underneath in the same white at half the
number's size, with "a day" below that ("6.8" / "kWh" / "a day"). The decimal
point counts as a character.

Large: the list or chart sits directly under the top block and fills the
card: up to four two-line rows, or a chart with up to three one-line rows.

### 3c. Colour

- A ring and its icon wear the **service's colour** (BRAND.md §2). Widgets
  about the whole household (This month, Inbox, Forecast…) wear Graphite.
- **Overdue** is the only red: the ring goes full and red, and the words that
  say how late it is are the same red, in light and dark. The red is
  `#D3212D`, brighter than Pyrope 600 because Pyrope is too dim against a
  dark card; it is a new token (§8, Q4: `--overdue`).
- Heads-up's bell is that red too: it is the list of things gone wrong.

### 3d. Buttons

- **Large:** one full-width button at the foot of the card.
- **Medium:** a small round button (36 px) at the top right, the same action
  as an icon.
- **Small:** none. Tapping the widget opens what it is about.
- Quick actions is the exception: it is all buttons (one round Add on Small,
  three on Medium, six on Large).
- The wall shows no buttons.

### 3e. States

Every widget has the same five, drawn on board I:

| State        | Looks like                                                                   |
| ------------ | ---------------------------------------------------------------------------- |
| Overdue      | the ring full and red, "3 days over" in the same red                         |
| All paid     | the ring full in its colour with a tick                                      |
| Nothing due  | an empty ring with a tick in the next service's colour; what's expected next |
| No bills yet | an empty ring with the service's icon, filled, in its colour; "Add a bill"   |
| Loading      | an empty ring and grey bars where the words will be                          |

"Add your postcode" uses the No-bills-yet pattern with a pin.

### 3f. The widgets

Every widget at all three sizes is on boards H, K and L. In short:

| Widget          | Instrument                  | Small adds           | Large adds                           |
| --------------- | --------------------------- | -------------------- | ------------------------------------ |
| This month      | ring: % of bills paid       | the month's total    | six months of bars, top services     |
| Next due        | ring: days left             | your share           | the next three bills, Mark paid      |
| A service       | gauge: usage against limit  | its latest bill      | bars per bill, next bill, your share |
| Settle up       | ring: shares paid           | owed to you          | who owes and who has paid            |
| Weather         | icon + today's high         | the place            | the week's highs, heating days       |
| Inbox           | icon + number to confirm    | filed this month     | the documents waiting                |
| Spending trend  | icon + change on last month | the month's total    | highest, lowest, average             |
| Services        | icon + number of services   | this month           | each service and its status          |
| Usage           | gauge: % of limit           | the reading a day    | every metered service                |
| Heads-up        | icon + number to look at    | the first one        | each one in a line                   |
| Forecast        | icon + next month's total   | change on this month | six months ahead                     |
| Set aside       | icon + your share           | of what total        | each person's share                  |
| Just yours      | icon + this month           | number of bills      | your own bills                       |
| Instalment plan | ring: instalments paid      | the instalment       | every instalment with its date       |
| Calendar        | icon + today's date         | due this week        | five weeks, a dot per due day        |
| Activity        | icon + count this week      | the latest           | the latest four                      |
| This week       | icon + due this week        | your share           | each bill and a usage note           |
| Quick actions   | buttons                     | Add a bill           | six actions                          |
| Season ahead    | icon + change a month       | when it starts       | each service's change                |
| Get started     | ring: steps done            | the next step        | every step                           |
| Add a postcode  | empty ring + pin            | why                  | what is kept, Add a postcode         |

A service with no meter (rent, internet) leads with shares paid when bills
are split and something is unpaid, otherwise with days to its next bill.

Today's separate "shares settled" gauge becomes Settle up's ring (§8, Q3).

### 3g. Home on each screen

Boards J, M, N and P.

- **Phone** two blocks wide; **iPad portrait** four; **iPad landscape and
  desktop** five; the density setting still changes how many blocks fit (§8,
  Q1).
- **The wall** is four by two with blocks about half as big again, a clock,
  the household and the weather on top, and no buttons.
- **Edit Home:** every widget shows a round remove button top-left; tapping a
  widget outlines it and opens a Small · Medium · Large picker under it; an
  empty space is a dashed "Drop a widget here"; the bar has Reset, Add widget
  and Done. **Add a widget** is a panel: search, the list, the same size
  picker, a live preview on a plain backdrop, Add to Home. Dragging, page
  flips and the keyboard controls stay as they are.

## 4. What changes in the code

- `home-grid.ts`: one `SIZES` table (S 1×1, M 2×1, L 2×2); `sizesOn`,
  `nextSize` and the defaults use it; the wall's blocks scale rather than
  taking other sizes. `parseLayout` converts stored sizes (§5, D6).
- `catalog.tsx`: each widget becomes `{ id, icon, colour, small, medium,
large }` drawing from shared pieces: `WidgetRing`, `WidgetGauge`,
  `WidgetPlain` (icon + figure), `WidgetTop` (instrument + title, figure,
  facts), `WidgetRows`, the foot button and the round button. The per-widget
  size lists go.
- `home.css`: the widget rules are rewritten around those pieces; the old
  per-size rules go.
- `home-grid.tsx`: the size badge that cycles sizes becomes the three-way
  picker; the Add sheet gains the picker and preview.
- `home-data.ts`: small additions only where a widget shows a fact it lacks
  today (the month's paid/to-pay split, days left as a number, the unit rule's
  inputs). No new queries are expected.
- `messages/en.json`: the ring words and state lines under `home`.
- BRAND.md §8–9: the widget rules in §3 here replace "every tile carries an
  instrument".
- Tests: the grid engine (sizes, conversion, packing with three sizes), the
  unit rule, each widget's view model at each size and state.

No database migration: `home_layout` already stores `{ id, w, h }`.

## 5. Decisions (the owner's, 2026-10-03)

- **D1.** Glass cards with the Instrument layout: one ring, gauge, or icon and
  figure leads every widget.
- **D2.** Three fixed sizes like Apple's: Small, Medium, Large.
- **D3.** Rings only for real progress; everything else is an icon and a
  figure.
- **D4.** A ring and its icon take the service's colour; a filled icon in an
  empty ring means no bills yet.
- **D5.** Overdue: the ring and its words are `#D3212D` in light and dark.
- **D6.** "2 / 3" in rings; the unit rule for gauges (four characters).
- **D7.** Buttons: full width at the foot of Large, round at the top right of
  Medium, none on Small.
- **D8.** The Reduce Transparency setting is gone and the scene is the
  canvas's background (both built 2026-10-03, commit `74b0f56`).
- **D9.** Widgets from third parties are far-future scope (§6).

## 6. Far future: other people's widgets

Not planned, not designed, recorded so today's choices don't close the door.
The three-size contract is what would make it possible: a plugin would supply
a widget's data (an instrument, a figure, facts, rows, one action) and the app
would draw it, so every widget still looks like a sibling and no outside code
runs in the page. Anything like it needs its own scope: where plugins come
from, what a household's data they may read, review, and the regulated-money
boundary (a plugin must never move money either).

## 7. Stages

- **W1. The engine and the pieces.** The three sizes in the grid, conversion
  of saved layouts, the shared widget pieces and CSS, `/design` showing each
  piece. Tests for sizes, conversion and the unit rule.
- **W2. The six core widgets.** This month, Next due, a service, Settle up,
  Weather, Inbox, with all five states. Check the demo against boards H, I
  and J.
- **W3. The rest.** The fifteen on boards K and L. Check against the canvas.
- **W4. Edit Home.** The size picker, the Add panel with preview, the empty
  slot. Check against board P, mouse, touch and keyboard.
- **W5. The wall and the sweep.** The wall's scaled blocks (board N), iPad
  portrait (board M), light and dark at four sizes, BRAND.md, the decisions
  log.

Stop and check in with the owner between stages.

## 8. The questions and the owner's answers (2026-10-03: all as recommended)

- **Q1. Does the density setting stay?** Answer: yes. Comfortable,
  Standard and Dense still change how many blocks fit a screen; only the sizes
  a widget can take become three.
- **Q2. Layouts saved before this.** Answer: convert, never reset. 1×1
  stays Small; anything one block high and wider becomes Medium; anything two
  or more blocks high becomes Large; then the page is packed again, with
  overflow moving to the next page as it does today.
- **Q3. "Shares settled" merges into Settle up.** Answer: yes; a saved
  layout holding both keeps one.
- **Q4. The overdue red as a token.** Answer: a new `--overdue`
  (`#D3212D` in both themes), used by widgets only; `--bad` stays for other
  warnings. BRAND.md §1 records it beside the Pyrope ramp.
- **Q5. What a tap does.** Answer: the whole widget opens its page (the
  bill, the service, Money, Inbox…); a button does its action without leaving
  Home.
- **Q6. Small text in red on dark.** `#D3212D` at 12 px on a dark card is
  about 3 : 1, under the 4.5 : 1 BRAND.md §10 asks for. Answer: keep the
  colour (the owner's choice) and set those words in bold at 13 px.
- **Q7. Widgets with nothing to show.** Answer: Heads-up, Instalment
  plan and Season ahead leave the Add list when there is nothing for them, and
  one already on Home shows its quiet state rather than vanishing.
