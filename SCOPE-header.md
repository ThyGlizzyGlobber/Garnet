# Scope: the header bar

_Drafted 2026-10-06 from the design canvas "Garnet Header Navigation"
(https://claude.ai/artifact/28D65HMazoQnM3bZDexbvp). The settled boards are
T2 (the bar over Home), T5 (the Services panel, three columns), T7 (the bar
once the page has scrolled), T10 (a main service's row growing into its
parts) and N2 (the household and account dropdowns); N3 is the Services page
on this layout, which the Services scope will take up. Boards Y, H1 to H5,
S, T and U are the rounds that led there. The owner's decisions are in §5 and
their answers to the questions in §8; the build order is §7._

## 1. Goal

The side menu goes. One glass bar across the top holds the brand, the
household, the six links, search, Add bill and you. Services is a dropdown
panel of every service, led by its ring and where it stands, so the quick
links the menu gave are one click away on every page, and the whole width
under the bar belongs to the page.

**Done means:** on a desktop and an iPad on its side the shell matches T2,
T5, T7, T10 and N2, light and dark; the bar does everything the menu did
(switching household, the six links with the Inbox count, every service with
this month's figure, your own services, the account menu, Edit Home); the
phone is unchanged; the account area wears the same bar; `npm run check`
passes; the demo matches the canvas.

## 2. What exists today (facts the scope builds on)

- **Three layouts by shape** (`src/styles/shell.css`, `STACK_MEDIA` in
  `src/lib/home-grid.ts`): the card stack and frame on a desktop and any
  landscape screen 900 px wide or more; the phone's layout on a phone and any
  portrait screen under 1200 px; the graphite rail on landscape screens 640 to
  899 px wide.
- **The stack**: a full-width header (the Garnet mark and name, a rule, the
  household as its type's icon and name with the switcher's arrow, the page's
  way back in `#tb-back`; search, Add bill and you on the right), then a menu
  316 px wide of glass cards (the six link tiles; Services with the household's
  groups; My Services; you at the foot), with `#nav-add` for Edit Home's Add a
  widget panel and `#tb-edit` for its bar. The page sits beside the menu on a
  24 px frame.
- **Service groups** are household-wide (`household.nav_layout`, admins
  arrange them by dragging in the menu, `nav-services.tsx`, `nav-group.tsx`,
  `nav-drag.ts`, `src/lib/nav-store.ts`) with each person's own part in
  `member.nav_layout`. The Services page lays its tiles out in the same groups
  (`arrange`, `arrangeMine` in `src/lib/nav-layout.ts`).
- **The two dropdowns**: the household switcher, a plain list joined to the
  household button in the header; the account menu, your card turned into the
  foot of a panel with six tiles (Dashboard, Settings, Notifications, Profile,
  Appearance, Edit Home) and rows.
- **Home's grid on the stack** follows the render area in both directions
  (`stackGrid`, `flow`); Edit Home's bar and Add a widget portal into the
  frame's slots.
- **The account area** (`/account`, `/console`) wears the same stack with its
  own menu (Overview, Households, My Account's pages, Developer).

## 3. The design

### 3a. The bar (T2)

One glass bar, 60 px tall, 16 px in from the frame's edges, on every page of
the stack. Left: the Garnet mark and name, a hairline rule, then the
household as its type's icon and name with the switcher's arrow. Middle: the
six links as pills (Home, Services, Bills, Money when bills are split,
Members, Inbox with its count), the current one filled with the accent. The
Services pill always carries a small down arrow. Right: search (a round
button), Add bill (worded), your avatar.

The household name is capped at 24 characters with an ellipsis, as the stack's
header did, so a long name never pushes the pills off centre.

### 3b. The dropdowns (N2, T1)

Three dropdowns hang from the bar, each joined to what opened it: the
household list from the name on the left, the Services panel from its pill,
the account menu from your avatar. They wear the bar's own glass (the same
tint, blur and rim, a stronger tint than the bar so their rows have a steady
ground, and darker secondary text in light) and hang straight off the bar's
bottom edge with no gap, so the bar and the panel read as one surface. The
page dims behind an open dropdown.

Open on a click; the pill (or name, or avatar) stays lit. Close on a second
click, a click elsewhere, Escape, or choosing a row. Arrow keys move through
the rows and Enter opens one.

The household list and the account menu keep what they hold today; Edit Home
stays in the account menu's tiles (and on a widget's menu as built).

### 3c. The Services panel (T5)

820 px wide, centred under the pills. Each service is an instrument row: its
small ring (the same ring the stack's menu rows had: shares in, days left, a
tick when paid, Pyrope when overdue, empty when nothing is due), its name, a
status line, and this month's figure. Three rows across, in the household's
groups in their order (the groups the admins arranged), each group headed
with its name and its total; then My Services. The foot says "All services ·
$X this month · N to pay this week" (opening the Services page) and holds Add
service.

### 3d. A main service's row grows (T10)

A main service (Vehicles, Health, Lifestyle, Home & Property, Subscriptions,
Donations) carries an arrow after its name. On hover, or a press and hold on
an iPad, the row grows downward into a short list of its parts, the same
width as the row, over whatever is beneath: the row loses its bottom corners,
the list continues the same fill, the arrow turns to point down, and the list
ends with "Open <main service>". Clicking the row's name opens the main
service's page; clicking a part opens that service. The list closes as the
pointer leaves.

### 3e. The bar on scroll (T7)

The bar is fixed to the top and the page scrolls under it. Once the page has
moved, the bar takes a stronger tint and a hairline shadow at its foot, so
rows passing behind it never fight the labels. One class toggled by a scroll
listener; nothing else changes.

### 3f. The page's way back, and Edit Home

The way back ("← Bills") lives on the page, at the top left of its content,
above the page title; never in the bar. Edit Home's bar still takes over the
top line of the page (below the bar), and Add a widget becomes a panel at the
page's left edge where the stack's `#nav-add` slot was; the grid gives it the
room, as it does today.

### 3g. The three layouts

The bar replaces both the stack's menu and the iPad's rail: a desktop and any
landscape screen 900 px wide or more get the bar (on an iPad the word
"Garnet" drops and the mark stands for it; the panel goes to three columns at
900 px); the phone's layout, bottom bar and household card are unchanged on a
phone and any portrait screen under 1200 px; landscape screens 640 to 899 px
wide (the old rail) take the phone's layout too. The account area and the
console wear the same bar with their own pills (Overview, Households, then My
Account's pages, Developer for developers).

### 3h. Home's grid, and the width cap

With no menu, Home has the whole width under the bar and keeps following the
render area in both directions as it does today (`stackGrid`); on a wide
screen that gives six columns as T2 shows.

**The width cap, site-wide.** The bar and every page's content stop at
1600 px and sit centred in the window, with the scene filling the rest. On a
window wider than that the bar and the page keep their left and right edges
in line. Home's grid measures the capped width, so it never runs past six
columns or so; the Services page, Bills and the rest take the same cap in
place of today's 1240 px reading width on the stack.

### 3i. The Services page (N3, for the Services scope)

The column the menu used to have is where the Services page's three figures
go (this month, the calendar year, the financial year). This scope leaves
that column free; the Services scope draws the page.

## 4. What changes in the code

- **`shell.tsx` / `shell.css`**: the stack's menu (`st-links`, `st-hh`,
  `st-me`, the Services and My Services cards) and the rail go; the header
  becomes the bar with the pills; the three dropdowns gain the Services panel
  (`ServicesPanel`, from `shellView().services` which already carries every
  service with this month's figure and its ring data); the `scrolled` class.
  `STACK_MEDIA` and the three queries change so 640 to 899 px landscape takes
  the phone's layout.
- **`nav-services.tsx`, `nav-group.tsx`, `nav-drag.ts`**: arranging moves out
  of the menu onto the Services page (H-D3): an Arrange button for admins
  turns the tile sections into the drag-and-drop editor (the same store,
  `saveNavLayout`/`saveNavChildren`); the panel is read-only.
- **The width cap**: one `--site-w: 1600px` token; the bar's margins and
  `.main-in` take `max-width: var(--site-w)` and centre; Home's ResizeObserver
  measures inside it.
- **Home**: `#nav-add` becomes a slot at the page's left edge; `#tb-edit`
  stays as the top line of the page.
- **The account area** (`src/app/account/layout.tsx`, `console`): the same bar
  with its own pills.
- **Words**: `nav.allServices`, `nav.toPayThisWeek`, `nav.openMain`; the
  stack's card words that no longer apply go.
- **BRAND.md §9** and the CLAUDE.md log.

## 5. Decisions (the owner's, 2026-10-06)

- **H-D1.** The side menu and the rail go. One bar on a desktop and any
  landscape screen 900 px wide or more; the phone's layout everywhere else.
- **H-D2.** Services is a dropdown panel of instrument rows, three across, in
  the household's groups; a main service's row grows into its parts.
- **H-D3.** Arranging service groups moves onto the Services page; the panel
  follows what is arranged there.
- **H-D4.** The dropdowns open on a click and the pill stays lit; a main
  service's row grows on hover (press and hold on an iPad).
- **H-D5.** Home's grid keeps following the window.
- **H-D6.** A site-wide width cap of 1600 px: the bar and every page's content
  stop there and sit centred, the scene filling the rest.
- **H-D7.** The account area and the console wear the same bar with their own
  pills.
- **H-D8.** Money's pill carries a count of the housemates who owe you, in the
  same badge as Inbox.
- **H-D9.** No bell in the bar until notifications are scoped. The wall is
  unchanged.

## 6. Not in this scope

The Services page itself (its figures column, the Medium tiles): the Services
scope. Notifications (a bell) beyond where it would sit. The account area's
pages. A phone bar.

## 7. Stages

- **H1 · The bar.** The bar replaces the stack's header and menu on the
  stack; Home has the whole width; the household and account dropdowns hang
  from it; the way back moves onto the page. The rail layout gives way to the
  phone's. `npm run check`, commit.
- **H2 · The Services panel.** Instrument rows in the household's groups,
  three across, the growing row for main services, the foot. Arranging per Q1.
  Commit.
- **H3 · The small things.** The scroll state, the household name cap, a
  Money badge (Q6), keyboard handling for the dropdowns, Edit Home's slots.
  Commit.
- **H4 · The iPad and the account area.** The bar at 900 to 1199 px, the
  account area and console on the bar. Checked at 1180 × 820. Commit.
- **H5 · The sweep.** Dead CSS, words, BRAND.md, the log; a check on the demo
  at every size, light and dark. Commit.

## 8. The questions and the owner's answers (2026-10-06)

- **Q1. Arranging service groups.** Where does arranging go once the panel is
  read-only? **Onto the Services page** (H-D3).
- **Q2. Opening the dropdowns.** **Click for the panels, hover for the
  growing row** (press and hold on an iPad) (H-D4).
- **Q3. Home's columns.** **Follow the window**, with a **site-wide width cap
  of 1600 px** on the bar and every page (H-D5, H-D6).
- **Q4. The rail.** **The phone's layout; the rail goes** (H-D1).
- **Q5. The account area.** **The same bar with its own pills** (H-D7).
- **Q6. A Money badge.** **A count, like Inbox** (H-D8).
- **Q7. Notifications.** **Leave the bell out until scoped** (H-D9).
- **Q8. The wall.** **Unchanged** (H-D9).
