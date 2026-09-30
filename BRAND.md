# Home Utilities — Brand & Design System

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

**Name (working):** Home Utilities · by BRJ Labs. Product names to test with
households: _Homebill_, _Housekeep_, _Tally_. The mark is a house outline in a
rounded square; the app icon is `public/icon.svg`. Sign-in pages say "Home
Utilities" until the product is named.

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

## 2. Colour

### Presets

Each person picks one of five presets, in light, dark or automatic (follows the
device). The choice is saved on their member record, so it follows them to
every device; a cookie remembers the last choice in a browser for the pages
before sign-in. Everyone starts on **Harbour**, automatic. The choice is made
in the setup wizard, when joining by invite, and in Settings → Appearance.

| Preset     | Blurb                                      | Light bg · accent · accent 2  | Dark bg · accent · accent 2   |
| ---------- | ------------------------------------------ | ----------------------------- | ----------------------------- |
| Ink & Mist | The original colours. Slate, mist and sand | `#e9e4dc` `#5b6f82` `#a77b5b` | `#12151b` `#b9c7d6` `#e0b48c` |
| Harbour    | Deep blue, sea glass and sand              | `#e3e8ec` `#2f5f86` `#b0814a` | `#0d141c` `#9cc4e6` `#e3be8a` |
| Ruby       | Warm reds with a touch of raspberry        | `#f0e4e3` `#a8283a` `#8e3b62` | `#170c0e` `#f28b8b` `#e79ab8` |
| Cobalt     | Clear blues, bright and simple             | `#e4e9f3` `#2356c2` `#2f86cf` | `#080d1a` `#8fb2ff` `#7fd0ff` |
| Violet     | Soft purples, calm and cool                | `#ebe5f3` `#6a3fc2` `#9450c4` | `#0f0a1a` `#c3a8ff` `#e0a3ff` |

Every preset sets the same twelve tokens, keyed on `data-palette` and
`data-theme` on `<html>` (set by the root layout before first paint):

| Token                            | Use                                                   |
| -------------------------------- | ----------------------------------------------------- |
| `--p-bg`                         | page colour; also the browser's `theme-color`         |
| `--p-ground`                     | the scene's base: a 160° gradient of three near tones |
| `--p-blob1` … `--p-blob4`        | the scene's four colour blobs                         |
| `--p-accent`                     | primary buttons, the active state, rings              |
| `--p-accent2`                    | gradient partner for rings, arcs and progress         |
| `--p-on-accent`                  | text and icons on the accent                          |
| `--p-fg` · `--p-fg2` · `--p-fg3` | text: primary, secondary, tertiary                    |

Any element may carry its own `data-palette` (the preset previews do), and
everything inside it follows. The full values are in `globals.css`, generated
from the studio's `js/palettes.js`; `tests/appearance.test.ts` checks every
preset is complete in both themes and that `PRESET_BG` matches.

In Tailwind: `bg`, `fg`, `fg-2`, `fg-3`, `accent`, `accent-2`, `on-accent`.

### Status and neutrals (the same in every preset)

