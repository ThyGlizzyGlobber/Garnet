# Garnet — Brand & Design System

The single reference for how the product looks, sounds and moves. The design is
**Almanac 2** with the **Frost Glass** material, chosen by the owner in the
Redesign Studio (`brand-identity/inspiration/redesign-studio/`, open
`index.html` and press `6`). The studio is the visual source of truth: where
this file and the studio disagree, the studio wins and this file gets fixed.
`SCOPE-redesign.md` says how and in what order the app is brought to match it.

Code reads these values from `src/app/globals.css` (every token),
`src/components/ui` (primitives), `src/components/charts` (instruments) and
`src/lib/appearance.ts` (the presets). Change this file and the tokens together.

## 1. Identity

**Name:** Garnet · by BRJ Labs (owner, 2026-10-01). Two syllables, a deep red
stone; the word comes from the Latin for pomegranate, many seeds making one
fruit, as housemates' shares make one bill. Say "Garnet"; "Garnet House" is the
two-word form if a trademark needs one. Garnet is a name, not a colour:
red means overdue in the app, so the brand stays on the presets and garnet is at
most an accent in the mark. It lives at `garnet.brjlabs.com`; bills addresses
stay `{alias}@brjlabs.com`. (`garnet.house` and `garnethouse.com.au` looked free
on 2026-10-01 if it ever needs its own domain.) The app is called Garnet
everywhere a person sees it: tab, home screen, sign-in, wall, emails. The mark
is a house outline in a rounded square; the app icon is `public/icon.svg`.

**Brand red:** Pyrope `#A8141F`, the classic blood-red garnet (owner,
2026-10-02, chosen over a brighter signal red, `#EC2309`, which read as an
overdue warning). Red and grey make up the brand identity. The new mark is a
faceted garnet drawn in Pyrope tones, lit from the top left (highlights ×1.4,
shadows ×0.9 of the Balanced cut, owner, 2026-10-02). **Pyrope ramp (owner, 2026-10-02):** 50 `#FCEDEE` · 100 `#F9D7D8` · 200
`#F3B4B8` · 300 `#EA868B` · 400 `#DE545D` · 500 `#D3222E` · 600 `#A8141F`
(Pyrope) · 700 `#810E18` · 800 `#550C13` · 900 `#330A0F`. Light mode: buttons
and links 600 (white on 600 is 7.5:1), chips 50 with 700 text. Dark mode:
buttons 500 (white on 500 is 5.2:1), links 300 (6.7:1 on 900 grey), chips 900
with 200 text; 600 is too dark to read on the dark grey (2.3:1). Pyrope is for the brand and for warnings
(overdue, payment problems), never for everyday buttons.

**Action colour: Graphite (owner, 2026-10-02)** for Mark paid and every other
button: 50 `#F5F5F5` · 100 `#EBEBEB` · 200 `#D6D6D6` · 300 `#B8B8B8` · 400
`#949494` · 500 `#757575` · 600 `#3A3A3A` · 700 `#2E2E2E` · 800 `#242424` · 900
`#1C1C1C`. Light mode: main buttons 600 with white text, quieter buttons 100 with
800 text. Dark mode: main buttons 200 with 900 text, quieter buttons 600 with
100 text. Chosen over teal, sapphire, emerald and gold so that red only ever
means Garnet or "needs attention". Overdue moves from `--bad` (`#a43b32` /
`#eca49d`) to Pyrope: 50 chips with 700 text in light mode, 900 with 200 in
dark.

**Brand grey:** neutral (owner, 2026-10-02, over warm, greige and cool slate):
50 `#F5F5F5` · 100 `#EBEBEB` · 200 `#D6D6D6` · 300 `#B8B8B8` · 400 `#949494` ·
500 `#757575` · 600 `#5C5C5C` · 700 `#454545` · 800 `#2E2E2E` · 900 `#1C1C1C`.
Pure grey, so the red carries all the warmth.

