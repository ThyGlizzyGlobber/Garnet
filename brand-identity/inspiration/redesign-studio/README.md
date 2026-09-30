# Redesign Studio

Six directions for the Home Utilities redesign, each with its own component
pack, all switchable live. Open **`index.html`** in a browser (double-click it;
it works offline apart from the web fonts).

Everything here is fictional demo data (Riverside House: Alex, Jordan, Sam).
Nothing in the app itself was changed.

## The four rules every mockup follows

1. **No AI anywhere.** Documents say **Analysed**. No confidence scores, reader
   names, "read from the bill", sparkles or "smart".
2. **One page per bill.** A bill opens the same page from Home, its service, the
   Bills list, the Inbox or Money. Its email and files live on that page.
   Instalments live inside their bill, so a bill is never listed twice.
3. **Services hold their bills.** Latest bills on each service's card, every bill
   on its page, grouped by year.
4. **Home is a widget grid** that fits the screen (5 × 3 desktop, 4 × 5 iPad
   portrait, 5 × 3 iPad landscape, 2 × 4 iPhone), paged when full. **Edit Home**
   (or long-press a widget) to drag, resize (size badge), remove (−), add (+ Add
   widget) or change the grid density (e.g. 4 × 3 · 5 × 3 · 6 × 4).

## Controls (left panel)

| Control | What it does | Key |
| --- | --- | --- |
| Mockups · Components · Rules | the device mockups, the component pack gallery, the rules | |
| Direction | the six mockups (choosing Almanac 2 also switches to Harbour and the left nav column) | `1`–`6` |
| Component pack | Match (the direction's own) or any of the six packs on any direction | `P` |
| Colours | the five presets people pick from in Settings, plus six more combos from the first round; the blob scene follows the colours | `C` |
| Appearance | light / dark / follow the device | `M` |
| Nav bar | bottom, top, left or right | `N` |
| Devices | desktop + iPad + iPhone together, or one at a time; iPad can rotate | `V` |
| Screen | 34 screens in four groups: the app, forms, getting in, everything else | `H` |
| Household state | Riverside House, brand new, doesn't split, no postcode, just me, lots of services | |
| | hide or show the panel | `\` |

Everything inside the mockups is clickable: nav, services, bills, widgets,
filters, **Mark paid**. Home layouts are remembered per direction and device in
your browser ("Reset every Home layout" at the bottom of the panel clears them).

## The six directions

| # | Direction | Pack | Idea |
| --- | --- | --- | --- |
| 1 | Springboard | Liquid | Liquid-glass widgets floating straight on the scene, like an iPhone home screen. Services are cards holding their latest bills; a bill is one tall glass sheet. |
| 2 | Console | Instrument | One big frosted window of dense instruments. Services become a month-by-month bill matrix: every bill of every service at once. |
| 3 | Almanac | Frost | Calm and editorial. Big type and sentences; services as a year of bills on one line; the bill page laid out beside a drawing of the bill itself. |
| 4 | Wallet | Tint | Services as a stack of tinted cards; pick one and its bills fan out as passes. The bill page is a pass with share stubs and a payment reference. |
| 5 | Desk | Vibrancy | A Mac/iPad app: sidebar, lists and an inspector side by side; collapses to one pane on iPhone. |
| 6 | Almanac 2 | Frost Glass | Almanac taken further: its pages, a floating nav column on the left (a slim rail on iPad, a bottom bar on iPhone) and a calm Home: six widgets on the first page (this month, the week in a few sentences, next due, weather, settle up, services), with the calendar, activity, forecast and season ahead on page two. |

## The six component packs

| Pack | Type | Glass |
| --- | --- | --- |
| Liquid | SF Pro (system on Apple devices) | clear, specular rim, lensing edge, capsules |
| Instrument | Outfit · Manrope · JetBrains Mono (today's faces) | frosted, hairline rim, tick-marked gauges, mono labels |
| Frost | Bricolage Grotesque · Figtree | matte and milky, no rims, status as word + dot |
| Tint | Sora · Instrument Sans | tinted by each service's colour, gloss, gradient buttons |
| Vibrancy | Geist · Geist Mono | macOS vibrancy, hairlines, compact, docked sidebar and tab bar |
| Frost Glass | Bricolage Grotesque · Figtree | builds on Frost: same type and word + dot status, on clearer glass with a soft specular rim, glass controls and accent buttons |

## R0: every screen, every state (2026-09-30)

For "exactly as shown", the studio now covers every screen the app has, in
Almanac 2 + Frost Glass (they render in the other directions too):

- **Forms:** Add a bill (chooser), Record a payment, new and edit bill, upload, confirm a detail, new service, service & split editor, members, a member, invite.
- **Getting in:** sign in, email code, unlock (PIN), set a PIN, welcome, the setup wizard (Household → Where → You → Colours) and joining by invite (Invite → Sign in → Colours → PIN). Everyone picks their colours as they join.
- **Everything else:** the wall (kiosk), Status (operator), Privacy, Unsubscribe, Not found, Error, Offline and Loading.
- **Household states** (panel → Household state): brand new (Get started, empty pages), doesn't split (no Money, no split cards), no postcode (Add your postcode instead of weather), just me, and lots of services with long names.

## Colour presets (Settings)

Everyone picks their own colours in **Settings → Appearance**, from five presets,
each with a light and a dark set, plus Light / Dark / Automatic:

| Preset | Colours |
| --- | --- |
| Ink & Mist | today's live colours: slate, mist and sand |
| Harbour | deep blue, sea glass and sand |
| Ruby | warm reds with a touch of raspberry |
| Cobalt | clear blues, bright and simple |
| Violet | soft purples, calm and cool |

The studio also keeps the other combos from the first round (Ember, Orchid,
Dune, Aurora, Graphite, Tide) under "More combos". Status colours (paid, due,
overdue) are the same in every preset so their meaning never changes; they
always carry a word and an icon too, which matters in Ruby where the accent is
also red.

## Files

```
index.html            the studio (open this)
css/studio.css        studio panel, stage, device frames, colour scene
css/app.css           every component's structure, the widget grid, nav positions
css/layouts.css       what makes each direction different
css/packs/*.css       the six component packs (tokens + finishes only; frostglass builds on frost)
js/palettes.js        the eight colour combos
js/data.js            fictional Riverside House data (bills, splits, instalments)
js/components.js      shared components: bill row, bill page parts, service page parts
js/widgets.js         the widget catalogue and the Home grid engine
js/screens.js         the six directions' screens
js/charts.js          rings, arcs, sparklines, trend and per-bill charts
js/gallery.js         the Components and Rules views
js/studio.js          controls, device frames, navigation
```

## Choices made along the way (easy to change)

- Nav items are Home · Services · Bills · Money · Inbox; settings and members sit
  behind the avatar.
- A bill paid by instalments is listed once, showing the next instalment and
  dots for all four, instead of once per instalment.
- The Unusual flag, season-ahead notice and "1 detail to confirm" are kept, but
  worded without any reference to how documents are processed.
