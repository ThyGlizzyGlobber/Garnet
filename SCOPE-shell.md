# Scope: the side menu and the frame

_Drafted and finalised 2026-10-05 from the design canvas the owner and the assistant worked
through that day ("Garnet Home Widgets",
https://claude.ai/artifact/8eR7HgonFF1rQXzV3qXyDt; boards Z6 to Z9 and AH are
the settled design, Q to Z5 the rounds that led there, including a top header
that was tried on boards S to Y and dropped). **Being built from 2026-10-05: F1 and F2 done.** The owner's
decisions are in §5 and their answers to the questions in §8 (two are still
open: notifications and the account area's menu); the build order is §7._

## 1. Goal

The side menu redrawn in the widgets' language, and the whole screen laid out
on one frame so the menu and the page share their lines. The menu becomes a
**stack of glass cards**, each one a small widget. Home's widget grid fills
the space beside it exactly. Edit Home is entered from the widgets
themselves, and its Add a widget panel takes the menu's place.

**Done means:** the desktop shell matches boards Z6 to Z9, light and dark;
every page sits on the same frame; the menu still does everything it does
today (switching household, the six links, services with their groups and
arranging, your own services, the account menu); iPad and phone follow the
answers in §8, and the account area follows once its menu is drawn and agreed; `npm run check` passes; the demo
matches the canvas.

## 2. What exists today (facts the scope builds on)

- **The shell** (`src/components/app/shell.tsx`, `src/styles/shell.css`,
  numbers from `shellView()` in `src/lib/shell.ts`): a full-height graphite
  column 292 px wide from 1200 px, a rail of icons from 640 to 1199 px, a
  bottom bar under 640 px. A top bar holds the page's way back (`#tb-back`),
  search and Add bill.
- **The column's parts**, top to bottom: the Garnet mark and name; the
  household switcher (name and member count); the links (Home, Services,
  Bills, Money when bills are split, Members, Inbox with its count); Services
  with each person's own groups, Other Services and My Services, arranged by
  dragging (`nav-services.tsx`, `nav-group.tsx`, `nav-drag.ts`, saved in
  `member.nav_layout`); the person at the foot, who opens the account menu.
- **The account variant** of the same column (`/account`, `/console`):
  Overview, Households, My Account's pages, Developer.
- **Home** (`src/components/home/home-grid.tsx`, `src/styles/home.css`): a
  greeting and date line, an Edit Home button, a square-block grid centred in
  the page (desktop 4×3 · 5×3 · 6×4, default 5×3), page dots, and Edit Home
  with a bar, a size picker and an Add panel that opens as a sheet.
- **The widgets** are built (`SCOPE-widgets.md`). This scope does not change
  how a widget draws.

## 3. The design

### 3a. One frame

The whole screen is one grid (board Z6): a 24 px margin all round, a menu
column 316 px wide, a 24 px gutter, then the page. A **top line** 56 px tall
runs across both: the Garnet mark and name on the left, the page's own
controls on the right. Under it, the menu's first card and the page's content
start on the same line, and the menu's last card and the content end on the
same line. No column background: the scene shows between the cards.

### 3b. The card stack

Five glass cards in the widgets' glass (`.glass`), 16 px apart:

1. **Household.** The month's ring (bills paid of bills due this month), the
   household's name and month, the month's total as the figure, what is left
   to pay, and an arrow. The whole card opens the household switcher.
2. **Links.** Six tiles, three across: an icon above the name. The current
   page's tile is filled with the accent. Inbox carries its count. Money is
   absent when the household doesn't split bills (five tiles).
3. **Services.** "Services" and "This month" as the heading, then the
   household's groups as small headings, each with a quiet row per service
   or main service: a colour dot, the name, this month's amount, and an
   arrow on a main service that opens its parts. Groups are the household's,
   arranged by admins (§8 Q1).
4. **My Services.** The person's own services as the same rows, arranged by
   that person. Absent when they have none.
5. **You.** Avatar, name, role, and the three dots that open the account
   menu. Fixed at the foot.

Cards 1, 2 and 5 never move. Cards 3 and 4 scroll together in the space
between the link tiles and the account card.

### 3c. The top line

Left: the brand. Right: **search** as a round button, then **Add bill** as a
filled pill with a plus and its words. Nothing else on Home. Other pages put
their way back and title here (§8 Q4).

### 3d. No greeting

The greeting and the date and weather line are gone from desktop, iPad and
phone. The wall display keeps its clock, date and weather.

### 3e. Home's grid on the frame

The grid fills the page area: at the reference size (1440 × 900) four columns
by three rows of square blocks fill it exactly, so desktop's default becomes
4×3 (the density called `comfy` today). The page dots sit small and centred
in the bottom margin and cost no height. The default first page at 4×3: This
month (Large), Next due, Weather and This week (Medium), Settle up and Inbox
(Small). No service has a widget by default, since services are always in
the menu beside the grid.

### 3f. Getting into Edit Home

No Edit Home button (board Z7). Pressing and holding a widget, or
right-clicking it, outlines it and opens a small menu: **Edit Home**,
**Change size** (Small · Medium · Large), **Remove widget** in the overdue
red.

### 3g. Edit Home

Board Z8. The edit bar takes over the top line: "Edit Home" and "Drag to
move · tap a widget to change its size" on the left; the grid size control,
Reset and Done on the right. There is no Add widget button. Widgets get
their remove button, the selected one its size picker, and empty blocks are
dashed with "Drop a widget here".

**The menu becomes Add a widget for the whole of edit mode** (boards Z8 and
Z9): one glass card the full height of the stack, with a search field, the
widgets not on Home as a two-column list, and a hint until one is picked.
Picking one shows its size picker, a live preview and Add to Home, and marks
the next free block on the grid. Done brings the menu back. The grid never
moves or changes size on entering or leaving.

### 3h. The two dropdowns

Board AH. Each card becomes part of its own dropdown when it opens: the two
read as one solid dark panel (near black in dark, white in light), not a card
with a menu beside it. Rows and tiles inside are a dark tint of the panel.

- **Household switcher.** The household card turns into the top of the
  panel. Under it, in the same container, each other household is a card
  with its month ring, its total and what is left to pay, ending in an
  arrow; the last card reads "Dashboard" and opens the account dashboard. It
  overlays the link tiles: nothing in the menu moves. The card under the
  pointer fills with the accent.
- **Account menu.** Your card turns into the foot of the panel and shows
  your email while open. Above it, in the same container: six tiles
  (Dashboard, Settings, Notifications, Profile, Appearance, Edit Home), then
  Wall display and Backend management (developers) as rows, then Sign out in
  the overdue red.

## 4. What changes in the code

- `shell.tsx`, `shell.css`: the frame, the top line, the card stack in place
  of the column; the graphite column's tokens and rules go.
- `shellView()`: the month's ring for the household card (bills and
  instalments due this month and what is paid, the figures `homeData()`
  already works out as `month.dueMinor` and `month.paidMinor`; one shared
  function so the card and the This month widget can never disagree).