Status keeps its meaning whatever the decor. Nothing green as an accent (the
owner's call); paid and settled use slate.

| Token                     | Light               | Dark                | Use                                         |
| ------------------------- | ------------------- | ------------------- | ------------------------------------------- |
| `--ok`                    | `#4a6079`           | `#93aac1`           | paid, settled                               |
| `--warn`                  | `#8a5a00`           | `#e8c47c`           | due soon, unusual, needs a look             |
| `--bad`                   | `#a43b32`           | `#eca49d`           | overdue, couldn't be analysed               |
| `--line` / `--line-2`     | ink 10 % / 16 %     | white 11 % / 18 %   | dividers, outlines                          |
| `--inset` / `--inset-2`   | ink 5 % / 8 %       | white 6 % / 10 %    | wells, rows, the preset cards               |
| `--track`                 | ink 9 %             | white 11 %          | ring and bar tracks                         |
| `--hatch`                 | ink 30 %            | white 32 %          | estimated / not yet billed (forecast pills) |
| `--tip-bg`                | `#fbfaf7`           | `#1f232b`           | chart tooltips (opaque, never glass)        |
| `--paper` · `--paper-ink` | `#fdfcf9` `#25231f` | `#f3f1ec` `#23211d` | the bill document preview                   |

Ink is `rgb(24 22 30)`. In Tailwind: `ok`, `warn`, `bad`, `line`, `line-2`,
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

## 3. The scene

Behind everything, fixed to the viewport (`<Scene />` in the root layout):

- the preset's **ground** (`--p-ground`);
- four **blobs**: radial gradients (`closest-side`, fading to transparent) sized
  78 %, 80 %, 86 % and 58 % of the screen width, placed top-left, right,
  bottom-centre and bottom-right, each drifting and breathing over 40–52 s
  (`drift1`–`drift4`, alternate, ease-in-out);
- **film grain** (SVG fractal noise, overlay blend) at 6 % light / 9 % dark;
- a **vignette** from 55 % out to `--vig`.

No photographs. The scene holds still under `prefers-reduced-motion`.

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

| Token                          | Light                                             | Dark                        |
| ------------------------------ | ------------------------------------------------- | --------------------------- |
| `--g-bg`                       | `rgba(250,251,253,.32)`                           | `rgba(255,255,255,.055)`    |
| `--g-bg-strong`                | `rgba(250,251,253,.58)`                           | `rgba(30,36,46,.56)`        |
| blur · saturate · brightness   | 30 px · 150 % · 1.05                              | 30 px · 150 % · 0.96        |
| `--g-lens` (inner glow, 18 px) | white 20 %                                        | white 6 %                   |
| `--g-hi` (1 px top highlight)  | white 85 %                                        | white 22 %                  |
| `--g-spec` (rim, top-left)     | white 92 %                                        | white 45 %                  |
| `--g-shadow`                   | `0 28px 56px -30px` + `0 2px 8px -4px`, blue-grey | the same, black 70 % / 30 % |
| `--g-solid`                    | `#f7f8fa`                                         | `#262b34`                   |
| `--ctl-bg` · `--ctl-rim`       | white 42 % · 70 %                                 | white 9 % · 16 %            |

The recipe (Tailwind components layer, so utilities on the same element win):

- **`.glass`**, a card: `--g-bg`, backdrop blur/saturate/brightness,
  `inset 0 0 18px lens, inset 0 1px 0 hi, shadow`, and a `::before` that draws
  a 1 px gradient rim (spec → 14 % → clear at 52 % → 8 % → spec at 55 %),
  masked to the border.
- **`.glass-strong`**: the same on `--g-bg-strong`, for anything that floats
  over content: the nav, sheets, menus.
- **`.glass-ctl`**: a small capsule sitting on glass (buttons, search,
  segmented controls): `--ctl-bg` with a 1 px `--ctl-rim` and the top
  highlight. No blur of its own.

Layers: **scene → glass → controls**. Never glass on glass on glass, and keep
a screen to about ten blurred surfaces (older iPads). Under
`prefers-reduced-transparency` the glass turns nearly opaque (`--g-solid`) and
stops blurring. Chart tooltips use `--tip-bg`, never glass.

## 6. Shape and spacing

- Radii: 26 window · 24 card · 16 inner (rows, wells, inputs) · 999 for every
  control, chip, disc and the nav. Tokens `--r-win`, `--r-card`, `--r-inner`,
  `--r-ctl`, `--r-chip`, `--r-disc`, `--r-nav` (Tailwind `rounded-win`,
  `rounded-card`, `rounded-inner`).
- Spacing: 20 card padding (`--pad`) · 16 widget padding (`--wpad`) · 14 gap
  (`--gap`).
- Controls: buttons 42 px (34 small); the bottom bar 58 px; touch targets ≥ 44 px.

## 7. Components

Carried over from the studio into `src/components/ui` (R2):

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
plain SVG (`src/components/charts`), no chart library (D1):

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

- **Desktop (≥ 1100 px): the nav column.** A floating strong-glass column,
  250 px wide, 16 px from the screen edges, radius 30: the household at the
  top, then Home · Services · Bills · Money · Inbox (42 px items, radius 14),
  then the services list with this month's amount beside each (it scrolls
  after about 8, with "All services"), and you at the bottom → Settings.
- **iPad (640–1099 px): the rail.** The same column at 92 px, icons only.
- **iPhone (< 640 px): the bottom bar.** Five items, 58 px, strong glass,
  above the safe area.
- Money is hidden in households that don't split bills. Members live inside
  Settings.
- **Top bar**: search on the left; Inbox and Add bill on the right.
- Pages keep a reading width of 1240 px; very wide screens cap at about 1600.
- **Home is a widget grid** sized to the screen, like the iPhone home screen:
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
nearby; reduced motion and reduced transparency are honoured; iOS/iPadOS 16.4
and later.

## 13. Do / don't

- Do lead with the number; give every card an instrument; tint with the
  service colour; let the scene show through.
- Don't add a photo backdrop; don't use green as an accent; don't mention AI;
  don't stack glass on glass on glass; don't animate numbers; don't write
  colours or light/dark rules into components.
