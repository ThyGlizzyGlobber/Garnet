# Scope: Edit Home without a mode

_Drafted 2026-10-07 from the design canvas "Garnet Edit Home"
(https://claude.ai/artifact/LfLK2PCemxkhAFVB9eyRMQ); **built the same day**
(E1–E4, the decisions log in CLAUDE.md). The settled boards are E1
(moving without a mode), E3 (the gallery sheet, with the plus in each size's
corner and no caption under the sizes) and E4 (the sheet dropping to a strip
while something is dragged). E2 is today's widget menu drawn with the new
items; E5–E8 are the rounds that led to E3. The owner's decisions are in §5,
their answers to the questions in §8, the build order in §7._

## 1. Goal

Rearranging Home should feel like the Mac's desktop widgets: **pick a widget
up and move it, with nothing to switch on first**, and **add widgets from a
sheet that rises from the bottom over the page**, so the grid never loses a
column to a panel beside it. The owner's words: Edit Home "removes an entire
column", a "big yikes"; the gallery should be a popup from the bottom that
gets out of the way when you start moving things.

**Done means:** the grid keeps every column while the sheet is open; a widget
can be moved by dragging it with no edit mode; the sheet matches E3 and
drops to a strip as on E4; the widget menu does the rest; the old Edit Home
bar, its slot in the frame's top line and the Add a widget column are gone;
`npm run check` passes; checked on the demo at a desktop, an iPad and a
phone, light and dark.

## 2. What exists today (facts the scope builds on)

- **The engine** is `src/components/home/home-grid.tsx` (1,060 lines) over
  the pure `src/lib/home-grid.ts` (grids, packing, `moveItem`, sizes,
  `stackGrid`). State: `editing`, `selected` (the size picker), `menu` (the
  widget menu), `gallery` (the sheet off the stack), `aiming` (the block the
  Add panel's pick would take).
- **Edit Home today** is a mode. It starts from the widget menu's Edit Home,
  `/?edit=1` (the account menu), or moving on after a press and hold. In it:
  drag (a fixed-position ghost that follows the pointer, its block a
  placeholder, page flip at the edges), tap a widget for its Small · Medium ·
  Large picker, the remove button in a widget's corner, dashed empty blocks
  ("Drop a widget here"), arrow keys move a focused widget and Delete removes
  it. On the stack the bar (Edit Home, the hint, density, Reset, Done) is
  portalled into `#tb-edit` in the bar's top line and Add a widget into
  `#nav-add`, a 316 px column at the page's left edge (`.main-in` becomes a
  two-column grid: `shell.css` "Edit Home slots"), which is what narrows Home
  and drops a column. Elsewhere the bar sits over the grid and Add widget
  opens a `Sheet`.
- **Dragging** already needs no mode in the code: `startDrag` is called on any
  pointer down in edit mode and, outside it, after a press and hold that then
  moves. Outside edit mode a plain press starts a 520 ms timer for the menu;
  a press that moves more than 6 px cancels it. A widget is a link (its
  `WxSpec.href` under the content), so a click opens what it is about.
- **The widget menu** (`WidgetMenuPanel`, portalled to `body`): Edit Home,
  Change size as the sizes the grid allows, Remove widget. Opened by press
  and hold, right-click, or the menu key / Shift+F10.
- **Add a widget** (`AddPanel`): a search field, the widgets not on Home in two
  columns, the picked one's name and line, the Small · Medium · Large picker,
  the widget drawn at that size on a plain backdrop, Add to Home; `onPick`
  marks the block it would take (`aiming`). Add puts the widget in the first
  free space (`addItem` in the engine).
- **Density** (5×3 · 6×4 · 8×5 on the stack, a block size since 2026-10-05)
  and **Reset** live on the edit bar. **The wall** keeps its own Edit Home
  button and bar.
- **Words** under `home.edit.*` and `home.menu.*` in `messages/en.json`.
- **Layouts** are saved through `saveHomeLayoutAction` on every change; nothing
  here changes what is stored.

## 3. The design

### 3a. Moving without a mode (E1)

Press a widget and move it and it lifts at once, with the same ghost, the
same placeholder block and the same page flip as today. A press that never
moves is still a click (it opens the widget) or, held, the menu. On touch a
press and hold lifts the widget into a drag as it does on an iPhone; the
menu opens when the hold ends without moving. Dropping saves. There is no
edit mode to enter or leave, so the Edit Home bar, its hint, its slot in the
frame's top line (`#tb-edit`) and Done are gone. The dashed empty blocks show
only while something is being dragged or the sheet is open, since that is
when they mean anything.

### 3b. The widget menu (E2, as chosen with E1)

The menu keeps Change size (the three sizes in a row) and Remove widget. Edit
Home becomes **Add a widget**, which opens the sheet. The keyboard keeps its
part: arrow keys on a focused widget move it, Delete removes it, without any
mode.

### 3c. The gallery sheet (E3)

Add a widget rises from the bottom of the page in the bar's glass, inside the
site-wide cap, rounded on its top corners, about 440 px tall; the grid keeps
every column underneath. Its head: the title, the hint ("Drag a widget onto
Home, or add it"), then the density control, Reset and Done. Its body: on
the left a search field and the widgets not yet on Home in two columns under
Household and Services headings (one line per service; My Services under
their own heading); on the right the picked widget's icon, name and line,
and the widget drawn at Small, Medium and Large side by side, each with a
round plus in its top-left corner and the size's name under it. Dragging a
size onto Home places it where it is dropped; its plus adds it to the first
free block (§3c2 when none is free). Nothing is
picked until a widget is chosen; until then the right side says so in one
line. Done, Escape or a press on the page outside the sheet closes it; every
widget on Home is still a link to its page, so the sheet never blocks Home.

### 3c2. One page (owner, 2026-10-07)

Home is **one page**: the grid is the size of the screen and there are no
further pages, no sideways paging and no dots. When every block is taken the
plus and a drop say so ("Home is full · remove or shrink a widget") and add
nothing. A grid that shrinks (a smaller window, a denser density going the
other way, a phone) hides the widgets it has no room for (packing is
first-fit, so a Large may be hidden while a Small after it still shows); they stay in the saved layout, the sheet lists them first under
"Not on screen", and they show again when there is room. A one-off step on
the first start after this change folds every saved layout onto its first
page: widgets from later pages take the free blocks in their order, the rest
stay saved but hidden. A phone's grid is 2 × 4 blocks (2 × 5 at the densest),
so a phone Home holds at most ten Small widgets; the default phone layout is
cut to one page.

### 3d. Out of the way while dragging (E4)

Start dragging a size out of the sheet, or any widget on the grid while the
sheet is open, and the sheet slides down to a strip at the bottom holding
only its head, so the whole grid is in reach; the hole shows where the drop
lands. On the drop the sheet rises again with the same widget picked, so
several can be added in a row. A drag that ends off the grid puts the sheet
back with nothing added.

### 3e. The phone and an upright iPad

The sheet is the same `Sheet` as today, full height, with the three sizes
stacked and the plus on each; dragging a size out of it is not offered (a
finger drag over a sheet is a scroll). Moving widgets on the grid is press
and hold then move, as on a phone today. The widget menu is the same.

### 3f. The wall

The wall works the same way (built so in E1, rather than keeping an edit mode
alive for one screen): its widgets drag without a mode, its menu is the
same, and its Edit Home button at the foot of the grid reads Add a widget and
opens the sheet.

### 3g. What goes

The edit mode and `editing` state, the Edit Home bar and its `#tb-edit` and
`#nav-add` slots in the shell, the `.main-in` two-column rule and the Add a
widget column (`.add-card`), the size picker that opened under a tapped widget
in edit mode (the menu has it), the remove button in a widget's corner (the
menu has it), the `/?edit=1` entry (the account menu's Edit Home becomes Add a
widget, opening Home with the sheet up: `/?add=1`), and the words only they used.

## 4. What changes in the code

- **`src/lib/home-grid.ts`**: layouts hold one page (`pages` keeps its shape
  with one entry so `parseLayout` and the saved rows need no migration);
  `addItem` and `moveItem` refuse what doesn't fit instead of flowing to a
  new page; `hidden()` names the items past the grid's room; `toOnePage()`
  folds a saved layout for the one-off step (`src/worker/startup.ts`).
- **`src/components/home/home-grid.tsx`**: the pages, the snap scroller and
  the dots go; `editing`, `selected` and the edit
  bar go; `gallery` becomes the sheet on every device, with a `lowered` state
  while a drag is in flight; `onPointerDown` starts a drag on movement outside
  any mode (mouse and pen at once, touch after the hold); `AddPanel` becomes
  the sheet's body with the three sizes drawn together and draggable (`startDrag`
  from a preview carries a `fromGallery` id and size, dropping calls `addItem` at
  the cell); the widget menu's items change.
