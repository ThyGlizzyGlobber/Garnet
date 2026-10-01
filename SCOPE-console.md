# Scope: the backend console, early access and bill privacy

_Drafted 2026-10-01 from the note in SCOPE-accounts.md §8; the owner answered
every question in §9 the same day and the decisions are in §6. Nothing is
built yet. The build order is §7._

## 1. Goal

A place for the owner and future developers (the "developers", C-D7: the
emails in `DEVELOPER_EMAILS`) to run the install without
looking inside anyone's household:

- **The console** (`/console`, operators only): the install at a glance, every
  household and account as counts and facts, software and services health, the
  early-access list, and a log of what operators did.
- **Early access**: sign-up is open today; the owner wants to say who may sign
  up (a list of emails, with invites still working for everyone invited) and
  to add or remove addresses from the console.
- **Bill privacy that can be stated honestly**: what the operator can and can't
  see, enforced in code and written on the privacy page; bills encrypted at
  rest so a copy of the disk or a backup is unreadable on its own.

**Done means:** an operator can run everything from the console without a
shell; a stranger with an uninvited email cannot create an account while early
access is on; the privacy page's sentence about the operator is true of the
code; `npm run check` passes.

## 2. What exists today (facts the scope builds on)

- **Operators** are the emails in `OPERATOR_EMAILS` (env, not a DB flag, so it
  can't be granted from inside the app). An operator is also an ordinary
  member of their own households; being an operator gates only: the Status
  page, software updates, adding service types, the AI cap lift for their own
  household, and the legacy "claim a pre-accounts household" path.
- **Status** (`/status`) shows: software (installed commit, updates), bills
  addresses (Worker signature), documents (counts, analyser model and reads),
  email out, weather, households (name, people, demo or not, area figures)
  and, since 2026-10-01, **Accounts** (every sign-up: email, Google or code,
  the household each joined and as whom, last sign-in).
- **Sign-up is open**: any verified email (Google, or the emailed code)
  creates an account on first sign-in (`signInAccount`), then starts or joins a
  household. Invites work by link or code; an invited member exists before
  they accept.
- **Data on disk** (`DATA_DIR`): `db/utilities.sqlite` (plus pre-migration
  copies), `inbox/households/<name (id)>/year/month/service/…` (bill files
  and the emails that carried no PDF, kept forever as the audit trail),
  `originals/` (scans as they arrived, before being turned upright),
  `previews/` (first pages drawn as images), `config/` (small JSON files:
  update request, upgrades done, demo-off, inbound signature state). Live on
  the NAS: an ixVolume dataset, snapshotted before every update.
- **Who can see what in code**: every household-owned row carries
  `household_id`; pages reach data only through `requireMember` for a
  household the person belongs to. There is no "open any household" path for
  operators. Status's household card reads counts and names, never bills.
- **Secrets** are env vars (`AUTH_SECRET`, Google, Resend, Anthropic, the
  inbound HMAC, the update token). Nothing in the DB is encrypted; the disk is
  whatever the NAS does (the dataset is not encrypted today, as far as the
  deploy notes say).
- **The analyser** (Anthropic API) receives a bill's text, or the file itself
  for scans and photos, at read time. The privacy page names Anthropic (§6a of
  the redesign scope).
- **Rate limits and caps**: AI reads per household per month (`usage`),
  invitations per hour, uploads per hour, inbound messages per hour, codes
  per address.

## 3. The console (`/console`)

Developers only (`requireDeveloper`, C-D7). Its own nav section in the shell's
account variant (Households · Account · **Console**), so it is reached from the
Account Dashboard and the switcher, not from inside a household. Status folds
into it (C-D1): `/status` redirects to `/console/health`.

### 3a. Overview

A few big numbers and a line each: households (by type, demo apart), accounts
(and sign-ups this week), bills analysed this month and the AI reads against
the install-wide cap, inbound messages this week, waiting documents across the
install (a count only), the installed commit and whether an update is ready,
and anything red from Health.

### 3b. Households

One row per household: name, type, people (count), created, last activity
(the newest bill or document, a date only), bills this month (a count and a
total, the household's own currency), AI reads this month and the cap, bills
address on or off, area sharing on or off. **No bill, document, provider or
amount detail**: the row's figures are counts and totals, nothing that names a
service or a bill. Actions: raise or lower that household's AI cap for the
month (C-D4), turn its bills address off (abuse), delete a demo household,
and open the household **only when the operator is a member of it**
(the ordinary household link). No "view as" (C-D5).

### 3c. Accounts

The Accounts card from Status, as a table: email, name, how they sign in,
households and roles, created, last sign-in, devices. Actions: sign out
everywhere (forget every device), delete an account that belongs to no
household, add to or remove from the early-access list, make or unmake a
developer (C-D7). Never: see or reset a PIN, sign in as them.

### 3d. Access (early access)

- **The list**: emails allowed to sign up (single addresses, C-D3), each with who added it, when, a note, and whether it has
  signed up yet. Add one or paste several. Remove one (an existing account
  stays; removal only stops a future sign-up).
- **The switch**: early access **on** (only listed addresses and invited
  people may create an account; on from the first build, C-D2) or **off**
  (open sign-up). Stored in the DB, changed from the console, with its own
  audit line.
- **What a stranger sees** with early access on: the sign-in page still asks
  for an email; an address that is neither listed nor invited gets the plain
  message "Garnet is invitation-only for now" and a **Request access** line
  (name, email, one sentence). Requests land in a queue on this tab; approving
  one adds it to the list and emails them that they're in.
- **Invites always win**: an invitation link or code creates the account
  whatever the list says, because the household's admin chose that person.
- Sign-in itself is unchanged for existing accounts.

### 3e. Health

Today's Status cards, with two additions: **Storage** (the data directory's
size by part: database, bill files, originals, previews; free space on the
volume) and **Email** (sends in the last day and failures, from a small
`email_log` of subject kind, recipient domain and outcome, no bodies).

### 3f. Audit

Every operator action, newest first: who, when, what (the list changes, the
switch, caps, deletions, sign-outs, update requests, service types added, a
developer made or unmade), the household or account it touched (by name), and
the request's IP. Written by one function, `audit()` in `src/lib/audit.ts`,
called by every operator action; kept for good. Operators cannot delete audit
lines. Members never see it; it is about operators, not households.

## 4. Early access (the sign-up gate)

- New table `allowed_signup` (email or domain, note, added by account, added
  at, used at) and `access_request` (name, email, message, created, decided
  at, decided by, outcome). A setting row for the switch (`install_setting`
  key/value, which later holds other install-wide choices).
- The gate is one function, `maySignUp(email)` in `src/lib/access.ts`:
  true when the switch is off, when the address or its domain is listed, or
  when an open invitation exists for that address (`member.email`). Both
  sign-in paths (the emailed code and Google) call it **before creating an
  account**: the code path refuses before sending a code (so no code email
  goes to a stranger); the Google path refuses after Google returns and shows
  the same message.
- Developers' own emails are always allowed.
- The demo household's pick-a-name sign-in is unaffected.

## 5. Privacy: what the operator can see, and encryption at rest

### 5a. The rule, stated plainly

- **In the app**, an operator sees a household's bills only by being a member
  of it. The console shows counts, totals, names of households and people's
  emails: never a provider, a bill, a figure from a bill, a document.
- **On the server**, whoever has root on the NAS can read the database and the
  files. Encryption at rest changes what a _copy_ of the disk or a backup
  reveals; it does not hide anything from the person running the server,
  because the server must read every bill to analyse it and draw its pages
  (SCOPE-accounts.md §8). That is the honest limit and the privacy page says
  so (C-D10).

### 5b. Encryption at rest (files)

- **A key per household**, 256-bit, generated when the household is created,
  stored in the DB **wrapped** (encrypted) with an install master key.
- **The master key** comes from the environment (`DATA_KEY`, 32 random bytes,
  base64), like `AUTH_SECRET`, and never from the data directory. Without it
  the app refuses to start once any household has a key. The owner keeps it
  where the other secrets live (the TrueNAS app config). Losing it loses every
  bill file: the deploy notes say so in capitals.
- **What is encrypted**: every file under `inbox/`, `originals/` and
  `previews/` (AES-256-GCM, a random nonce per file, the household id in the
  associated data so a file can't be moved between households), written by
  the one archive writer (`src/ingest/archive.ts`) and read by the one file
  route and the analyser. The export zip decrypts on the way out. Existing
  files are encrypted by a one-off startup step (`src/lib/upgrades.ts`), one
  household at a time, with the snapshot the updater takes as the way back.
- **What is not encrypted**: the database. A bill's provider, amounts, dates,
  notes and the extracted text live in SQLite because every page, search and
  chart reads them; encrypting those columns would break search and totals or
  mean decrypting the whole table on every page. The database is covered by
  **dataset encryption on the NAS** instead (C-D11): the TrueNAS dataset the
  ixVolume lives on is created encrypted with a passphrase or key held by the
  NAS, so the same disk-or-backup copy is unreadable, and ZFS snapshots stay
  usable. DEPLOY.md gets the steps.
- Keys never leave the server; nothing is sent to the browser to decrypt.

### 5c. "Binding an account to a household with a token"

The owner's note asked for a cryptographic binding so only a household's
members can see its bills. In this app the binding is **membership**: a
`member` row with the person's `account_id`, which only an invitation accepted
by that signed-in account (or starting the household) can create, and which
every page checks before reading a row. A separate token would be checked by
the same server code, so it would add a thing to lose without adding a
protection. What _does_ strengthen the binding, and is in this scope: every
read of a household's data going through the one membership check (already
true; a test will assert it for every page and route), the audit log, no
operator "view as", and at-rest keys per household so a file can't be read
under another household's key.

## 6. Decisions (the owner's answers, 2026-10-01)

- **C-D1 — Status folds into the console** as its Health tab; `/status`
  redirects to `/console/health`.
- **C-D2 — Early access is on from the first build.** The owner's family's
  addresses are pre-listed by the one-off step that creates the list; existing
  accounts are unaffected.
- **C-D3 — The list takes single emails only**, no domains.
- **C-D4 — Per-household AI cap override** from the console (this month, or
  always), replacing the "the developer's own household is uncapped" rule
  with an explicit "no cap" entry for it.
- **C-D5 — No "view as" / "open any household", ever.** Support happens by
  being invited into the household by its admin.
- **C-D6 — The console never shows bill detail.** Counts, totals, names,
  emails, dates of activity. Enforced by `src/lib/console.ts`, which does not
  import the bill or document readers; a test asserts the import list.
- **C-D7 — "Operator" becomes "developer" everywhere, and there is no second
  role.** Developers are the emails in `DEVELOPER_EMAILS` (the env var is
  renamed; `OPERATOR_EMAILS` keeps working for one release with a startup
  warning), `requireOperator`/`isOperator` become `requireDeveloper`/
  `isDeveloper`, and the words on Status, Settings and the privacy page say
  developer. Nobody can be made a developer from inside the app.
- **C-D8 — Request access** is a form on the sign-in page while early access
  is on (name, email, one sentence), rate-limited like codes; approving a
  request emails the person.
- **C-D9 — Audit everything a developer does**, kept for good, never
  deletable from the app.
- **C-D10 — The privacy page gets a plain paragraph** on what a developer can
  see (§5a) and that bills are encrypted on disk, once C4 ships.
- **C-D11 — Files encrypted by the app with per-household keys; the database
  covered by NAS dataset encryption.** The master key is `DATA_KEY`, an env
  var in the TrueNAS app config like the other secrets; the owner keeps a copy
  somewhere safe, and DEPLOY.md says in capitals that losing it loses the bill
  files. Not end-to-end: the privacy page says why.
- **C-D12 — Email digests to developers are later.**
- **C-D13 — Build order: C1 the gate, C2 the console, C3 the audit log, C4
  encryption, C5 the words.**

## 7. Stages

Each ends with `npm run check`, a commit and a check-in.

- **C1 — The gate.** `allowed_signup`, `access_request`, `install_setting`,
  `maySignUp()`, both sign-in paths refusing before creating an account, the
  sign-in page's "invitation-only" message and Request access form, the
  approval email. Tests for every rule in §4.
- **C2 — The console.** `/console` with Overview, Households, Accounts,
  Access and Health (Status folded in), the actions in §3b–3d, the
  operator→developer rename (C-D7), `src/lib/console.ts` and its no-bill-imports test. The Account
  Dashboard's nav gains Console for operators.
- **C3 — The audit log.** `audit`, `audit()`, every operator action wired, the
  Audit tab, IP from the request.
- **C4 — Encryption at rest.** The per-household keys, `DATA_KEY`, the
  archive writer and the file route, the export zip, the one-off step for
  existing files, the refusal to start without the key, DEPLOY.md's steps for
  dataset encryption and for keeping the key. Verified on the local demo and
  on a copy of the NAS data before the real update.
- **C5 — The words.** The privacy page paragraph, the sign-in page's line
  while early access is on, DEPLOY.md.

## 8. Not in this scope

- Hosted multi-install operations, billing, plans. A public marketing site.
- End-to-end encryption or client-side keys (§5a says why).
- Impersonation or "view as" of any kind (C-D5).
- Emailing operators a digest (C-D12, later).

## 9. The questions and the owner's answers (2026-10-01)

1. Early access from day one? — **On from the first build.**
2. Domains on the list? — **Emails only.**
3. Request access? — **A form on the sign-in page, with an approval queue.**
4. Developers? — **No separate role: "operator" becomes "developer"
   everywhere, developers are the emails in the env var.**
5. No "view as"? — **No bypass, ever.**
6. Encryption split? — **Files by the app with per-household keys; the
   database by NAS dataset encryption.**
7. Master key? — **An env var in the TrueNAS app config.**
8. Status? — **Folded into the console as Health.**
9. AI cap? — **Per-household override from the console.**
10. Order? — **Gate, console, audit, encryption, words.**
