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

Every widget and card carries at least one visual besides text. All drawn in
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

- **Desktop (≥ 1200 px): the nav column.** A graphite panel at 75% down the
  whole left edge (`--side-bg`: `#242424` light, `#121212` dark, over a 24 px
  blur), 292 px wide, square (owner, 2026-10-02: full height, not a floating
  card, wider; solid was jarring, so 75%). It carries its own dark tokens, so
  its text, dropdowns and menus read light on graphite in both themes: the Garnet mark and name (Bricolage Grotesque SemiBold) at the top, then the household switcher as one quiet row, then Home · Services · Bills · Money · Members · Inbox
  (42 px items, radius 14), then the services with this month's amount
  beside each, and you at the foot.
- **The services in the column** are arranged by each person, by dragging
  (no edit mode), in two parts under bold titles: **Services** (the
  household's) and, under a rule, **My Services** (their own). Each part is
  laid out the same way: the person's groups, then the services in no group
  (under "Other Services" once there are groups), then a dashed button, "New
  Service Group" or "New Personal Group", that opens a name field. A service
  or a whole group (by its heading) is dragged where an iOS-blue line shows
  (`--drop-line`); a new group starts with a dashed "Drag services here"
  space; a group renames on a double-click and has a × on hover that asks
  "Are you sure? · I'm sure · Cancel" in the heading itself. A person's own
  services stay in My Services. The services inside a main service
  (Vehicles' vehicles, Donations' charities) drag into order the same way.
  The Services page and each main service's page show the same order.
- **Switches** are iOS green when on (`--toggle-on`: `#34c759` light,
  `#30d158` dark) and the pale track when off.
- **The household switcher**: the household's name drops down a plain list of
  every household you belong to (the current one ticked) and, under a line,
  **Dashboard** (the Account Dashboard). Starting or joining a household lives
  on the Dashboard, not here.
- **The account menu**: clicking yourself at the foot of the column (or your
  avatar in a phone's top bar) opens a menu, not on hover (owner): your name
  and email, then Account dashboard · Household settings · Notifications ·
  Appearance, then Wall display · Backend management (developers), then Sign
  out in Pyrope red. Menus are opaque (`--tip-bg`), never glass.
- **iPad (640–1199 px): the rail.** (An iPad in landscape, 1180 px, keeps the
  rail.) The same full-height column at 92 px, icons only; its menus open
  beside it.
- **iPhone (< 640 px): the bottom bar.** Five items, 58 px, strong glass,
  above the safe area.
- Money is hidden in households that don't split bills. Members live inside
  Settings; the wall display and Sign out are in the account menu. Old links to `/ledger` and
  `/review` redirect to `/money` and `/inbox`.
- The frame lives in `src/components/app/shell.tsx` with its CSS in
  `src/styles/shell.css`; its numbers come from `shellView()` (`src/lib/shell.ts`).
- **Top bar**: search on the left; Inbox and Add bill on the right.
- Pages keep a reading width of 1240 px; very wide screens cap at about 1600.
- **Home is a widget grid** (`src/components/home`, engine in `src/lib/home-grid.ts`,
  data in `src/lib/home-data.ts`) sized to the screen, like the iPhone home screen:
  5 × 3 on desktop and iPad landscape, 3 × 4 on iPad portrait, 2 × 4 on iPhone
  (each also comfier or denser). Six widgets on page one ("This month so far"
  is 2 × 2); more pages swipe sideways. **Edit Home**: long-press or Edit, then
  drag, resize, remove, add from the gallery, or change the grid size; works
  with the keyboard too. Layouts are saved per person and device type.
- **The wall** (`/wall`) is the Home grid in kiosk mode: clock and household
  at the top, four big widgets (4 × 2 landscape), its own layout, Back to Home.

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