| #   | Facet           | Hex       | #   | Facet            | Hex       |
| --- | --------------- | --------- | --- | ---------------- | --------- |
| 1   | Top-left crown  | `#E04440` | 9   | Lower-right star | `#C00A15` |
| 2   | Left upper      | `#DF3433` | 10  | Bottom-left      | `#DE2526` |
| 3   | Left star       | `#CB1C22` | 11  | Left lower       | `#DF3433` |
| 4   | Top-right crown | `#8F111E` | 12  | Lower-left star  | `#BF1921` |
| 5   | Right upper     | `#7F0F1C` | 13  | Table highlight  | `#E8988E` |
| 6   | Right star      | `#BF1921` | 14  | Table right      | `#A0131F` |
| 7   | Bottom-right    | `#660C19` | 15  | Table sparkle    | `#DC0B12` |
| 8   | Right lower     | `#770E1C` | 16  | Table shadow     | `#8F111E` |

The outline has four corners (top, right, bottom, left) and a point halfway
along each edge; the table is the inner diamond, split into four from its
centre. Each edge triangle runs from a corner to the halfway point to the
table's corner, as in the Affinity file.

**One line:** Bills in, totals out, everyone knows their share.

**Personality:** calm, precise, domestic. A well-made thermostat, not a bank.
It sits on a wall in someone's living room, so it must blend with the décor
and never shout.

**Voice:** short sentences, plain words, second person. Say "Hey, Alex." not
"Welcome back, Alex!". State facts with the number first: "$367.61 to pay ·
2 shares". Never exclaim. Never blame ("overdue" is a fact, not a scolding).
Empty states say what will appear and offer the one action that fills it.

**Four rules from the owner:**

1. **No AI in the product's words.** A document that has been read is
   "Analysed", and that is all: "Analysing…" while an upload is read, "Waiting
   to be analysed", "Couldn't be analysed", "1 detail to confirm". No
   confidence, no reader names, no model. Two exceptions: the privacy page names
   Anthropic as the service that analyses bills, and the operator-only Status
   page keeps technical terms.
2. **A bill has one page.** Everything that came with it (its file, receipts,
   notices, figures, split, plan) lives on that page; every link to the bill
   goes there.
3. **Services hold their bills.** A provider is a service; its bills sit
   inside it.
4. **Every screen works on desktop, iPad and iPhone.**

**Overdue red (owner, 2026-10-03).** A Home widget that is overdue draws its
ring and the words that say how late it is in `#D3212D` (`--overdue`), in light
and dark. It is brighter than Pyrope 600 because Pyrope is too dim against a
dark card; it is used by widgets only, and `--bad` stays for other warnings.
Small overdue words are bold and never under 13 px.

## 2. Colour

### The Garnet scheme

There is one colour scheme, **Garnet** (owner, 2026-10-02; it replaces the five
presets, which were scrapped on 2026-10-01 with Ruby as a stand-in). People
still choose light, dark or automatic (follows the device), saved on their
account, with a cookie for the pages before sign-in. The roles, from §1:
neutral grey for the page, **Graphite** for buttons, links and the active state,
**Pyrope** red only for the brand mark and for warnings.

| Token                            | Light                         | Dark                    | Use                                           |
| -------------------------------- | ----------------------------- | ----------------------- | --------------------------------------------- |
| `--p-bg`                         | `#f5f5f5`                     | `#1c1c1c`               | page colour; also the browser's `theme-color` |
| `--p-ground`                     | `#fafafa` → `#efefef`         | `#242424` → `#181818`   | the scene's base, a 160° gradient             |
| `--p-glow1`                      | Pyrope at 16%                 | Pyrope at 38%           | the scene's warm glow, top-left               |
| `--p-glow2`                      | grey `#b8b8b8` at 55%         | grey `#5c5c5c` at 45%   | the glow off the right edge                   |
| `--p-glow3`                      | grey `#757575` at 22%         | Pyrope 700 at 24%       | the glow low on the left                      |
| `--p-accent`                     | `#3a3a3a` (Graphite)          | `#d6d6d6`               | main buttons, the active state, rings, links  |
| `--p-accent2`                    | `#5c5c5c`                     | `#b8b8b8`               | gradient partner for rings, arcs and progress |
| `--p-on-accent`                  | `#ffffff`                     | `#1c1c1c`               | text and icons on the accent                  |
| `--p-fg` · `--p-fg2` · `--p-fg3` | `#1c1c1c` `#5c5c5c` `#757575` | `#f5f5f5` at 100/70/50% | text: primary, secondary, tertiary            |

