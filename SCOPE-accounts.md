# Scope: accounts and many households ("the Account Dashboard")

_Drafted 2026-10-01; the owner answered every question in §9 the same day and
the decisions are recorded in §5. Nothing is built yet. The build order is §6.
The owner's mum's wizard notes are transcribed in §7 and carried as stages A3
and A4._

## 1. Goal

One person, several households, one place to see them all.

- A person's **Account Dashboard** shows every household they belong to as a
  tile, the way Canva's home shows designs: open one, start another, join one
  with a code, see at a glance what each needs from you.
- Inside a household, the **household name top-left is a switcher**: a menu of
  your households to jump between, plus "All households" to the Account
  Dashboard, "Start a household" and "Join with a code".
- The Account Dashboard wears the **same Almanac 2 / Frost Glass look** as the
  household screens: the same shell, glass cards, type and tokens. It is a
  screen of the app, not a separate site.
- Later (§7): households have a **type** (own home, investment property, share
  house), roles are filtered by type, setup branches by role, and a landlord can
  run a **utilities allowance** for tenants.

**Done means:** an account can own, join and switch between several households;
the Account Dashboard and switcher match the household screens at the four
reference sizes (1440 × 900, 1180 × 820, 820 × 1180, 393 × 852) in light and
dark; the demo shows a person in three households of the three types;
`npm run check` passes.

## 2. What exists today (facts the scope builds on)

- **Accounts are install-wide and members are per household.** An `account`
  (email, optional Google subject) links to any number of `member` rows through
  `member.account_id`. The data model already allows many households; only
  three places say no: `acceptInvite` refuses an account that already has a
  membership, `/setup` redirects one away, and `authState` always picks the
  first membership unless `session.memberId` names another.
- **Sign-in is Google or an emailed code** (decision 2026-10-01). No passwords.
- **Things kept on the member that really belong to the person:** the PIN
  (`member.pin_hash`), the colour preset, light/dark and glass choices
  (`member.appearance_preset`, `theme`, `glass`), and email preferences. With
  one household per account this never showed. With several it would mean a PIN
  per household and colours that change when you switch.
- **Things rightly per household:** the member's name and avatar colour, role,
  move-in date, split settings, Home layouts (`home_layout` is per member and
  device), personal services, what they owe.
- **Roles** are `owner` (shown as Admin) and `member`, plus the operator from
  `OPERATOR_EMAILS`. Households have `split_mode` shared or single.
- **The shell** (`src/components/app/shell.tsx`) draws the household name and
  "who lives there" top-left in the nav column, and the household name with the
  section under it in the phone top bar. Both link to Home today.
- **Settings → Your account** holds name, email, how you sign in, PIN, the wall,
  sign out. Members and invites live under Settings → Household.
- **Five colour presets** exist (Ink & Mist, Harbour, Ruby, Cobalt, Violet), each
  chosen per member in Settings and during setup and joining.

## 3. The Account Dashboard (`/account`)

A person's own page, outside any one household, reached from the switcher and
from the Account card's place in the nav.

### 3a. Layout

The household shell without a household: the nav column (rail, bottom bar on a
phone) shows **Households · Account** instead of Home · Services · Bills · Money
· Inbox, with no services list. The page itself:

1. **Greeting and the week across households.** "Hey, Sam." and one computed
   line: what you owe altogether this week, or "Nothing due this week", across
   every household you are in.
2. **Your households**, a grid of tiles (two columns on a phone, three or four
   on an iPad, four or five on desktop), the primary household first with a
   home badge. Each tile is a glass card that **leads with what you owe there**
   (D-Q2), or "All paid":
   - the household's name, the people as stacked avatars, your role as a chip
     (Admin · Member; later Landlord · Tenant · Boarder · Family);
   - under the figure: this month's total so far, and a dot with "3 to confirm"
     when the Inbox is waiting or "1 overdue" when a bill is;
   - the household type's icon once types exist (§7); the home icon until then.
     Tapping a tile opens that household's Home. A ⋯ menu offers Open · Make
     primary · Settings (admins) · Leave (members, §3d) · Rename (admins).
3. **Two action tiles** at the end of the grid, drawn as dashed glass: **Start a
   household** (→ the setup wizard) and **Join with a code** (the code field in
   a sheet; an invite link does the same).
4. **Account** card: name, email, how you sign in, PIN (one for the account,
   D2), Light · Dark · Automatic and Glass · Frosted · Automatic (D3), sign
   out. Everything that is about the person, moved here from Settings → Your
   account; Settings keeps what is about the household.

