# Garnet UI redesign: implementation spec

Source: design sessions between Lisa and Claude, October 2026. This file is the single source of truth for the redesign. The files in `mockups/` are the visual reference (see "Using the mockups" below).

## How to use this with Claude Code

1. Put this file and the `mockups/` folder in the repo root.
2. Tell Claude Code: _"Read GARNET_REDESIGN_SPEC.md and the mockups folder. Implement it one page at a time in the order listed under 'Build order'. Reuse the shared components in section 3 rather than restyling each page. After each page, show me what changed and ask before moving on."_
3. Do the shared components first. Every page depends on them.

## 1. Design principles (apply to every page)

1. **One hero per page.** One thing is visibly the most important, and it is 2 to 3 times larger than everything else.
2. **Size encodes importance.** Money that is due or coming is full contrast and large. Quiet or zero items are dimmed.
3. **Never show the same number twice** on one page.
4. **No placeholders.** If a card has nothing real to show, remove it.
5. **Colour means status only.** Green is paid, complete or switched on, amber is due or expected, red is overdue (not yet used in the mockups). Use small badges, never coloured card backgrounds, except the switch, which is a status control. Everything else is neutral. Never rely on colour alone: pair it with a word or icon.
6. **Don't repeat a label on every row.** If every row says "Analysed" or "Paid", say it once at group level or use a small icon.
7. **Distinct, consistent icons.** One small monochrome stroke icon per category. Do not reuse the ring-and-checkmark across cards.
8. **Progressive disclosure.** Show the first few rows, then "Show all N". Detail lives behind a chevron.
9. **Keep positive zero-states** ("Nothing due", "A quiet week: nothing due in the next seven days.").
10. **Minimum 44px tap targets.** Real `button` and `a` elements, never clickable divs.

## 2. Design tokens

| Token                                        | Value                                                                                                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page background                              | `#120a0c` plus `radial-gradient(ellipse 60% 70% at 0% 45%, rgba(130,32,44,0.55), rgba(130,32,44,0) 70%)`                                                              |
| Text                                         | `#F4EEEE`                                                                                                                                                             |
| Text muted (secondary / tertiary / disabled) | `rgba(244,238,238,0.66)` / `0.56` / `0.40`                                                                                                                            |
| Card                                         | bg `rgba(255,255,255,0.05)`, border `1px rgba(255,255,255,0.14)`, radius `28px`                                                                                       |
| Row divider                                  | `1px rgba(255,255,255,0.08)` to `0.10`                                                                                                                                |
| Icon tile                                    | 44px, radius 14px, bg `rgba(255,255,255,0.08)`                                                                                                                        |
| Primary button                               | bg `rgba(244,238,238,0.92)`, text `#1a0d10`, pill radius, min-height 44px                                                                                             |
| Secondary button                             | bg `rgba(255,255,255,0.06)`, border `rgba(255,255,255,0.16)`, pill                                                                                                    |
| Paid (green)                                 | text `#86D9A6`, border `rgba(134,217,166,0.38)`, bg `rgba(134,217,166,0.12)`                                                                                          |
| Due / expected (amber)                       | text `#F0BE62`, border `rgba(240,190,98,0.38)`, bg `rgba(240,190,98,0.10)`                                                                                            |
| Avatar (Lisa)                                | `#C98A1B` with `#1a0d10` letter                                                                                                                                       |
| Font                                         | Bricolage Grotesque 400 / 500 / 600                                                                                                                                   |
| Type scale                                   | page title 56/600/-0.03em; month title 40; home hero number 96 (cents at 44, 50% opacity); summary number 44 to 64; row name 18/600; row amount 22/600; meta 14 to 15 |

Numbers always use `font-variant-numeric: tabular-nums`.

## 3. Shared components (build first)

- **TopNav.** Pill bar, height 60, radius 32, bg `rgba(14,7,9,0.6)`. Left: logo, household switcher. Centre: Home, Services, Bills, **Budget (new)**, Members, Inbox. All six mockups already show the new nav. The Budget icon is a wallet. Right: search, "Add bill", avatar. Active tab is a light filled pill. Order matters: the three money views sit together.
- **PageHeader.** Title at 56px, one-line muted subtitle, optional action buttons right-aligned.
- **Card.** See tokens.
- **ListRow.** Grid: icon tile, name plus muted sub line, status area, amount, chevron. A `quiet` variant dims everything for "nothing due" rows. A `paid` variant dims the amount and uses a plain green tick instead of a pill.
- **StatusPill.** Variants `paid`, `soon`. The `soon` pill carries a clock icon and a date, such as "Expected 26 Oct".
- **SegmentedControl.** Pill-shaped group, pressed state is a light fill. Use `aria-pressed`.
- **MonthSection.** Left column (month name, year and count, total) plus right column (a Card of rows). Collapses to one column under 900px.