- **`src/components/app/shell.tsx`** and **`src/styles/shell.css`**: the
  `#tb-edit` and `#nav-add` slots and their rules go.
- **`src/styles/home.css`**: the sheet (`.hg-sheet`, its head, list and
  previews, the lowered strip, the rise and drop transitions, reduced motion
  honoured), the drop-hole and dashed blocks shown only while relevant; the
  edit bar's rules go.
- **`src/components/app/account-menu.tsx`**: Edit Home → Add a widget (`/?add=1`).
- **Words**: `home.edit.*` trimmed to what the sheet and menu use, plus the
  sheet's hint and the "pick one" line.
- **Tests**: `tests/home-grid.test.ts` covers `addItem` at a cell, a full
  grid refusing, `hidden()` and `toOnePage()`; the rest is interaction,
  checked in the browser.

## 5. Decisions (the owner's, 2026-10-07)

- **E-D1.** Moving needs no mode: a drag lifts a widget at once (E1).
- **E-D2.** Add a widget is a sheet from the bottom over the page in the
  bar's glass, the grid keeping every column (E3), the picked widget drawn at
  its three sizes with a plus in each size's corner and no caption under them.
- **E-D3.** While something is dragged the sheet drops to a strip and comes
  back on the drop (E4).
- **E-D4.** The Edit Home bar and the Add a widget column go.
- **E-D5.** Home is one page: no paging, no dots; a full grid refuses more
  and says so; what doesn't fit a smaller grid is hidden, not lost (§3c2).