Everything on the page comes from one view function, `accountView(accountId)`
in `src/lib/account.ts`: the memberships with each household's name, people,
your role, your owed figure (`moneyView`'s net for you), the month's total
(`totalsForRange`), waiting documents (`documentCounts`), overdue count
(`billDue`), which is primary, and the account's own details. Pages lay out,
never calculate.

### 3b. The switcher

The household name top-left (nav column, rail and phone top bar) becomes a
button with a small chevron (D-Q11) that opens a glass menu:

- one row per household, the primary first with its home badge: name, your
  role, and a small figure (what you owe, or a dot for an Inbox or overdue
  item); the current one is ticked;
- **All households** → `/account`;
- **Start a household** and **Join with a code**.

Picking a household switches at once (`switchHouseholdAction` sets
`session.memberId` and remembers it as the account's last household, D6) and
lands on that household's Home. On a phone the same menu opens as a bottom
sheet (the `Sheet` piece); the first time it is opened a one-line hint says
what it is. With exactly one household the menu still exists (All households,
Start, Join), so people learn where it is.

### 3c. Joining a second household

- An invite link or code accepted by an account that already has a household
  joins it to the new one (the `acceptInvite` refusal goes). It never asks for a
  PIN again (D2) and never asks about colours (D3); it asks for the person's
  **name and avatar colour for that household**, since those are per household
  and the inviter's guess at a name may be wrong.
- Starting a second household runs the setup wizard as today, minus the Colours
  step and the PIN.
- An invite to an email that already belongs to this household is refused as
  now.

### 3d. Primary, leaving and deleting

- **Primary household** (D-Q3): a person marks one household as their home of
  residence (`member.is_primary`, one per account). It is first in the switcher
  and the dashboard with a home badge, and it is where the app opens.
- A member can **leave** a household from its tile or from Settings → Household
  when they owe nothing and are owed nothing (shares settled) and no personal
  service or vehicle of theirs remains (move or delete those first). Leaving
  sets `member.active_to` to today and unlinks the account; the member row and
  its shares stay, so the household's history is whole. Admins can still remove
  a member as now.
- The last admin cannot leave; they hand admin to someone or delete the
  household. **Delete household** (admins, typed-name confirmation) is the
  existing cascade.

## 4. What moves from the member to the account

| Today on `member`                     | Decided                                                                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pin_hash`, PIN failures per device   | `account.pin_hash` (D2). One PIN unlocks the device for every household. Migration copies the first member's PIN.                                                                |
| `appearance_preset`, `theme`, `glass` | `account.theme` and `account.glass` (D3). The preset column goes: one scheme (Ruby) until the brand colours are settled. Migration copies theme and glass from the first member. |
| name, colour, role, dates, split      | Stay per household.                                                                                                                                                              |
| email preferences (`member.email_*`)  | Stay per household (D4): reminders from the share house and not from your parents' home.                                                                                         |

Demo households keep their pick-a-name sign-in; demo members keep a PIN on the
member row for that path only.

`authState` gains a `household-pick` kind: signed in, unlocked, several
memberships, none primary and none remembered (sent to `/account`). `pathFor`
maps it. `requireMember` stays the one gate for household pages; API routes
that take a household id keep checking the member belongs to it.

## 5. Decisions (the owner's answers, 2026-10-01)

- **D1 — One account, many households, from this build.** The three
  one-household rules (§2) go.
- **D2 — The PIN belongs to the account.** One PIN per person, set once.
- **D3 — One colour scheme, Ruby, until the brand colours are settled.** The
  five presets, the preset cards in Settings and the Colours steps in setup and
  joining are removed. The only appearance choices are Light · Dark · Automatic
  and Glass · Frosted · Automatic, kept **per account**. The preset tokens stay
  in `globals.css` (switching the scheme later is one line) but nothing picks
  between them. BRAND.md and the appearance tests change with it.
- **D4 — Email preferences stay per household.**
- **D5 — The Account Dashboard is a screen of the app**, in the shell, with
  the same tokens. Household tiles are glass cards with a number on them, like
  Home's widgets.
- **D6 — Remember the last household per device**, and on the account
  (`last_member_id`) for a new device.
- **D7 — Landing: the primary household when one is set, else the last used,
  else the Account Dashboard.** The dashboard is one tap away, never a gate.
- **D8 — The switcher replaces the top-left link to Home** on every size; a
  chevron is the cue.
- **D9 — Settings is split:** Your account moves to `/account` (name, email,
  sign-in, PIN, light/dark, glass, sign out); Settings keeps Household, Emails,
  Location, Area comparisons, the catch-up, Exit demo and the operator cards.
- **D10 — The demo shows all three types:** Riverside House becomes a share
  house; a second household is Alex's parents' own home (family members,
  see-only); a third is an investment property with an allowance, where Alex is
  the landlord. Three tiles on Alex's dashboard.
- **D11 — Build order:** A1 + A2 first (many households, dashboard, switcher),
  then A3 (types and roles), then A4 (branches and the allowance). Existing
  households are typed when A3 lands.
- **D12 — Tiles lead with what you owe** in that household.
- **D13 — Members may leave on their own** once settled (§3d).
- **D14 — Boarders pay a share of some services only:** the admin picks which
  services a boarder is in (power and internet, say, not rent). This is a
  per-member, per-service "in the split or not" setting, which the split editor
  gains in A3.
- **D15 — Family members in an own home are see-only** unless the admin sets a
  split on a service.
- **D16 — The landlord's oversight view (B1) shows the tenants' bills and the
  landlord's own, kept apart:** tenants forward power, gas and water; the
  landlord files rates, strata and insurance under the property, hidden from
  tenants. The landlord sees both; tenants see only theirs.
- **D17 — The allowance (B2) is monthly with a quarterly or yearly option**,
  chosen when the cap is set; unused allowance does not roll over. **The
  landlord logs** bills and ad-hoc expenses (the property's bills address and
  uploads); **tenants see the running total** against the cap and the overage
  once it is owed.
- **D18 — The operator's view of other households is not on the Account
  Dashboard.** It belongs to the backend console (§8), together with the
  privacy question the owner raised.
- **D19 — "Account"**, not "Profile" or "Me".

## 6. Stages

Each ends with `npm run check`, a commit and a check-in.

- **A1 — Many households per account.** Migration (account PIN, account
  theme and glass, `last_member_id`, `member.is_primary`; the preset column
  dropped); one scheme (D3) with the preset cards and Colours steps removed;
  `authState` and `pathFor`; the three rules removed; `switchHouseholdAction`;
  make-primary; joining a second household (name and avatar colour step);
  starting a second household; leaving (§3d). Tests for every rule in §3c–3d
  and for the migration copying PINs, theme and glass.
- **A2 — The Account Dashboard and the switcher.** `accountView`, `/account`,
  the tiles, the action tiles, the Account card, the switcher menu and bottom
  sheet with its one-time hint, Settings split (D9), the demo's second and third
  households (D10; the third is a plain household until A4 gives it an
  allowance). Checked at the four sizes, light and dark.
- **A3 — Household types and roles (Mum's steps 2–3, §7).** `household.type`,
  the role set per type (`member.role` gains landlord, tenant, boarder, family;
  `isAdmin` treats admin and landlord as admins), the wizard's type and role
  steps, the switcher and tiles showing the type's icon, invites carrying a
  role, boarders' per-service membership of the split (D14), own-home
  see-only default (D15). Existing households are asked their type once (a
  Home banner for admins; the Smith Household is an own home).
- **A4 — Setup branches by role (Mum's step 4).** The admin branch is today's
  wizard reordered (members, split, first bill, dashboard). The landlord branch
  asks "Are utilities included in the rent?" and lands on the oversight view
  (D16) or the allowance dashboard (D17): the cap and its period, bills and
  ad-hoc expenses logged against it, the running total, the overage flagged
  with the amount owed and a message ready to send the tenants; what tenants
  see. The demo's third household gets its allowance.
- **A5 — Later ideas for the dashboard** (to be scoped once A2 is in hand):
  totals across households, a combined "everything I pay" view, the bills
  address on each tile, notifications in one feed.

## 7. Mum's wizard (transcribed) and how it maps

> **Account setup wizard.** Step 1 — User account: standard account creation,
> name, email, password. ✓
> **Step 2 — Add a household:** user names the household (eg Smith Household)
> and selects a household type: Own home · Investment property · Share house.
> **Step 3 — Role (filtered by household type):** Own home → Admin, Family
> member. Investment property → Owner/Landlord, Tenant, Boarder. Share house →
> Admin, Tenant, Boarder.
> **Step 4 — Branch by role.**
> **A. Admin (own home / share house):** ① add household members (invite by
> email/phone, or skip and add later) ② set the default bill split: even or
> percentage ③ add the first bill (optional, can skip) ④ lands on the full
> dashboard (admin).
> **B. Owner/Landlord (investment property):** ask "Are utilities included in
> the rent?" **B1 — No, tenant pays directly:** add the property address; invite
> tenants (optional); lands on an oversight-only view. **B2 — Yes, included
> with a cap:** add the property address; set a monthly allowance (eg $200);
> invite tenants (optional); lands on the Allowance dashboard: log bills, log
> ad-hoc expenses, running monthly total against the allowance, overage clearly
> flagged once the total exceeds the allowance, with the owed amount ready to
> communicate to the tenants.
> **C. Tenant / Boarder / Family member (joining an existing household):**
> these roles don't create a household, they join one via invite. ① receive the
> invite link from the household admin or owner/landlord ② accept the invite ③
> land directly in that household, already configured (split method, allowance
> etc. set by whoever created it).

How it maps:

- **Step 1** is done, with one change: no password (decision 2026-10-01). Google
  or an emailed code.
- **Step 2** adds `household.type` ∈ own_home · investment_property ·
  share_house to the wizard's first page, beside the name. Today's "Do you split
  bills?" becomes a consequence of the type and role rather than a question:
  share houses split; an own home keeps one total with see-only family members
  unless the admin sets a split on a service (D15); an investment property
  splits nothing between the landlord and tenants (the allowance is a different
  sum, A4).
- **Step 3** replaces today's two roles with a set per type. Underneath, every
  role is still either an admin or a member for what it may do (`isAdmin`):
  Admin and Owner/Landlord administer; Family member, Tenant and Boarder are
  members. The role name is shown on tiles, the members page and invites. A
  Boarder is in the split of only the services the admin picks (D14).
- **Step 4A** is today's wizard with the members and first-bill steps added
  (both skippable). **4B** is A4. **4C** is today's joining flow and already
  works this way.
- "Invite by phone" means a copyable link or code sent by text, which exists;
  the app will not send SMS.

## 8. The backend console and bill privacy (the owner's note, a separate scope)

The owner wants, later, a **backend console** for themself and future
developers: install-wide figures, an early-access list of emails allowed to sign
up, and the ability to add or remove access. They also want **bills encrypted
so that the backend cannot read them**, with a person's account bound to a
household cryptographically, because people will object to an operator who can
see their bills.

This deserves its own scope document, but one fact should be on the table now
so the console is designed around it:

- **The server has to see every bill in plain text at least once.** Bills
  arrive by email at the server (the Worker hands the raw message to the app),
  the app sends the text or the scan to the analyser, files the result and
  renders every page on the server. True end-to-end encryption, where only the
  household's devices hold the key, would mean the server could neither analyse
  a bill nor draw a page from it. That is a different product (client-side
  everything) and is not compatible with the bills address, the analyser or
  server-rendered screens.
- **What can be done, and is worth doing:** encrypt bill files and extracted
  text **at rest** with a key per household, held by the app, so a copy of the
  disk or a backup is unreadable without the app's own secret; keep the operator
  out of households they are not a member of **by rule and by audit**, not just
  by habit (today the operator role only gates software, the catalog and
  Status; the Status Accounts card shows emails and household names, never
  bills); log every operator action; and let the console show counts and health
  without ever opening a household's rows. Binding an account to a household by
  a token the household holds (rather than a row the operator could write) is
  possible and sensible, but it is an authorisation measure, not secrecy from
  the server.
- **Honest framing for households:** "Your bills are encrypted on disk and only
  the people in your household can open them in the app; the operator can see
  that your household exists and how much it uses the analyser, not your
  bills." That is true and defensible. "Nobody but you can ever read your
  bills" is not true of any server-side design that analyses them.

Recommended: scope the console as **SCOPE-console.md** after A2, covering the
early-access list (a table of allowed emails, checked at sign-in), the
operator's install view, at-rest encryption with per-household keys, the
operator audit log, and the privacy page wording.

## 9. The questions and the owner's answers (2026-10-01)

1. PIN and colours per account? — **PIN per account. Colour presets scrapped
   for now: one scheme (Ruby), only light/dark and reduce transparency,
   brand colours to come later.**
2. What a tile leads with? — **What you owe there.**
3. Landing with several households? — **Last used, and a household can be set
   as primary (home of residence); the primary wins when set.**
4. Leaving? — **Members can leave themselves once settled.**
5. Boarder vs tenant? — **A boarder pays a share of some services only, chosen
   by the admin.**
6. Family member in an own home? — **See-only unless the admin sets a split.**
7. Landlord's oversight view (B1)? — **Tenants' bills plus the landlord's own,
   kept apart; tenants see only theirs.**
8. Allowance period? — **Monthly with a quarterly or yearly option; no
   roll-over. The landlord logs; tenants see the running total and the
   overage.**
9. Demo? — **All three types.**
10. Operator's view? — **Not on the Account Dashboard: a backend console with
    early access and bill privacy, scoped separately (§8).**
11. Phone cue? — **A chevron is enough.**
12. Order? — **Dashboard and switcher first, then types and roles, then the
    branches and allowance.**