## 4. Page changes

### Home (confirmed by Lisa, do not alter beyond this)

1. One hero card top-left: current month, large amount due or paid, bill list and a tap-to-drill six-month bar chart (each bar is a button). Header badge: "All paid" when applicable.
2. Delete the "Season ahead" placeholder card. Move weather to one small line in the header, or remove it.
3. Merge October and Services into the hero. Link "All N services" to the Services page.
4. Merge "Next due" and "Next six months" so the large upcoming figure (for example ≈$6,544 for November) appears once. "Coming up" is one card with a bar per month.
5. Keep "Nothing due" and "A quiet week: nothing due in the next seven days." exactly as written.
6. Keep the Due dates week strip, with today highlighted.
7. Result: 9 cards become 5.

### Services

1. Remove the Analytics sidebar. Replace it with one summary card: "October so far $677.43", a green "3 bills paid" pill, an amber "3 expected" pill, and a "Full analytics" link to Budget.
2. Replace the 11 category cards with one row per category inside two grouped cards: **Essentials** and **Other services**, each with its month subtotal in the heading.
3. Each row: icon tile, category name, one muted line (provider, usage, "12% lower than last year"), status pill (Paid or Expected date) or muted next-due text, amount (or a dash if nothing this month), chevron.
4. Rows with nothing due use the `quiet` variant.
5. Remove the large gauges, rings and oversized icons from the old design.
6. Keep the menu word **Services** (not "Utilities", which wouldn't cover subscriptions, health, vehicles or donations). Page subtitle: "Who you pay, and what they charge · 28 services" (the count is live). This also separates it from Bills, which are the individual invoices. Use the word "utilities" in marketing copy only.

### Bills

1. Within a month, group by action: **To pay**, **Expected**, **Paid**, each with a count. To pay is first, Expected is sorted by date.
2. Month column on the left: month, year plus bill count, total, and a Paid / Still to come split. September-style fully paid months show a single green "All paid" pill.
3. Remove the repeated "Recurring" chip. Show a small repeat icon after the name instead.
4. Remove the duplicated "Expected 14 Oct" text. The pill carries it once.
5. Names: `Electricity`, with the provider in the muted line ("Alinta Energy · covers 7 Sept – 6 Oct"). If the provider equals the name, show only the period.
6. Paid rows are dimmed with a plain green tick. Older months show the first 4 rows and "Show all N bills".
7. Keep search, the All / To pay / Paid / Unusual segmented control, Filters and Download. Remove the floating "Upcoming · 2" label.
8. October total is $1,141.51 (exact), not rounded to $1,142.

### Members

1. One card with a row per person: 56px avatar, name (with a quiet "You" tag on the current user), muted sign-in method plus "since" date, role pill (Admin outlined, Member subtle), chevron.
2. Subtitle: "3 people live at Smith Household". One primary "Invite someone" button top right.
3. Keep the note "This is a single household, so bills are not split. Members can still log in." as a quiet line below the list.
4. Keep Bejay's real photo avatar in the product. The mockup uses a plain letter only because the photo wasn't available.

### Inbox

1. Make the forwarding address the hero: a large card with a "Forward bills to" label, the address at 32px, and a primary "Copy address" button.
2. Remove the "Analysed" badge from every row. Show the outcome instead: amount on the right with "Filed to Electricity" beneath. Items with no filed bill show nothing on the right.
3. Group by month using MonthSection (month, year plus item count). Show the first 5 items, then "Show N more".
4. Segmented filter: All, To confirm, Bills, Receipts, Other. Show a green "Nothing to confirm" pill when that count is zero. This is the positive zero-state.
5. File type moves into the muted line ("Bill · forwarded by Norm Smith · 7 Oct"). Drop the tiny EML / PDF labels under icons. Use an envelope icon for email and a document icon for files.

### Account area ("Your households" nav): six tabs become three

The account-level area (reached from the household switcher) currently has six tabs: Overview, Households, Profile, Notifications, Security & Access, Appearance. Reduce to **Households, Notifications, Account**. The nav keeps the same pill style as the main nav (logo, "Your households" chip, tabs, avatar). Mockups: `Households.dc.html`, `Notifications.dc.html`, `Account.dc.html`.

**Why:** Overview and Households both list the same households and amounts. Appearance is a single light/dark setting. Profile and Security & Access are small and belong together.

**Households (replaces Overview and the old Households tab)**

1. Hero card: "You owe $0.00" (large) with "Nothing owed anywhere. Nice." On the right, "Due this month, all households $740.20" and two green pills, "Nothing overdue" and "Nothing to confirm". Show the zero-state pills only when the counts really are zero. When not zero, replace the pill with an amber (due or to confirm) or red (overdue) one that links to the item.
2. One list of households. Each row: icon tile, name, role tag (Admin, Owner / Landlord), a quiet "Primary" tag on the home household, stacked member avatars with "N members", "this month" amount, "you owe" amount. Row name is the link. A "More options" button (three dots) holds **Leave** and **Make primary** (formerly "Make it home"). Do not show those as always-visible text links, because Leave is destructive and should be deliberate.
3. Remove the repeated "All paid / nothing owed / All clear" text on every row.
4. Two side-by-side cards: **Start a household** and **Join with a code** (code input plus a Join button).
5. "Coming up across your households": upcoming bills only, amber "Due 28 Oct · in 18 days" pills. Paid items are not listed here (they belong on Bills).

**Notifications**

1. One card with a grid: rows are notification types (New bills, Reminders, Payment problems) with the description shown **once**, columns are households. This replaces one card per household with the same three descriptions repeated. It scales as households are added. Under 900px it stacks, with the household name shown beside each switch.
2. Use switches that **save immediately**. Remove the per-card Save buttons, and show a quiet "Changes save as you go." line.
3. New component **Switch** (`role="switch"`, `aria-checked`), designed so older users can tell on from off at a glance:
   - **On:** solid green (`#86D9A6`) track, the word **"On"** written inside it, a white knob on the right with a tick in it.
   - **Off:** dark grey track with a clear light outline, the word **"Off"** written inside it, a dimmed knob on the left with no tick.
   - Size: 88px wide by 44px tall (a comfortable tap target). Visible focus ring.
   - Never rely on colour alone. The words and the tick carry the meaning, so it also works for colour-blind users.
   - Any settings switch in the app should use this component. Green here means "on", the same positive meaning as "paid".

**Account (replaces Profile, Security & Access and Appearance)**

1. Identity card: large avatar, name, email, Add photo button.
2. Personal details: Name (value plus "Edit", not an always-open input with a Save button), Email, Photo.
3. Sign-in and security: Signs in with, Account created, Last sign-in, PIN ("Set · asked again every 7 days") with a "Change PIN" button. The Current / New / Confirm PIN form only appears after pressing Change PIN (inline or modal).
4. Appearance: Light / Dark / Automatic as the standard segmented control, with the "Automatic follows your phone or computer" help text.
5. The old Profile page's "Your households" list is dropped, because the Households page covers it.
6. The Security page continues below the visible area ("devices signed in as you"). Apply the same row pattern to that section: one row per device, with a "Sign out" button.

## 5. NEW: Budget page (highest-priority feature)

**Purpose:** answer one question: _"Have I budgeted enough for our yearly bills?"_

**Naming (decided):** the menu item and page title are **Budget**. The page subtitle reads "Your year ahead".

**Yearly budget target (decided):** optional.

- The page has a "Set a yearly budget" field (a single dollar amount for the year).
- If set, the headline shows a verdict: "On track" or "$N over budget", based on the projected total.
- If left blank, the page shows the projection only and no on-track verdict. Do not invent or default a target.
- The budget amount is stored per household and per year basis (financial or calendar).

**Navigation:** its own top-level item, "Budget", between Bills and Members. Not inside the Services dropdown. The "Full analytics" link on Services and a link under the Home hero both go here.

**Year basis (decided):**

- Default is **financial year (1 July to 30 June)**, with **calendar year** as the only alternative.
- Do not put a year toggle on the page. It is a household setting, "Year starts: 1 July / 1 January". The default comes from the user's country at sign-up, 1 July for Australia.
- Do not offer rolling 12 months as an option. The forward-looking need is covered by the "Big bills ahead" list.
- Handle the first one or two months of a new year: when there is almost no data, project from the previous year's bills instead of showing an empty chart.

**Page layout (top to bottom):**

1. **Headline answer.** "Projected for FY 2026–27: $X. Paid so far $Y. Still to come $Z." Beside it, if the user has set a yearly budget, a plain status: on track, or $N over budget. If no budget is set, show a quiet "Set a yearly budget" link instead. This is the hero.
2. **Twelve-month chart.** Paid months solid, future months outlined estimates. Bills are lumpy (September was about $7,900 and October about $1,142), so this chart shows when cash is needed.
3. **Big bills ahead.** The most expensive upcoming bills with dates and amounts (for example ≈$6,544 November, ≈$2,364 December, ≈$1,755 January).
4. **Monthly set-aside.** Projected total for the year divided by 12: "Set aside $X each month. Put this aside every month and the big bills are already covered." Shown as its own card next to the headline.
5. **Essentials vs Other split** using the same groups as the Services page.
6. **Confidence line** under the headline (see below).

**Short-history handling (decided):**
A projection from a couple of months of data is unreliable because the bills that break budgets are the less-than-monthly ones. The setup flow is:

1. **Backfill (preferred):** "Forward or upload the last 12 months of bills for the best picture." This reuses the existing Inbox forward-and-analyse feature.
2. **Quick-add (fallback):** "Which bills don't come monthly?" For each, the user enters a name, usual amount, how often, and roughly when it falls. About one minute.
3. **Skip is allowed.** The page must still load.

**Confidence label (required):**

- Real bills are solid and estimated bills are outlined.
- A line under the headline states the basis, for example: _"Based on 3 months of bills and 4 yearly bills you added. Add last year's bills to improve this."_
- If there is no information about yearly bills, do not show a confident total. Say the projection is probably low.

**Year-on-year comparisons:** hide them until a full 12 months of history exists. Current figures (+359% on the financial year, +562% on the calendar year) are inflated by the short tracking history and will alarm users for no reason.

**Reference figures from Lisa's account:** financial year to date $13,401.06 (22 bills), calendar year to date $19,316.79 (41 bills).

**Mockup:** `mockups/Budget.dc.html`. The layout is the headline card (projected total, on-track pill, a progress bar scaled to the budget, paid so far / still to come, confidence line), the set-aside card, the twelve-month chart (paid bars solid, estimated bars dashed-outline, each bar a button), "Big bills ahead", "Where it goes" (Essentials vs Other), and a "Make this more accurate" card with the two setup options.

**The numbers in the mockup are illustrative.** Only these are real: paid so far ($13,401.06, 22 bills), the November / December / January estimates (≈$6,544 / $2,364 / $1,755), September ($7,900) and October's paid amount. The February to June estimates, the $38,000 example budget, the Essentials / Other split and the 4-yearly-bills count are placeholders. Everything must come from live data in the product.

## 6. Data issues to check while building

- Members all show **"Since 1 Nov 2003"**, which looks like a placeholder or default date. Fix or hide it.
- The Home mockup now shows October paid as $677.43 (Electricity $542.94, Kieser $130.00, Apple Storage $4.49), matching the Services page. Use live data. Both pages must read from the same figure.
- **Layout bugs in the current Households and Overview pages.** In the screenshots, text on these pages runs together ("All paidnothing owed$740 this month", "HouseholdThis monthYou oweNeeds attention"), icons stack above names, and the Overview table has no column layout. This looks like missing CSS or a broken layout and not a design choice. The new designs replace them, but check whether the same cause affects other pages.
- **Name mismatch on Profile.** The header says "Lisa Smith" but the Name field contains "smithfamilybgo" (the email handle). Check which is the real stored name.
- **"This month" means three different things.** The old Analytics panel showed $677.43 (paid), Bills showed $1,141.51 (bills belonging to October), and Households showed $740.20. Decide on one definition per label and use it consistently, for example "Paid this month", "Bills for October" and "Due this month".
- **"· today" on paid items in the old Overview list** (such as "10 Oct · today") reads as a bug. In the new design paid items aren't listed there.
- The mockup assumes Inbox shows "Nothing to confirm". Drive this from the real count.
- The Bills "unusual" filter and the Inbox "To confirm" filter have no visible mockup states. Use the amber `soon` treatment.

## 7. Build order

1. Tokens and shared components (section 3)
2. Home
3. Services
4. Bills
5. Members
6. Inbox
7. Budget (needs the nav change, the year-start setting, the quick-add flow and the projection logic)
8. Account area: Households, Notifications, Account (merge the six old tabs into three; add the Switch component)

## 8. Using the mockups

The `.dc.html` files in `mockups/` are design-tool files and not production code. `Main.dc.html` is the Home page, and the other four are named after their pages. They depend on a design-tool script (`support.js`) that isn't included, so they may not render standalone. Read the markup and CSS in them for exact layout, spacing, type sizes and colours, and ask Lisa for the shared design link if you want to see them visually. Do not copy the inline styles. Rebuild them with the existing app components and the tokens in section 2.

## 9. Responsive notes

- The main nav now has six items plus search, Add bill and avatar. Below roughly 1280px wide it can wrap onto two lines. Collapse it in this order: first the search button becomes an icon only (already is), then tab labels hide and show icons only for inactive tabs, then below 760px the tabs move into a bottom bar or menu.
- Two-card rows (Budget, Home) stack to one column under about 900px. Rows hide their status column on phones.

## 10. Acceptance checks

- No number appears twice on a page, and no card exists without real content.
- Colour appears only for paid, due or expected status.
- No page has more than one visually dominant element.
- All interactive elements are keyboard-focusable and at least 44px tall.
- Pages work at phone width (rows collapse and the status column hides).
- Home still shows the positive zero-states.