The tokens are keyed on `data-palette="garnet"` and `data-theme` on `<html>`
(set by the root layout before first paint); `SCHEME` and `SCHEME_BG` in
`src/lib/appearance.ts` name it, and `tests/appearance.test.ts` checks it is
complete in both themes, is the only scheme, and matches `SCHEME_BG`.

The mark is `GarnetMark` (`src/components/app/garnet-mark.tsx`): sign-in and
privacy show it beside the name. The app icon (`public/icon.svg`,
`icon-192.png`, `icon-512.png`) is the stone on `#1c1c1c`, inside the
maskable safe zone. Households keep their own house mark in the nav and on
the wall.

In Tailwind: `bg`, `fg`, `fg-2`, `fg-3`, `accent`, `accent-2`, `on-accent`.

### Status and neutrals

Status keeps its meaning whatever the decor. Overdue is Pyrope, the brand red:
red only ever means Garnet or "needs attention". Nothing green as an accent (the
owner's call); paid and settled use slate.

| Token                     | Light               | Dark                | Use                                         |
| ------------------------- | ------------------- | ------------------- | ------------------------------------------- |
| `--ok`                    | `#4a6079`           | `#93aac1`           | paid, settled                               |
| `--warn`                  | `#8a5a00`           | `#e8c47c`           | due soon, unusual, needs a look             |
| `--bad`                   | `#a8141f` (Pyrope)  | `#ea868b` (300)     | overdue, couldn't be analysed               |
| `--line` / `--line-2`     | ink 10 % / 16 %     | white 11 % / 18 %   | dividers, outlines                          |
| `--inset` / `--inset-2`   | ink 5 % / 8 %       | white 6 % / 10 %    | wells, rows                                 |
| `--track`                 | ink 9 %             | white 11 %          | ring and bar tracks                         |
| `--hatch`                 | ink 30 %            | white 32 %          | estimated / not yet billed (forecast pills) |
| `--tip-bg`                | `#fafafa`           | `#242424`           | chart tooltips (opaque, never glass)        |
| `--paper` · `--paper-ink` | `#fdfcf9` `#25231f` | `#f3f1ec` `#23211d` | the bill document preview                   |

Ink is `rgb(28 28 28)`, the neutral 900. In Tailwind: `ok`, `warn`, `bad`, `line`, `line-2`,
`inset`, `inset-2`, `track`, `solid` (the opaque glass colour), `tip`.

Status always comes with a word, never colour alone: a chip is a word with a
coloured dot, and "Analysed" has a small rotated square instead of a dot.

**Service and member colours** come from the validated eight-step categorical
palette in `src/lib/palette.ts` (light and dark steps): blue, orange, aqua,
yellow, magenta, green, violet, red. Discs, dots, bars and charts use the
service's colour; users may pick any colour, but defaults come from this set.
Colours go through `colourCss`/`tintStyle`, never raw hex in components.

**Rule for component CSS:** it never branches on light or dark itself. Every
difference between the themes is a token in the three mode blocks at the top of
`globals.css`; components only read tokens.

### Service colours (the same for every household)

Every top-level entry on the Services page wears a colour of its own, chosen
for what the thing is; nothing at the top level shares one. The parts inside
a main service wear shades of its colour (`src/lib/palette.ts`:
`SERVICE_COLOURS`, eight steps a family, "-1" darkest … "-8" lightest).

| Entry           | Colour  | Parts inside, in shades                                                                                                                                                                        |
| --------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Water           | Blue    |                                                                                                                                                                                                |
| Electricity     | Yellow  |                                                                                                                                                                                                |
| Gas             | Orange  |                                                                                                                                                                                                |
| Internet        | Violet  |                                                                                                                                                                                                |
| Phone           | Aqua    |                                                                                                                                                                                                |
| Rent            | Magenta |                                                                                                                                                                                                |
| Vehicles        | Slate   | Rego (base), Car insurance, Roadside, Servicing, Something else                                                                                                                                |
| Health          | Red     | Health insurance (base), Ambulance cover, Something else                                                                                                                                       |
| Lifestyle       | Lime    | Gym (base), Something else                                                                                                                                                                     |
| Home & Property | Brown   | Council Rates, Land Tax, Strata, Building and Contents insurance, Gardening (base), Cleaning, Pest control, Pool & spa, Repairs, Something else (ninth to eleventh shades for the extra parts) |
| Subscriptions   | Plum    | each subscription a shade in charts                                                                                                                                                            |
| Donations       | Green   | each charity a shade in charts                                                                                                                                                                 |
| Other           | Grey    |                                                                                                                                                                                                |

Members keep the eight-colour palette. Series that share a colour in a chart
(Netflix and Spotify) get shades of it.

## 3. The scene

Behind everything, fixed to the viewport (`<Scene />` in the root layout):

- the **ground** (`--p-ground`);
- three **glows** that hold still (owner, 2026-10-03, from the widget design
  canvas): elliptical radial gradients fading to transparent at 70 %. Pyrope at
  12 % 6 % (about half the screen wide), a grey one at 92 % 38 %, and a third
  at 20 % 92 % (grey in light, deep Pyrope in dark). Each keeps a minimum size
  (520, 620 and 560 px wide) so a phone still gets the wash.

No photographs, no drifting blobs, no film grain, no vignette, and no
brightness filter on the scene.

## 4. Typography

Three faces, self-hosted through `next/font`, so the container makes no font
requests.

| Role                                               | Face                                                 | Settings                                                  |
| -------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| Display: headings, big figures, preset names       | **Bricolage Grotesque** (with its optical-size axis) | weight 620, letter-spacing −0.03 em, `text-wrap: balance` |
| Body, UI and numbers                               | **Figtree**                                          | 15 px body, 13 px secondary, numbers weight 600           |
| Mono: bills addresses, invoice numbers, references | **JetBrains Mono** 400–500                           | identifiers only, never prose                             |

Tokens: `--f-display`, `--f-body`, `--f-num`, `--f-mono`, `--fw-display`,
`--fw-num`, `--ls-display`. Tailwind: `font-display`, `font-sans`, `font-mono`.

Scale (px): 11 eyebrow (uppercase, 0.13 em tracking, 600) · 13 small · 15 body
· 17 h3 · 21 h2 · 32 h1 (40 for Home’s heading). Tabular figures
everywhere (`font-variant-numeric: tabular-nums` on the body) so money columns
align. Never all-caps except eyebrows. Never below 11 px.

Outfit + Manrope (the previous faces) are retired; the Ink & Mist preset keeps
the old colours, not the old type.

## 5. Material: Frost Glass

Clear glass over the scene: more of the colour shows through than before, with
a soft specular rim catching light from the top-left.

| Token                           | Light                                             | Dark                        |
| ------------------------------- | ------------------------------------------------- | --------------------------- |
| `--g-bg`                        | `rgba(250,251,253,.32)`                           | `rgba(255,255,255,.07)`     |
| `--g-bg-strong`                 | preset page colour 62 % over white 30 %           | preset page colour 72 %     |
| card blur · saturate            | 8 px · 165 % (`--g-card-blur`, `--g-card-sat`)    | the same                    |
| strong blur · saturate · bright | 30 px · 150 % · 1.05                              | 30 px · 150 % · 0.96        |
| `--g-rim` (1 px card ring)      | white 34 %                                        | white 13 %                  |
| `--g-lens` (inner glow, 18 px)  | white 20 %                                        | white 6 %                   |
| `--g-hi` (1 px top highlight)   | white 85 %                                        | white 22 %                  |
| `--g-spec` (rim, top-left)      | white 92 %                                        | white 45 %                  |
| `--g-shadow`                    | `0 28px 56px -30px` + `0 2px 8px -4px`, blue-grey | the same, black 70 % / 30 % |
| `--g-solid`                     | `#f7f8fa`                                         | `#262b34`                   |
| `--ctl-bg` · `--ctl-rim`        | white 42 % · 70 %                                 | white 9 % · 16 %            |

The recipe (Tailwind components layer, so utilities on the same element win):

- **`.glass`**, a card: clear glass like the preset previews (owner,
  2026-10-01): `--g-bg` with a light 8 px blur and a mild saturation, so the
  scene's colour shows through; in dark it is smoked glass (a 30 % tint of the
  preset's page colour, dimmed to 0.88), so
  coloured lines and figures on a card stay easy to read while the glow still
  shows; `inset 0 0 0 1px rim, inset 0 1px 0 hi,
shadow` (no inner lens glow, which read as frost), and a `::before` that
  draws a 1 px gradient rim (spec → 14 % → clear at 52 % → 8 % → spec at 55 %),
  masked to the border.
- **`.glass-strong`**: `--g-bg-strong` (the preset's own page colour, so the
  nav is violet in Violet, not slate), 30 px blur and the inner lens glow, for
  anything that floats over content: the nav, sheets, menus.
- **`.glass-ctl`**: a small capsule sitting on glass (buttons, search,
  segmented controls): `--ctl-bg` with a 1 px `--ctl-rim` and the top
  highlight. No blur of its own.

Layers: **scene → glass → controls**. Never glass on glass on glass, and keep
a screen to about ten blurred surfaces (older iPads). The glass is always
glass: there is no Reduce Transparency setting and the device's
`prefers-reduced-transparency` is not followed (owner, 2026-10-03: a web app
keeps its look whatever the device setting). Changing light or dark fades
the page (a 0.45 s view transition), never a jump cut. Chart tooltips use `--tip-bg`, never glass.

## 6. Shape and spacing

- Radii: 26 window · 24 card · 16 inner (rows, wells, inputs) · 999 for every
  control, chip, disc and the nav. Tokens `--r-win`, `--r-card`, `--r-inner`,
  `--r-ctl`, `--r-chip`, `--r-disc`, `--r-nav` (Tailwind `rounded-win`,
  `rounded-card`, `rounded-inner`).
- Spacing: 20 card padding (`--pad`) · 16 widget padding (`--wpad`) · 14 gap
  (`--gap`).
- Controls: buttons 42 px (34 small); the bottom bar 58 px; touch targets ≥ 44 px.

## 7. Components

In `src/components/ui`, drawn with the studio's CSS (`src/styles/components.css`); `/design` shows every piece:

- **Buttons.** Primary wears the accent (`--p-accent`, inset highlight, a soft
  accent shadow); secondary is a glass capsule; plain is a text button.
- **Chips** are a word with a coloured dot (status), or glass capsules when
  they're filters (the chosen one wears the accent).
- **Segmented control**: glass capsule track; the chosen segment is lighter
  glass with a small shadow.
- **Discs** (service icons): the service colour mixed 22 % into white glass
  (26 % into dark), icon in the service colour, a thin tinted rim.
- **Avatars**: the member colour; stacks overlap.
- **Rows** (bills, documents, shares): a disc, two lines, the amount right; a
  1 px `--line` between rows; long names truncate with an ellipsis and never
  wrap into a number.
- Also: key–value lists, section heads, notices (a status tint at 8 %),
  timelines, figures, the bills-address card, sheets, toasts, the preset cards.

## 8. Instruments

Every card carries at least one visual besides text (Home's widgets have their own rules, §9). All drawn in
plain SVG on the server (`src/components/charts`, CSS in `src/styles/charts.css`),
no chart library; one hover layer (`hover.tsx`) gives every chart its tooltip.
The studio's `.ring` is `.gauge` here (Tailwind owns `ring`):

- **Ring**: 7-unit stroke, accent → accent 2 gradient, track `--track`; the
  figure sits in the centre.
- **Arc**: a half gauge with an end cap; the figure below.
- **Sparkline**: no axes, in the service colour, end dot.
- **Trend**: one smooth line with a soft area and a callout on the latest
  value; never a dual axis.
- **Per-bill bars**, **stacked bar** (who pays what), **forecast pills** (the
  first solid, the rest hatched), **calendar grid** (due dates).
- Tooltips on `--tip-bg`, text in text tokens, never the series colour.

## 9. Layout and navigation

The frame follows SCOPE-header.md (the design canvas linked there, boards
T2, T5, T7, T10 and N2) over SCOPE-shell.md's widgets' language. The shell
picks one of two layouts by the screen's shape, written out in
`src/styles/shell.css`'s header:

- **The bar (a desktop, and any landscape screen 900 px wide or more, such as
  an iPad on its side).** One glass bar, 60 px tall, 16 px in from the edges,
  fixed to the top; the page has the whole width under it. Left: the Garnet
  mark and name (on an iPad the mark alone), a hairline rule, the household
  as its type's icon and its name with the switcher's arrow (capped at 24
  characters). Middle: the six links as pills (Home, Services with a down
  arrow, Bills, Money when bills are split, Members, Inbox), the current one
  filled with the accent; Inbox carries its count and Money the number of
  housemates who owe you. Right: search, Add bill with its words, your
  avatar. Once the page has scrolled the bar takes a stronger tint and a
  hairline. No greeting: only the wall shows a clock and the date.
- **A site-wide width cap of 1600 px**: the bar and every page stop there and
  sit centred, the scene filling the rest.
- **The dropdowns are an extension of the bar**: the same glass with a
  stronger tint (`--dd-bg`) and darker secondary text in light, hanging off
  the bar's bottom edge with no gap, the opener lit in the bar's well; the
  page dims behind them. They open on a click and close on a second click,
  a click elsewhere, Escape or choosing a row; arrow keys move through the
  rows and Down on the opener opens it.
  - **The household switcher** hangs from the name: each other household as
    a row shaped like the button (its icon on a small tile and its name),
    then **Dashboard**.
  - **The Services panel** hangs from its pill's arrow (the pill's name
    opens the Services page), 820 px wide and centred:
    every service as a row, three across, led by a small ring that says
    where it stands this month (filled by the days left, a tick when paid,
    Pyrope when overdue, empty when nothing is due), its name, a status line
    and this month's figure, in the household's groups with their totals,
    then My Services. A main service's row carries an arrow and grows
    downward into its parts on hover (the row and the list one piece, the
    arrow turning down; a press on the arrow does the same for touch and
    keyboards), ending in "Open …"; the row's name opens its page. The foot
    says "All services · $X this month · N to pay this week" and holds Add
    service.
  - **The account menu** hangs from your avatar: your name and email, six
    tiles (Dashboard, Settings, Notifications, Profile, Appearance, Edit
    Home), then Wall display and Backend management (developers) as rows,
    then Sign out in Pyrope red.
- **Service groups are the household's** and only admins arrange them, on the
  Services page: Arrange opens a glass card holding the groups and My
  Services as draggable lines (a service or a whole group is dropped where an
  iOS-blue line shows, `--drop-line`; "New Service Group" opens a name field;
  a group renames on a double-click and its × asks "Are you sure?" in the
  heading). Everyone arranges their own My Services the same way. The panel,
  the Services page and each main service's page show the same order.
- **The page's way back** ("← Bills") sits on the page above its title, never
  in the bar. **Edit Home**'s bar takes over the bar, and Add a widget sits in
  a column at the page's left edge until Done.
- **The phone's layout (everything else: a phone, an upright iPad a size up,
  a narrow landscape window).** The household as a glass card across the top
  (its ring, name and total; it drops the plain list of households), search,
  Add bill and your avatar beside it; the links in one glass card along the
  bottom (five: Members is reached from Settings).
