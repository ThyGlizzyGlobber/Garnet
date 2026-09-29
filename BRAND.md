# Home Utilities — Brand & Design System

The single reference for how the product looks, sounds and moves. Code reads
these values from `src/app/globals.css` (tokens), `src/components/ui`
(primitives) and `src/components/charts`. Change this file and the tokens
together.

## 1. Identity

**Name (working):** Home Utilities · by BRJ Labs. Product names to test with
households: _Homebill_, _Housekeep_, _Tally_. The mark is a house outline in a
rounded square; the app icon is `public/icon.svg`.

**One line:** Bills in, totals out, everyone knows their share.

**Personality:** calm, precise, domestic. A well-made thermostat, not a bank.
It sits on a wall in someone's living room, so it must blend with the décor
and never shout.

**Voice:** short sentences, plain words, second person. Say "Hey, Alex." not
"Welcome back, Alex!". State facts with the number first: "$367.61 to pay ·
2 shares". Never exclaim. Never blame ("overdue" is a fact, not a scolding).
Empty states explain what will appear and offer the one action that fills it.

## 2. Colour

Two themes from the same family. Accents are low-chroma so they read as
interior tones. Nothing green as an accent (owner's call); success uses slate.

| Token                   | Linen (light)           | Ink & Mist (dark)       | Use                                    |
| ----------------------- | ----------------------- | ----------------------- | -------------------------------------- |
| `--color-bg`            | `#e9e4dc`               | `#12151b`               | page ground under the scene            |
| `--color-window`        | `rgba(255,255,255,.42)` | `rgba(24,28,36,.55)`    | the big frosted window                 |
| `--color-surface`       | `rgba(255,255,255,.58)` | `rgba(255,255,255,.07)` | glass tiles                            |
| `--color-surface-2`     | `rgba(31,29,24,.06)`    | `rgba(255,255,255,.09)` | inputs, chips, tracks                  |
| `--color-surface-solid` | `#f7f4ef`               | `#1f242d`               | tooltips, anything that must be opaque |
| `--color-nav`           | `rgba(247,244,239,.88)` | `rgba(31,36,45,.88)`    | floating nav pill                      |
| `--color-border`        | `rgba(255,255,255,.9)`  | `rgba(255,255,255,.13)` | glass rims                             |
| `--color-border-strong` | `rgba(31,29,24,.12)`    | `rgba(255,255,255,.2)`  | input borders, dividers                |
| `--color-fg`            | `#1f1d18`               | `#f1ede6`               | text                                   |
| `--color-fg-muted`      | `#66625a`               | `rgba(241,237,230,.64)` | secondary text (≥4.5:1 on glass)       |
| `--color-accent`        | `#5b6f82` slate         | `#b9c7d6` mist          | primary actions, active nav, rings     |
| `--color-accent-2`      | `#a77b5b` clay          | `#e0b48c` sand          | gradient partner for rings and arcs    |
| `--color-success`       | `#4a6079`               | `#8fa6bd`               | settled, paid                          |
| `--color-warning`       | `#8a5a00` ochre         | `#e6c27a`               | pending, unusual                       |
| `--color-danger`        | `#a43b32`               | `#e8a09a` rose          | overdue                                |

Each status colour has a `-soft` tint for chips and banners.

**Scene blobs** (behind the window, blurred 70 px, drifting over ~40 s):
light: peach `rgba(255,190,140,.75)`, sky `rgba(150,175,200,.8)`, lilac
`rgba(190,170,210,.6)`, sage `rgba(160,200,190,.55)`; dark: amber
`rgba(224,160,110,.55)`, steel `rgba(80,120,170,.6)`, violet
`rgba(120,90,160,.5)`, teal `rgba(40,120,120,.45)`. Film grain at 6 % / 9 %
and a vignette finish the scene. No photographs.

**Service and member colours** come from the validated eight-step categorical
palette in `src/lib/palette.ts` (light and dark steps): blue, orange, aqua,
yellow, magenta, green, violet, red. Charts, swatches and tile tints use the
service's colour; users may pick any colour, but defaults come from this set.

## 3. Typography

Three faces, all self-hosted through `next/font` so the container makes no
font requests.

| Role                                      | Face                       | Why                                                                             |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| Display: greetings, headings, big figures | **Outfit** 500–700         | geometric, friendly, tight at large sizes; reads from across a room on the wall |
| Body & UI                                 | **Manrope** 400–700        | refined, slightly narrow, excellent at 12–15 px on glass                        |
| Mono: invoice numbers, references, IDs    | **JetBrains Mono** 400–500 | distinguishes identifiers from prose without looking like code                  |

Rules: display letter-spacing −0.01 em (−0.03 em above 60 px); tabular
figures everywhere a number can appear (`font-variant-numeric: tabular-nums`)
so money columns align; never all-caps except 10–11 px eyebrow labels with
0.08 em tracking; body 14–15 px, secondary 12–13 px, never below 11 px.

Scale (px): 11 eyebrow · 12/13 secondary · 14/15 body · 18 tile title ·
22–24 page subtitle · 32/42 greeting · 34–44 tile figure · 8 vw wall figure.

Alternatives considered (kept for future testing): Bricolage Grotesque +
Figtree (more editorial and characterful), Sora + Instrument Sans (more
technical). Outfit + Manrope won because the approved mockups used them and
they stay calm at kiosk sizes.

## 4. Surfaces & depth

- **Scene** → **Window** → **Tile** → **Control**. Four layers, never more.
- **Window** (`.window`): 34 px radius, `--color-window`, 1 px rim, blur 36 px,
  inner 1 px highlight, deep soft shadow. One per screen.
- **Tile** (`.glass`): 24 px radius, `--color-surface`, 1 px rim, blur 28 px,
  inner highlight, 2 px hover lift. Hero tiles add `bg-accent-soft` and an
  accent-tinted border.
- **Nav pill** (`.glass-nav`): 88 % opaque, blur 30 px. It floats over content,
  so it must not be see-through.
- **Service tint**: `color-mix(in srgb, <service colour> 30% → 10%, surface-solid)`
  as a 160° gradient.
- Radii: 999 pills · 24 tiles · 22 large inputs · 16 inner cards · 12 icon squares.

## 5. Instruments (what makes a tile not boring)

Every tile carries at least one visual element besides text:

- **Ring** (`Ring`): progress with a gradient stroke accent → accent-2 and a
  soft glow; centre holds the figure. Budget, shares settled.
- **Arc** (`Arc`): half-gauge with an end cap; figure sits below it. Your share.
- **Trend line** (`TrendLine`): one smooth line with a gradient area, a glow,
  point dots and a callout on the latest value; the service breakdown lives in
  the tooltip and the ranking, never in stacked layers. Never a dual axis.
- **Sparkline** (`Sparkline`, plain SVG): 12-month trend, no axes, in the
  service colour.
- **Forecast strip**: pill bars, first solid accent, the rest hatched.
- **Icon discs** (`IconDisc`): `glow` (product-style disc with a coloured halo,
  `.glow-disc`), `soft` (the icon in colour on a quiet disc) or `filled` (a
  solid square in the service colour, for list rows).
- **Avatars** (`Avatar`): initial on a gradient from the member colour to the accent.
- Building blocks for all of these live in `src/components/ui` (`Tile`,
  `Figure`, `Banner`, `Chip`, `Swatch`, `Avatar`, `IconDisc`); colours go
  through `colourCss`/`tintStyle` in `src/lib/palette.ts`, never raw hex.
- Bars, tracks and chips use `--color-surface-2` as the recessive track.

## 6. Layout & navigation

- One frosted window, max width 1400 px, 24–32 px inner padding.
- Header: brand left, search pill centre (desktop), icon buttons + account +
  solid "Add bill" right.
- Floating segmented **bottom nav** on every breakpoint: Home · Bills · Ledger
  (shared households) · Services · Members. Settings, wall and review live in
  the header. Content keeps 128 px clear above the pill.
- Grids: 3 or 4 tiles per row at ≥1024 px, 2 at ≥640 px, 1 below.
  Row proportions on the dashboard: `1.3fr 1fr 1fr` then `1.6fr 1fr 1fr`.
- Wall (`/wall`): two columns, sizes in `vw`, refreshes every minute.

## 7. Motion

Blobs drift 38–52 s alternate ease-in-out; tiles lift 2 px in 250 ms; rings
and arcs animate only via CSS transitions (no JS animation); charts render
without entry animation. Everything respects `prefers-reduced-motion`.

## 8. Iconography

Inline stroke icons at 1.8–2.2 px, round caps, 18–26 px, from
`src/components/app/icons.tsx`. Each service type names its icon in the
catalog (`service_type.icon`: wifi, bolt, flame, drop, home, landmark, shield,
car, …; a test checks every type's icon exists). No emoji.

## 9. Accessibility

Text ≥4.5:1 on its actual glass background (muted text is tuned for this);
status is never colour-alone (chip label + colour); every icon button has an
`aria-label`; touch targets ≥44 px; keyboard reaches every action; charts have
a text equivalent nearby (legend, ranking list). `color-scheme: light dark`
follows the device.

## 10. Do / don't

- Do lead with the number; do give every tile an instrument; do tint with the
  service colour.
- Don't add a photo backdrop; don't use green as an accent; don't put text
  directly on the scene (always inside the window); don't stack more than four
  translucent layers; don't animate numbers.