- **E-D6.** On touch, a hold that ends without moving opens the menu and a
  hold that moves lifts the widget, as today (Q1).
- **E-D7.** Reset and density live in the sheet's head only (Q2); a
  right-click or press and hold on empty space on Home opens the sheet (Q3);
  a drop on an occupied block packs the others aside (Q5); a press outside
  the sheet closes it (Q6); the hint stays in the head (Q7).

## 6. Not in this scope

The widgets themselves, phone dragging beyond today's press and hold.

## 7. Stages

- **E1 · One page, moving without a mode.** Layouts folded to one page and
  the paging gone; drag from a plain press; the mode, the bar and the slots
  gone; the menu's items. Commit.
- **E2 · The sheet.** The gallery sheet on the stack with its three sizes and
  the plus; the phone's sheet; `/?add=1`. Commit.
- **E3 · Out of the way.** Dragging from the sheet, the strip, the drop and
  the return. Commit.
- **E4 · The sweep.** Dead CSS and words, BRAND.md §9, the log; a check on the
  demo at every size, light and dark. Commit.

## 8. The questions and the owner's answers (2026-10-07)

- **Q1. Touch: hold then move.** On a phone or iPad today a press and hold
  opens the menu and moving on from it starts a drag. Keep that (hold without
  moving = menu, hold then move = drag), or lift at once on a hold with the
  menu only from a second gesture? **Recommend: keep it.** **Keep it** (E-D6).
- **Q2. Reset and density.** In the sheet's head, as drawn, and nowhere else?
  Or also in the widget menu? **Recommend: the sheet's head only**, so the
  menu stays three items. **The sheet's head only** (E-D7).
- **Q3. Ways in to the sheet.** The widget menu's Add a widget and the
  account menu's. Should a right-click (or press and hold) on an empty part
  of Home open the sheet too? **Recommend: yes**, it is the natural place. **Yes** (E-D7).
- **Q4. The plus.** Adds to the first free space of the page in view, then
  the next page? **Recommend: yes.** **Neither: Home is one page**, with no
  further pages at all; the plus adds to the first free block, and a full
  grid says so. Asked what happens when more widgets than fit: **Home is
  full**, the grid stays the size of the screen, adding is refused with a
  message, and on a smaller screen the widgets that don't fit are hidden
  (E-D5, §3c2).
- **Q5. Where the dropped size lands.** The grid's packing moves other widgets
  out of the way as it does for a moved widget today. Keep that, rather than
  refusing a drop on an occupied block? **Recommend: keep it.** **Keep it** (E-D7).
- **Q6. Closing.** Does a press on Home outside the sheet close it, or only
  Done and Escape? **Recommend: a press outside closes it**, like the bar's
  dropdowns. **A press outside closes it** (E-D7).
- **Q7. The hint.** Keep "Drag a widget onto Home, or add it" in the sheet's
  head, or drop it once it is familiar? **Recommend: keep it**, it is the
  only text that says the previews can be dragged. **Keep it** (E-D7).
