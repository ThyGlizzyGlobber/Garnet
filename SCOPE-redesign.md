# Scope: the redesign ("Almanac 2")

_Approved by the owner, 2026-09-30: every recommendation in §4 accepted, with D5
extended (see §4a). R0 signed off by the owner, 2026-09-30 (§6a); the build runs
on the `redesign/almanac-2` branch. The stages in §6 run in order, each ending
with `npm run check`, a commit and a check-in, as the original phases did._

## 1. Goal

Ship the app looking **exactly** like the Redesign Studio's chosen direction:

- **Direction 6, Almanac 2**, with the **Frost Glass** component pack.
- **Five colour presets** (Ink & Mist, Harbour, Ruby, Cobalt, Violet), each in
  light and dark, chosen per person in Settings.
- The **floating nav column** on desktop, the **rail** on iPad and the **bottom
  bar** on iPhone.
- The calmer **widget Home** (6 widgets on page one), with Edit Home.

The reference is the studio itself: `brand-identity/inspiration/redesign-studio/`
(open `index.html`, press `6`). It is a working prototype with fictional data, so
its CSS values and markup can be carried over nearly as they are. That is what
makes "exactly" achievable.

**Done means:** every screen in §3 matches the studio side by side at the four
reference sizes (1440 × 900, iPad 820 × 1180 and 1180 × 820, iPhone 393 × 852), in
light and dark, in all five presets, using the demo household (§6, R8), and
`npm run check` passes.

## 2. Rules that apply everywhere

The owner's four rules from the studio, plus the brand rules they keep:

1. **No AI anywhere a household sees.** Documents say **Analysed**. No reader
   names, confidence, "read from the bill", sparkles or "smart".
2. **One page per bill.** A bill opens the same page from everywhere. Its email
   and files live on it. A bill paid by instalments is **listed once**.
3. **Services hold their bills.** Latest bills on the service, every bill on its page.
4. **Home is a widget grid that fits the screen**, paged, and editable by each person.
5. Kept from the brand: lead with the number; status is never colour alone (a
   word and a dot or icon); no photos; plain words, no exclamation marks.

## 3. What gets built to match the studio

| Area      | Studio reference                                                                                                                    | Today in the app                                                                      | Work                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Colours   | 5 presets × light/dark, blob scene follows them                                                                                     | Ink & Mist + Linen only; theme per browser cookie                                     | New tokens, per-person preset and theme, first paint without a flash              |
| Look      | Frost Glass: Bricolage Grotesque + Figtree, clear glass with a soft rim, word + dot status, glass controls, accent buttons          | Outfit + Manrope, v2 glass                                                            | Replace tokens, fonts and component finishes                                      |
| Nav       | Floating column (desktop), rail (iPad), bottom bar (iPhone). Home · Services · Bills · Money · Inbox; services list; you → Settings | Bottom pill: Home · Bills · Ledger · Services · Members; gear and inbox in the header | New shell; Ledger becomes Money; Members moves into Settings; Inbox joins the nav |
| Top bar   | Search field, Inbox, Add bill                                                                                                       | Brand, search, icons, Add bill                                                        | Simplify to match                                                                 |
| Home      | Widget grid: 6 widgets on page one, more on page two; pages with dots; Edit Home (long-press, drag, resize, remove, add, grid size) | Fixed tile layout, Household · Mine switch                                            | New grid, 20 widget types (6 new), editing, layouts saved per person and device   |
| Services  | Year ribbons: one line per service, one block per bill, a line for today; All · Household · Mine                                    | Tinted tile grid                                                                      | New layout on existing data                                                       |
| A service | Long-form page: sentence lede, per-bill usage chart, every bill by year, figures, split, coming up                                  | Service page with the same data                                                       | Re-layout                                                                         |
| Bills     | Month sections, big month names, one row per bill                                                                                   | Month groups; instalments listed per instalment                                       | Re-layout; instalments once (§4 D2)                                               |
| A bill    | The document beside it (with an Analysed stamp), details, split, plan, files, figures                                               | One page per bill already                                                             | Re-layout; the document preview (§4 D8)                                           |
| Inbox     | Bills address, filters, month groups, every row "Analysed"                                                                          | Inbox at /review                                                                      | Re-layout, wording, move into the nav                                             |
| Money     | Settle-up hero, a card per housemate, you owe / owed to you / between housemates                                                    | Ledger                                                                                | Re-layout; two new buttons (§4 D9)                                                |
| Settings  | Appearance first (5 presets, light/dark/automatic), then Your account, Emails, Household                                            | Settings plus separate member pages                                                   | Restructure; appearance saved per person                                          |