- **The account area and the console** wear the same bar with their own
  pills: Overview, Households, Profile, Notifications, Security & Access,
  Appearance, and Backend management for developers; the switcher there reads
  "Your households".
- **Switches** are iOS green when on (`--toggle-on`: `#34c759` light,
  `#30d158` dark) and the pale track when off.
- Money is hidden in households that don't split bills. Members live inside
  Settings; the wall display and Sign out are in the account menu. Old links to `/ledger` and
  `/review` redirect to `/money` and `/inbox`.
- The frame lives in `src/components/app/shell.tsx` with its CSS in
  `src/styles/shell.css`; its numbers come from `shellView()` (`src/lib/shell.ts`).
- **Home is a widget grid** (`src/components/home`, engine in `src/lib/home-grid.ts`;
  scope and decisions in SCOPE-widgets.md, the design canvas linked there).
  - **Blocks are square** and the grid keeps its ratio: a block's side is the
    smaller of what the width and height allow for the screen's columns and
    rows (desktop and iPad landscape 4×3 · 5×3 · 6×4, 4×3 by default, iPad
    portrait 3×4 · 4×5 · 4×6, phone 2×3 · 2×4 · 2×5 by density); pages scroll
    sideways with dots under them (in the frame's bottom margin on the
    bar's layout), and there is room around it for the cards' shadows. Under
    the bar the grid follows the window in both directions (four by three on
    a 13-inch laptop, more on a bigger screen), and the default Home is
    household widgets only: every service is in the Services panel.
  - **Three sizes**, like Apple's: Small 1×1, Medium 2×1, Large 2×2. A saved
    layout with an older size takes the nearest.
  - **One instrument leads every widget** (`pieces.tsx`, `widgets.css`): a ring
    (part of a whole) or a gauge (a reading against a limit) only for real
    progress; otherwise an icon and one figure. Small is the instrument over a
    figure and a name, together in the middle; Medium is the instrument beside
    a title, the figure and two or three facts; Large is Medium on top, then a
    chart or a list, then the action.
  - **Everything inside scales with the block** (`--u`, a hundredth of the
    tighter of a block's height and width), with small floors for a phone and
    no caps, so the wall's big blocks grow their words with their rings.
  - **Colour:** the ring and its icon wear the service's colour; a widget
    about the whole household wears Graphite; overdue is `--overdue` for the
    ring and its words, and nothing else is red.
  - **In a ring:** "2 / 3", never "2 of 3"; a unit shares the number's line
    up to four characters ("412L"), else sits underneath ("6.8" / "kWh").
  - **Buttons:** full width at the foot of Large, a round one top-right on
    Medium, none on Small (a tap opens what the widget is about). The wall
    shows none.
  - **States:** overdue (the ring full and red), all paid (full, a tick),
    nothing due (empty, a tick), no bills yet (empty, the service's icon
    filled), loading (empty, grey bars).
  - **A widget's menu** (press and hold, right-click, or the menu key /
    Shift+F10 on a focused widget): Edit Home, Change size (Small · Medium ·
    Large), Remove widget in the overdue red. Moving on from a press and
    hold lifts the widget into Edit Home. There is no Edit Home button on
    Home; the account menu has Edit Home too.
  - **Edit Home**: under the bar its own bar takes over it ("Edit Home"
    and "Drag to move · tap a widget to change its size"; the grid density,
    Reset, Done) and **Add a widget** takes a column at the page's left edge until Done: search,
    the list, a hint until one is picked, then its size, the widget as it
    will be, Add to Home, with the block it would go in marked on the grid.
    Elsewhere the bar sits over the grid with an Add widget button and the
    same panel in a sheet. Widgets show a round remove button in the
    top-left corner; a tapped one is outlined with a Small · Medium · Large
    picker under it; empty blocks are dashed with a plus and "Drop a widget
    here".
- **The wall** (`/wall`) is the same grid in kiosk mode: a clock, the household
  and the weather on top, four by two bigger blocks, its own layout, nothing to
  tap, Back to Home.

## 10. Motion

Blobs drift 40–52 s; controls and cards lift 2 px in 200–250 ms; rings and arcs
animate with CSS transitions only; charts draw without entry animation; Edit
Home jiggles. Everything stops under `prefers-reduced-motion`.

## 11. Iconography

Inline stroke icons at 1.8 px, round caps and joins, 18–26 px, from
`src/components/app/icons.tsx`. Each service type names its icon in the catalog
(`service_type.icon`; a test checks every type's icon exists). No emoji.

## 12. Accessibility

Text ≥ 4.5 : 1 on its actual glass; status is never colour alone; every icon
button has an `aria-label`; touch targets ≥ 44 px; the keyboard reaches every
action, including moving and resizing widgets; charts have a text equivalent
nearby; reduced motion is honoured (reduced transparency is not, by the owner's choice); iOS/iPadOS 16.4
and later.

## 13. Do / don't

- Do lead with the number; give every card an instrument; tint with the
  service colour; let the scene show through.
- Don't add a photo backdrop; don't use green as an accent; don't mention AI;
  don't stack glass on glass on glass; don't animate numbers; don't write
  colours or light/dark rules into components.