- `nav-items.tsx`: the links as tiles. `nav-services.tsx`, `nav-group.tsx`:
  the same arranging inside the cards (§8 Q1, Q2).
- `household-switcher.tsx`, `account-menu.tsx`: redrawn as §3h, each joined
  to its card; `shellView()` gives the switcher each household's month ring
  and figures.
- `home-grid.tsx`, `home.css`: no greeting row or Edit Home button; the grid
  fills its cell; dots in the margin; the widget menu; the edit bar in the
  top line; the Add panel rendered in the menu's place (the shell exposes a
  slot the grid fills, as it does for `#tb-back`).
- `home-grid.ts`: desktop's default density and a 4×3 default layout that
  fills every page (the existing test covers it).
- `page.tsx` (Home): the greeting and date go; the area-comparisons notice
  for admins needs a new place (§8 Q7).
- `messages/en.json`: the widget menu's words; unused greeting and Edit Home
  words removed.
- `BRAND.md` §9 and the decisions log.
- **One migration:** the household's service groups (a `nav_layout` on
  `household`), filled once from an admin's current arrangement;
  `member.nav_layout` keeps only the person's own part (My Services and the
  order inside main services they own). Only admins may save the
  household's arrangement.
- **A one-off step** repacks saved desktop and iPad-landscape Home layouts
  onto four by three (§8 Q9).

## 5. Decisions (the owner's, 2026-10-05)

- **S-D1.** The menu is the card stack (board Q2, fleshed out as Z1), not the
  glass panel (Q1) or the instrument rows (Q3).