**Screens the studio doesn't show.** These are restyled in the same system (§6,
R6): adding and editing a bill, upload, the "Add bill" chooser, service forms and
the split editor, members and invites, confirming an Inbox document, Status
(operator), login, code, unlock, set PIN, setup, welcome, invite, privacy,
unsubscribe, the wall, errors, loading, and empty states.

## 4. Decisions needed from the owner

Each has a recommendation; "go with the recommendations" is a fine answer.

| #   | Question                                                                                                                                                                                                                                             | Recommendation                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Charts.** CLAUDE.md makes Recharts a hard constraint. The studio's charts are small plain-SVG pieces: the trend with its callout and crosshair, and the per-bill bars that span each bill's dates. Recharts only draws one chart in the app today. | Use the studio's SVG charts and remove Recharts (update the constraint). Matching them exactly with Recharts is harder, and the per-bill bars are awkward in it.    |
| D2  | **Instalments listed once** in Bills and everywhere else. This reverses the 2026-09-29 decision (listed per instalment).                                                                                                                             | Once, as your rule 2 says: next instalment's amount and date, dots for the rest, all inside the bill.                                                               |
| D3  | **Nav and URLs.** Ledger becomes Money; Members leaves the nav for Settings → Household; Inbox joins the nav.                                                                                                                                        | Yes. New URLs `/money` and `/inbox`, with `/ledger` and `/review` redirecting.                                                                                      |
| D4  | **Household · Mine** on Home has no place in the studio's Home.                                                                                                                                                                                      | Drop the Home switch. Mine lives on Services (All · Household · Mine) and in the "Just yours" widget.                                                               |
| D5  | **Where the preset and light/dark are saved.**                                                                                                                                                                                                       | On the person (the member record), so it follows them across devices, with a cookie for first paint. Everyone starts on **Harbour**; Ink & Mist stays one tap away. |
| D6  | **Preset names:** Ruby, Cobalt, Violet, or plain Red, Blue, Purple.                                                                                                                                                                                  | Ruby, Cobalt, Violet.                                                                                                                                               |
| D7  | **Home layouts** are saved per person and per device type (desktop, iPad portrait, iPad landscape, iPhone).                                                                                                                                          | Yes, stored in the database (new table), reset with "Reset" in Edit Home.                                                                                           |
| D8  | **The bill's document preview.** The studio draws a stand-in page.                                                                                                                                                                                   | Show the real first page, rendered once and kept beside the file. Keep the drawn page for emails and anything that can't render.                                    |
| D9  | **Money's new buttons.** "Remind everyone" and "Record a payment" don't exist yet.                                                                                                                                                                   | Build both, small: Remind emails housemates who owe you (at most once a day each); Record a payment marks one or more shares paid in one go.                        |
| D10 | **Emails in Settings.** The studio shows New bills / Reminders / Payments; the app has New bills / Reminders / Problems.                                                                                                                             | Keep the app's three, worded like the studio. No new email type.                                                                                                    |
| D11 | **AI wording that remains.** Settings has an AI section; Status shows AI reads.                                                                                                                                                                      | Households never see it. The operator's Status page may keep technical terms, since it's only for you.                                                              |
| D12 | **The wall (`/wall`).** Not in the studio.                                                                                                                                                                                                           | The Home grid in kiosk mode: no nav, bigger type, its own saved layout, refreshes every minute. Designed in the studio first (R0).                                  |
| D13 | **Oldest devices supported.** The design needs container queries, `color-mix`, `:has` and backdrop blur.                                                                                                                                             | iOS / iPadOS 16.4 and later, current Chrome, Edge and Safari. Please check the wall iPad's iOS version.                                                             |
| D14 | **Other five directions and packs.**                                                                                                                                                                                                                 | Not shipped. The studio stays in `brand-identity/` as the reference.                                                                                                |