- **S-D2.** No top header. A header with the links was drawn (boards S to Y)
  and dropped.
- **S-D3.** Service rows in the menu are quiet: a dot, the name, the amount.
  The rings stay on the household card and in the widgets.
- **S-D4.** Search and Add bill sit at the top right of the screen, and Add
  bill keeps its words.
- **S-D5.** One frame for the whole screen, with the grid at four by three so
  it fills the space (board Z6).
- **S-D6.** No greeting or date line on desktop or phone; the wall keeps its
  own.
- **S-D7.** No Edit Home button. Press and hold or right-click a widget.
- **S-D8.** In edit mode there is no Add widget button: the side menu is the
  Add a widget panel until Done.
- **S-D9.** The household switcher shows each other household's ring and
  figures again (supersedes the plain dropdown of 2026-10-02), as an overlay,
  with "Dashboard" last.
- **S-D10.** The account menu is tiles for the six main places, rows for the
  rest.
- **S-D11.** An open dropdown and the card that opened it are one panel, in
  a darker grey than first drawn.

## 6. Not in this scope

Any change to how a widget draws; the wall display; the header concepts;
third-party widgets; the service pages themselves.

## 7. Stages

- **F1. The frame and the stack on desktop.** The grid frame, the top line,
  the five cards with today's behaviour behind them (switcher, links, service
  rows as links, account menu), every page sitting on the frame. Home keeps
  its current grid for now.
- **F2. Services inside the cards.** Household-wide groups arranged by
  admins (the migration), main services folding out, the two cards
  scrolling together, the empty state (§8 Q1 to Q3).
- **F3. Home.** No greeting; the grid fills its cell at 4×3 with the new
  default; dots in the margin; the widget menu; Edit Home with its bar in the
  top line and the Add panel in the menu's place.
- **F4. The other screens.** iPad and phone, to the answers in §8. The
  account area follows when Q10 is settled.
- **F5. The sweep.** Old shell and Home CSS and messages removed, BRAND.md,
  the check at desktop, iPad and phone in light and dark.

Stop and check in with the owner between stages.

## 8. The questions and the owner's answers (2026-10-05)

- **Q1. Groups in the Services card.** Small headings inside the one
  Services card, with "New Service Group" at the card's foot. **Changed by
  the owner: service groups are household wide, and only admins group and
  move services.** Everyone in the household sees the same arrangement.
  _Assumed, to confirm at F2:_ each household starts from its first admin's
  current arrangement; My Services stays each person's own to arrange.
- **Q2. Main services** (Vehicles, Health, Subscriptions…) fold out inside
  the card: the arrow opens the parts as indented rows, as today.
- **Q3. Scrolling.** Services and My Services (its own card, straight after
  Services) scroll together under the link tiles. The household card, the
  link tiles and the account card never move; the account card stays fixed
  at the foot.
- **Q4. The top line on other pages.** The page's way back and its title sit
  at the left of the page's part of the line, right beside the menu column;
  search and Add bill at the far right on every household page. The line is
  invisible: no background, no border, nothing else on it.
- **Q5. iPad.** Landscape: the full card stack and frame, as on desktop.
  Portrait: the phone design, enlarged, with the links across the bottom.
- **Q6. Phone.** The bottom bar of five links as one glass card; the
  household card across the top (ring, name, total, opening the switcher)
  with search and Add bill beside it; services stay on the Services page.
- **Q7. The area-comparisons notice. Open.** The owner: this is a
  notification, and the app needs notifications. Still to decide: whether a
  simple bell and panel go into this scope or notifications get their own
  scope first, and where the way in sits. Until then F3 leaves the notice
  where it can be seen (a one-time card above the grid).
- **Q8. A way into Edit Home without a mouse or touch.** The menu key or
  Shift+F10 on a focused widget opens the widget menu, and "Edit Home" is
  listed in the account menu.
- **Q9. People who already arranged Home.** Every desktop layout is repacked
  onto four by three: widgets keep their sizes and order, and those that no
  longer fit move to later pages. _Assumed:_ iPad landscape too, since it
  shares the frame. Edit Home still offers all three grid sizes afterwards.
- **Q10. The account area's menu. Parked.** A first drawing is board AA; the
  owner will come back to it. Until then the account area keeps today's
  menu, restyled only as far as the shared frame needs.