### 4a. The owner's answers (2026-09-30)

"Go with your recommendations" for D1–D14, with one addition to **D5**:
everyone picks their colours **while getting set up**. That means the setup
wizard for a new household and the joining flow for a new member (an invite)
each get a colour step: the five presets and light / dark / automatic, with a
live preview. Everyone can change it later in Settings. The choice starts on
Harbour.

## 5. States the studio doesn't show (all must look finished)

- **New household, no bills yet.** Each widget has an empty state that says what will appear and offers the one action that fills it. Page one still reads as designed.
- **A household that doesn't split bills** (like the Smith Household). No Money in the nav, no Settle up or Settled widgets, no Split cards, and "Whose" wording without splitting, as today.
- **No postcode.** No weather or season-ahead widgets; a one-time "Add your postcode" card instead.
- **Many services** (the Smith Household has insurance, gardening and more). The column's services list scrolls after 8, with "All services". Colours follow the palette order as today.
- **Long names and big amounts.** Every row truncates with an ellipsis, never wraps into a number. Six-figure yearly totals still fit.
- **One member.** No personal/household wording, no avatar stacks.
- **Documents waiting.** "Waiting to be analysed", "Couldn't be analysed · try again", "1 detail to confirm" (a count of what needs checking).
- **Errors, loading and offline** (the PWA's saved copy). The same glass, with plain wording.
- **Keyboard and assistive tech.** Edit Home works without dragging: move and resize with the keyboard. Reduced motion stops the jiggle and drift. Reduced transparency makes the glass nearly opaque.
- **Small and very large screens.** On short windows (under about 760 px tall) the grid drops a row and pages instead of squeezing. On very wide screens the page caps at about 1600 px.

## 6. Work, in stages

Sizes are relative: S a short session, M about a day of work, L several.

**R0 · Design the unshown screens in the studio (L).** Add the screens from §3's
last paragraph, the wall and the §5 states to the studio as Almanac 2 + Frost
Glass. That includes the setup wizard and the invite joining flow, each with its
colour step (§4a). The studio gets a **household state** switch (Riverside House,
brand new, doesn't split bills, no postcode, one person, lots of services) so
every state can be seen on every screen. The owner signs them off before anything
is built, so "exactly as shown" covers every screen.

### 6a. R0 result (2026-09-30): signed off by the owner

Every screen and state is now in the studio (panel → Screen, and Household
state). Choices made while designing them, worth a conscious yes:

1. **Privacy page names Anthropic.** It says a bill's text or image is sent to
   Anthropic, "the service that analyses it for us". This is the one place rule 1
   bends, because the privacy notice has to name who handles the data. The
   §7 legal review may change the wording.
2. **Document wording:** Analysed, Analysing… (while uploading), Waiting to be
   analysed, Couldn't be analysed, and "N details to confirm".
3. **Setup wizard:** Household → Where → You → Colours. **Joining:** Invite → Sign in →
   Colours → PIN. Both start on Harbour.
4. **Money:** Record a payment is a sheet (who paid, which shares, how, when);
   Remind everyone sends at once and confirms with a toast.
5. **The wall:** clock and household at the top, four big widgets (this month,
   the week, next due, weather), its own editable layout, and Back to Home.
6. **Brand-new household:** a "Get started" widget with four steps, and every
   page empty with one clear action.
7. **Doesn't split:** Money leaves the nav, Settle up becomes Due dates, bills
   have no split card and say "everyone in the house sees it".
8. **Status** (operator only) keeps technical terms, per D11.
9. **Name:** sign-in pages say "Home Utilities" until the product is named.

**R1 · Foundations (M).**

- Tokens for the five presets × light/dark, status colours and neutrals, all in `globals.css`.
- The Frost Glass recipe as Tailwind components-layer classes.
- The scene reading the preset. Bricolage Grotesque + Figtree via `next/font` (JetBrains Mono stays).
- Migration: `member.appearance_preset` and `member.theme`. The root layout sets `data-palette` / `data-theme` on `<html>` from the session, so there's no flash; `theme-color` follows too.
- Rewrite BRAND.md to the new system.

**R2 · Components and icons (M).**

- Carry the studio's components over into `src/components/ui`: glass surfaces, buttons, icon buttons, segmented control, toggle, word + dot chips, discs, avatars, the bill row, document row, share row, key–value list, section head, notice, timeline, figures, address card, sheet, toast.
- Instruments in `src/components/charts`: ring, arc, sparkline, trend, per-bill bars, stacked bar, forecast pills, calendar grid.
- Missing stroke icons added to `icons.tsx`.
- Each piece checked against the studio's Components view.

**R3 · Shell and nav (M).**

- Floating column (≥ 1100 px wide), rail (640–1099), bottom bar (< 640), with safe areas.
- The column's household header, services list with this month's amounts, and you → Settings.
- The simplified top bar. The route changes from D3. Members reached from Settings.

**R4 · Home (L).**

- The grid engine: packing, pages, snap scrolling, dots, rows that fit the window.
- The 20 widget types and their sizes, with the six new ones:
  - calendar (`dueItems`)
  - recent activity: new `src/lib/activity.ts` over share `paid_at`, `paid_to_provider_at` and documents
  - "This week in the house": new `src/lib/week-summary.ts`, sentences as ICU messages
  - service tiles
  - quick actions
  - season ahead
- Edit Home: long-press, the floating drag ghost, page flip at the edges, the size badge, remove, the widget gallery with live previews, grid size, and the keyboard alternative.
- Persistence: new `home_layout` table and a server action. Defaults are the studio's calmer layout per device.

**R5 · The shown screens (L).** Services, a service, Bills, a bill, Inbox, Money
(plus D9's two actions), Settings (Appearance first, then the existing account,
emails, household, location, area comparisons, export, and the operator and admin
tools, in the same style). Each built from the existing view functions
(`homeView`, `serviceOverview`, `personalSummary`, `billFiles`, `statusView`), so
the logic doesn't change.

**R6 · The unshown screens and states (L).** Everything R0 designed, including the
wall, the Add bill chooser and every §5 state.

**R7 · Wording audit (S).**

- Every household-facing string in `messages/en.json` and the lib messages checked against rule 1. Documents: Analysed / Waiting / Couldn't be analysed / N details to confirm.
- Instalments listed once (D2).
- `tests/messages.test.ts` extended to fail on banned words ("AI", "read by", "confidence", "smart").

**R8 · Match check and release (M).**

- Update the demo seed (`src/db/demo-seed.ts`) to the studio's Riverside House data: Northwind, Hearthline, Riverbend, Brightline, Harbour Lane, City of Riverside's instalments, Alex's car rego, Sam moving in on 1 August. With that, screenshots of the app and the studio can be compared directly.
- A small screenshot script renders both at the four sizes, light and dark, in all five presets, for every screen in §3. Differences get fixed until they match.
- Then `npm run check`, a production build, a check on a real iPad and iPhone (and the wall iPad), CLAUDE.md's status and decisions log, and a push for the NAS update.

## 7. Not in this scope

The other five studio directions and packs; new features beyond what the studio
shows (apart from D9's two buttons); product name and domain; web push; PDF
statements; digests.

## 8. Risks

- **Real data isn't demo data.** Long provider names, many services and odd
  amounts. §5 covers it, and R8 checks the owner's own household too.
- **Glass on older iPads.** Backdrop blur is heavy; the Home page keeps to about
  10 blurred surfaces. Reduced transparency is the fallback.
- **Two sessions in one folder.** Another session has been committing here; the
  redesign should run on its own branch until R8.
