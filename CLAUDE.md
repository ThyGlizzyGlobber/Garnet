# Home Utilities Dashboard — Prototype 1 (BRJ Labs)

Self-hosted household utilities dashboard: ingests utility bills from a dedicated
mailbox, totals costs per service, splits them between housemates, tracks who has
paid, and projects upcoming bills. Runs as one Docker container on TrueNAS Scale.

**SCOPE.md is the source of truth** for scope; **BRAND.md** for look, voice and design tokens. Never contradict it. If something is ambiguous
or a decision seems wrong, stop and ask the owner before building around it.
§3 (provider inventory) may contain TODOs — providers are configurable data in the
DB, never hardcoded.

## Current status (handoff — keep this section up to date)

_Last updated 2026-09-26._ Prototype 1 scope is fully built: Phases 0–4 plus the
visual system v2 restyle. Latest commit is on `main` in both checkouts.

- **Where the code lives.** Primary working copy: `/Users/bejaysmith/Desktop/Home Utilities Software (Prototype-1) 03.48.04`
  (local SSD, fast). GitHub (`origin`, private) is the release source: every push to `main` runs
  `.github/workflows/release.yml` (check → image → `ghcr.io/thyglizzyglobber/home-utilities:latest` + `:<sha>`),
  and Settings → Software update applies it on the NAS via `deploy/nas-updater.sh` (cron). See DEPLOY.md.
  The old NAS-share checkout (`/Volumes/Bejay/BRJ Labs/…`, remote `nas`) is no longer part of the release flow.
- **Running locally.** `npm run build && DATA_DIR="$PWD/data-demo" DEMO_MODE=true PORT=3462 node --env-file-if-exists=.env .next/standalone/server.js`
  gives the fictional demo (log in as Alex, PIN 1234). `data/` holds the owner's real Smith Household with four Aussie Broadband invoices.
  The desktop app's browser preview tool is bound to the NAS folder, so run the server yourself and `navigate` to it.
- **Verified.** Unit tests (73), typecheck, lint, production build, Docker image (arm64 and amd64 build; runs with health, migrations, demo seed, in-container PDF parse), every screen in both themes at 1280 px, the paged setup wizard end to end, exit-demo, CSV export, review-queue approval, duplicate detection, template parser on all four real invoices.
- **Not yet verified live.** The Anthropic extractor and the IMAP poller (no `ANTHROPIC_API_KEY` or IMAP credentials in `.env`); the actual TrueNAS deployment (app not yet installed on the NAS; target TrueNAS 25.10.7, installed as a Custom App with an ixVolume `data` → `SSD/ix-apps/app_mounts/home-utilities/data`; updater script at `/mnt/SSD/AppData/home-utilities-updater/`). The release workflow ran green on GitHub (owner, 2026-09-26). The self-update loop was verified locally with stubbed `zfs`/`midclt`.
- **Design.** BRAND.md is the reference. Owner rejected the first restyle as boring; v2 (blob scene, frosted window, instrument tiles, single trend line charts) is approved direction. Owner prefers muted décor palettes, no green accent, no photo backdrops. Mockup canvas: https://claude.ai/artifact/BzeEmm3c16cbvCdTTtGmh4.
- **Open questions for the owner.** Product name (BRAND.md lists Homebill / Housekeep / Tally); whether the display type should have more character than Outfit; brand mark.
- **Agreed direction (2026-09-26, owner).** Hosted multi-household on the owner's NAS behind a Cloudflare Tunnel (`nameplaceholder.brjlabs.com`, name TBD). Open sign-up: a new account chooses Create a household or Join one (paste a code, or accept an emailed invite). Household admin invites members by email + copyable link; members sign in with Google or an emailed one-time code, then set their own PIN, which only they can change (PIN = quick unlock on an already-signed-in device). Invite/code email via a sending service on brjlabs.com (e.g. Resend). Bills: per-household forwarding address on the owner's domain via Cloudflare Email Routing + Email Worker, plus in-app PDF upload; provider APIs (CDR) stay roadmap. An operator role (owner of the install) is separate from household admins; Software update becomes operator-only. Per-household monthly cap on AI extraction. SCOPE.md §2/§7/§9 must be rewritten to match before building (owner approved).
- **Likely next steps.** Push `main` to GitHub, install the YAML app on TrueNAS and run through DEPLOY.md; then stage 1 multi-household (household_id on every table, scoped queries), stage 2 accounts + invites + Google/email-code + PIN, stage 3 internet hardening (secure cookies, rate limits, no member list on login), stage 4 per-household bills address + upload; add mailbox + API key and exercise ingestion on real email; start the household alpha; Members and Settings pages have not had the v2 instrument treatment (they use the shared primitives, so they look consistent but plain); PDF statements and push reminders are roadmap.

## Hard constraints

- Next.js (TypeScript) full-stack, single repo, single Docker container.
- SQLite via Drizzle ORM. DB file, config, and `inbox/` (raw bill files) all live
  under one mounted data directory given by `DATA_DIR`.
- Bill extraction is a pluggable interface: template parsers → Anthropic API LLM
  extraction → manual-review queue. The Anthropic key comes from env. Low-confidence
  parses are never silently accepted.
- Settlement is calculate-and-track only. The app never holds or moves money.
  It sits behind `SettlementAdapter` so a pooling service can plug in later.
- Raw bill emails/PDFs are stored permanently as an audit trail. Every extracted
  Bill links back to its source file.
- LAN-only alpha: member auth is name + PIN/password. No public exposure.
- Never commit secrets. `.env` is gitignored; `.env.example` documents every var.
- `sample-bills/` contains real personal data: gitignored and dockerignored.
- UI: Tailwind + Recharts, clean Apple-like design, fully responsive (phone + iPad).
  `/wall` is a full-screen auto-refreshing kiosk route.
- Manual bill entry is a permanent first-class feature, not a stopgap.

## International-ready (applies from Phase 0)

- One `household` settings row: currency (ISO 4217), locale (BCP 47), IANA timezone,
  fiscal-year start month, week start. All formatting and period math reads from it.
- Money is integer minor units + currency code on every monetary record. Display
  only via `Intl.NumberFormat` (`src/lib/format.ts`). Tax amount/label is optional
  and generic (GST/VAT/sales tax).
- Dates are ISO-8601 strings in UTC. Extractors take a locale hint for day/month order.
- Usage units go through the unit registry in `src/lib/units.ts`; service types and
  billing cadences are configurable data, not enums.
- Member payment details are generic ordered label/value pairs (PayID, IBAN, Venmo…);
  payment references are generated from a template.
- All UI copy lives in `messages/*.json` via next-intl. English only in the alpha.
- Nothing Australia- or provider-specific in core logic. AU defaults live in
  `.env.example` and seed data.
- The regulated-money boundary is universal (AFSL in AU, EMI/PSD2 in EU/UK, MSB in
  US): the settlement adapter never holds funds.

## Demo and privacy

- `DEMO_MODE=true` seeds a fictional household for demos. Real data never ships in
  the image, the repo, or screenshots.
- Only extracted bill _text_ is sent to the LLM API, never the raw file.

## Tech stack

Next.js 16 (App Router, Turbopack) · TypeScript 5 strict · Tailwind v4 · Recharts ·
Drizzle ORM + better-sqlite3 · next-intl · Vitest · ESLint 9 + Prettier ·
iron-session + bcryptjs · imapflow + mailparser + pdf-parse · @anthropic-ai/sdk ·
Docker multi-stage on node:22-bookworm-slim with Next standalone output, built by GitHub Actions and published to GHCR (`deploy/`).

## Commands

- `npm run dev` — dev server; migrations run on start via `src/instrumentation.ts`
- `npm run build` / `npm start` — production build (copies static + public + drizzle into `.next/standalone`) / standalone server
- `npm run check` — lint + typecheck + tests (must pass before every commit)
- `npm run lint` · `npm run typecheck` · `npm test` · `npm run format`
- `npm run db:generate` — generate a migration from `src/db/schema.ts` changes
- `npm run db:migrate` — apply migrations to `DATA_DIR/db/utilities.sqlite`
- `npm run db:seed` — load the four real Aussie Broadband invoices into the existing household (creates a dev household + owner PIN 1234 if none)
- `npm run db:seed:demo` — create the fictional "Riverside House" demo household (also runs automatically when `DEMO_MODE=true`)
- `npm run extract:dry-run -- <file...>` — run the extractor pipeline on bill files, no DB writes (`--llm` forces the AI extractor, `--json` for machine output)
- `docker build -t brjlabs/home-utilities:local .` — build the image locally; production images come from `.github/workflows/release.yml` (GHCR)

## Layout

```
src/app/            App Router routes: login, dashboard, bills, services, members,
                    review, settings, wall, api/*
src/components/     ui/ (design primitives), charts/ (Recharts wrappers)
src/db/             schema.ts, client.ts, migrate.ts
src/lib/            env.ts (the only process.env reader), paths.ts, format.ts,
                    units.ts, money/splits/projections logic, auth/
src/ingest/         imap/, archive.ts (inbox/ writer), text/ (pdf, html),
                    extractors/ (types, pipeline, template/*, llm/anthropic)
src/settlement/     SettlementAdapter interface + track-only adapter
src/worker/         poller lifecycle (started from instrumentation.ts)
drizzle/            generated SQL migrations (committed)
messages/           next-intl message files
scripts/            seed, dry-run CLI
tests/              vitest; mirrors src/ paths
data/               local DATA_DIR (gitignored): db/, inbox/, config/
sample-bills/       real bills for seeding + extraction tests (gitignored)
```

## Conventions

- Env is validated once in `src/lib/env.ts` (zod). Nothing else reads `process.env`.
- Server logic lives in `src/lib`, `src/ingest`, `src/settlement`; route handlers
  and server actions stay thin.
- Every DB change goes through a committed Drizzle migration. No ad-hoc schema edits.
- IDs are text (ULID-style), generated in app code.
- Extractors implement `Extractor` from `src/ingest/extractors/types.ts` and return a
  confidence in [0,1]; the pipeline routes below-threshold results to review.
- Tests live in `tests/`, mirror `src/` paths, and must pass before every commit.
- Prefer server components; client components only where interaction needs them.
- Commit at the end of each phase only after `npm run check` passes.

## Dev environment notes

- Work in the Desktop copy (see Current status). The NAS share copy is an SMB mount:
  installs there take ~35 min and builds ~8 min, and Turbopack's persistent cache is
  disabled because SMB rejects fsync. Don't delete either checkout without asking.
- Node 22 via Homebrew (`node@22`, linked). Docker Desktop is installed on the Mac
  (`docker buildx` available); production images are built by GitHub Actions.
- Real bill PDFs live in `sample-bills/` (gitignored); `pdftotext` is available locally.
- Local test servers: use port 3462 with an absolute `DATA_DIR`; the standalone
  server chdirs into `.next/standalone`.

## Phases

0 Scaffolding · 1 Data model + auth + manual entry + demo mode + rent as a service

- member active dates · 2 Dashboard + anomaly flags + /wall · 3 Ingestion pipeline
- status page + re-parse from archive + PDF-side review · 4 Projections + reminders
- PWA + statement export + onboarding wizard + DEPLOY.md.
  Stop and check in with the owner between phases.

## Decisions log

Append entries as `- YYYY-MM-DD — decision — why`. Do not rewrite old entries.

- 2026-09-23 — Drizzle over Prisma — SQLite-native, plain SQL migrations, no query-engine binary in the image.
- 2026-09-23 — Money as integer minor units + currency code — avoids float rounding in splits and totals; works for any currency.
- 2026-09-23 — IMAP poller runs in-process via Next `instrumentation.ts` — keeps the single-container constraint without a second process manager.
- 2026-09-23 — International-ready from Phase 0 — the alpha may be shown to investors; currency/locale/timezone/units are settings, not assumptions.
- 2026-09-23 — Single `household` row in the schema — future-proofs multi-household without building it (SCOPE §2 still defers it).
- 2026-09-23 — next-intl from day one — extracting strings later is far costlier than doing it as we go.
- 2026-09-23 — Debian-slim base image, not Alpine — better-sqlite3 ships prebuilt glibc binaries; avoids compiling native code in the build.
- 2026-09-23 — Node 22 LTS — Next 16 needs ≥20.9 and Vitest 5 needs ≥22.12; Node 19 on the dev Mac was EOL.
- 2026-09-24 — ESLint pinned to 9.x — eslint-config-next 16 bundles eslint-plugin-react, which still calls `context.getFilename` and crashes on ESLint 10.
- 2026-09-24 — Turbopack filesystem cache disabled — the SMB mount rejects fsync (os error 45); builds and dev run uncached.
- 2026-09-24 — Setup wizard moved from Phase 4 to Phase 1 — owner wants the household name and shared/single choice captured on first run, before any data exists.
- 2026-09-24 — `household.split_mode` (shared|single) — single households skip share creation and hide share UI; switchable in Settings, existing shares are kept.
- 2026-09-24 — Auth guard lives in the `(app)` route-group layout, not middleware — the guard needs the DB (household + member lookup), which Next proxies/middleware cannot touch.
- 2026-09-24 — Share amounts and periods lock once a non-payer share is paid — prevents silently changing what someone already settled; delete and re-enter instead.
- 2026-09-24 — Payment references capped at 18 chars — fits the common bank transfer reference limit; template placeholders {service} {period} {member} {ref}.
- 2026-09-24 — Monthly totals accrue bills across the months they cover (pro-rata by days) — a quarterly bill shows as three months of cost, so trends and seasonality are honest; "due" lists still use the real due date.
- 2026-09-24 — Anomaly = cost per day ≥30% above or below the median of prior bills for the same service (needs 2 priors) — cadence-agnostic, so a quarterly bill after monthly ones compares fairly. Computed on bill create/update, stored on the bill.
- 2026-09-24 — Service and member colours come from the dataviz-validated 8-step palette (`src/lib/palette.ts`, light + dark steps) — Apple system colours failed CVD separation and contrast checks. User-picked colours still allowed.
- 2026-09-24 — `/wall` sits behind the normal session (log in once on the iPad) — a LAN-only alpha still shouldn't show household finances to any device that finds the port.
- 2026-09-24 — Settings moved to a header gear; bottom tab bar is Home · Bills · Ledger · Services · Members (Ledger hidden for single households).
- 2026-09-24 — Extractor order: template parsers → LLM → review; first result at/above `EXTRACTOR_CONFIDENCE_THRESHOLD` wins, otherwise the best attempt is stored on the document for the review form. Nothing below threshold, with no matching service, or with a duplicate invoice number ever becomes a bill silently.
- 2026-09-24 — Every archived document keeps `extraction_json` (best result, all attempts, reason, text preview) — powers the review UI and the status page's auto-read rate, and makes re-parse from archive a one-click action.
- 2026-09-24 — Emails with PDF attachments: the .eml is archived and marked `ignored` as an envelope; each PDF is its own document. Emails without attachments run through the pipeline on their HTML/text body.
- 2026-09-24 — IMAP progress tracked by UID in `DATA_DIR/config/imap-state.json` (reset on UIDVALIDITY change) rather than by \Seen flags — a human reading the mailbox can't cause reprocessing or skipping.
- 2026-09-24 — LLM extractor uses `messages.parse` with a zod output schema and a cached system prompt; only bill _text_ is sent (max 60k chars), never the file. Model comes from `ANTHROPIC_MODEL`.
- 2026-09-24 — Template parser fixtures are redacted copies of real invoice text (`tests/fixtures/`); real PDFs stay gitignored.
- 2026-09-24 — Review queue lives in the header (inbox icon with count) rather than the tab bar — five tabs is the phone limit.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- 2026-09-24 — `npm start` runs `.next/standalone/server.js`, never `next start` — with `output: standalone`, `next start` silently 404s some routes (seen on /review and /status) while the standalone server serves them; Docker uses the same server.
- 2026-09-24 — Standalone server chdirs into `.next/standalone`, so `npm start` makes a relative `DATA_DIR` absolute first (`$PWD/data`); Docker passes `/data` so it's unaffected.
- 2026-09-24 — Phase 4 restyle: "Ink & Mist" dark / "Linen" light, chosen by the owner from the mockup canvas (https://claude.ai/artifact/BzeEmm3c16cbvCdTTtGmh4, boards F4 + F5). Glass cards (`.glass`) over a gradient ground with faint diagonal stripes, Outfit display + Manrope body via next/font, slate/mist accent, softened status colours (ochre/rose/slate), floating segmented bottom nav on every breakpoint, no sidebar. All tokens live in `globals.css`; chart tooltips use `--color-surface-solid` because translucent glass is unreadable over bars.
- 2026-09-24 — Dashboard greeting is two lines from the mockup: "Hey, {name}." then a computed line ("September is tracking level / running 4% above August…"), replacing the plain page title.
- 2026-09-24 — Projections (`src/lib/projections.ts`): per service, cost per day from (a) the same month last year × bounded drift when ≥4 bills and last-year coverage exists ("seasonal"), else (b) mean of the last 3 bills ("recent"), else the single bill. Month estimate = known accrual + per-day × remaining days; cached in `projection` on every read. Set-aside splits each service's estimate with its own split rules across active members; the headline "each" figure is the mean.
- 2026-09-24 — Reminders are in-app only for the alpha (`src/lib/reminders.ts`): a member's unpaid shares ranked overdue → due within 7 days → later, shown on the dashboard and ledger. Push/email is roadmap.
- 2026-09-24 — Statement export is CSV (`/api/export`): per-member financial-year statement (self, or anyone for the owner) and an owner-only all-bills export. PDF statements are roadmap.
- 2026-09-24 — PWA: manifest + SVG/PNG icons + a network-first service worker that keeps the last copy of pages so the dashboard opens when the NAS is briefly unreachable. API routes are never cached.
- 2026-09-24 — Dockerfile copies only `.next/standalone` because `postbuild` already places static, public and drizzle inside it; DEPLOY.md covers TrueNAS Scale custom app + plain compose. Container UID/GID 1001 must own the host path.
- 2026-09-24 — Docker image verified on the Mac (Docker Desktop, linux/arm64): deps stage installs python3/make/g++ because better-sqlite3 has no prebuilt binary for every Node/arch pair; pdf-parse is imported lazily so pdf.js never loads at server start; `pdfjs-dist`, `pdf-parse` and `@napi-rs/canvas` are copied whole from the deps stage because they load their worker and canvas polyfill dynamically, which Next's file tracing misses. Image ≈620 MB. Verified: health, routes, migrations + demo seed on a bind-mounted volume, and a real PDF parsed inside the container.
- 2026-09-24 — Health endpoint reports the version from package.json (npm_package_version is unset under the standalone server).
- 2026-09-24 — Dashboard follows the merged mockup tile grid (stats · chart/next-due/bills · who-owes/settled-gauge/set-aside · ranking/anomalies). Next-due shows the viewer's own share with a one-click mark-paid; settled gauge = paid non-payer shares on bills due this month.
- 2026-09-24 — Multi-arch image: `docker buildx build --platform linux/amd64,linux/arm64 --push`; amd64 verified building under emulation on the Mac. Pushing needs a `docker login` the owner performs (credentials are never entered by the assistant).
- 2026-09-24 — Services are tinted tiles (service colour mixed into the surface via color-mix), Bills is a tile grid with a document strip (source, confidence, shares, invoice no.), and /wall follows the Glass Night wall board (two-column glass, 8vw month figure, sparkline, per-service legend, red-tinted next-due when overdue).
- 2026-09-24 — Release flow: the NAS working copy accepts pushes (`receive.denyCurrentBranch=updateInstead`; Mac remote `nas`), and `deploy/truenas-app.yaml` builds the image from that folder so the TrueNAS Update button rebuilds from the current commit; `deploy/update.sh` scripts build + redeploy via midclt. The old docker-compose.yml and registry/prebuilt-image paths were removed as redundant.
- 2026-09-24 — Visual system v2 (owner found v1 boring): fixed ambient scene of four slow-drifting blurred colour blobs + film grain + vignette (`.scene`), one big frosted `.window` holding the top bar and content, opaque-ish `.glass` tiles with rim + inner highlight and hover lift, ring/arc instruments (`src/components/ui/ring.tsx`), gradient stacked area chart, six-month forecast strip, glowing icon discs + sparklines on service tiles, working header search (→ /bills?q=). No photo backdrop by owner's choice.
- 2026-09-24 — BRAND.md created as the design reference (voice, colour tokens both themes, scene, glass recipes, type: Outfit display / Manrope body / JetBrains Mono for identifiers, instruments, layout, motion, a11y). Tabular numerals enabled globally. Scene layers now render once from the root layout, behind everything; nav pill uses an 88%-opaque glass; the arc gauge never uses the SVG large-arc flag.
- 2026-09-24 — Bills, Ledger and /wall carry visual system v2: Bills has status filter chips, month groups, glow-disc icons, a shares-paid bar per tile; Ledger has a paid ring hero, avatar chips for who-owes-you, grouped history; wall has a budget ring, the gradient area chart, a settled ring and a Back-to-dashboard pill (owner request).
- 2026-09-24 — Charts simplified to match the references: one smooth trend line per chart (`TrendLine`) with gradient area, glow, point dots, a callout on the latest value and a data-fitted axis; service breakdown lives in the ranking and tooltip, not stacked layers. Stacked bars/areas and the legend component removed. Sparklines gained a glow and end dot.
- 2026-09-24 — Theme override: Settings → Appearance sets a per-browser cookie (`hud_theme` auto|light|dark) applied as `data-theme` on <html>; dark tokens apply via the media query unless light is forced. Exit demo: owner-only; wipes all household rows (catalog stays), writes `config/demo-off.json` so the seeder stays off, and opens the setup wizard. Demo data is flagged by `config/demo.json`.
- 2026-09-24 — Setup wizard is paged (Household → Region → Your account) inside one form: only the active page renders visibly, Next runs native validation on that page, server field errors jump to the owning page. ActionForm gained `hideSubmit` for wizards.
- 2026-09-26 — Release flow moves to GitHub: Actions runs `npm run check`, builds linux/amd64 and pushes `ghcr.io/thyglizzyglobber/home-utilities` `:latest` + `:<sha>` with `APP_COMMIT`/`APP_BUILT_AT` stamped in. Replaces building from the NAS checkout (`deploy/update.sh` removed) — the owner wants a Settings Update button driven by GitHub pushes, and a prebuilt image makes updates a pull instead of a rebuild.
- 2026-09-26 — Self-update via a request file, not a NAS API key: Settings → Software update writes `config/update-request.json`; a root cron job on TrueNAS (`deploy/nas-updater.sh`) deletes it, snapshots the data dataset, runs `midclt call -j app.pull_images home-utilities '{"redeploy": true}'` and keeps the last 10 pre-update snapshots. The app will be internet-facing, so it must never hold credentials that can control the NAS. The script lives outside the container-writable dataset and never reads the request's contents.
- 2026-09-26 — Update check reads the latest successful `release.yml` run on `main` (so it only offers commits whose image exists) and GitHub's compare API for the commit list, using a fine-grained read-only token (`UPDATE_GITHUB_TOKEN`); cached 2 minutes. Without a token the button still installs `:latest`.
- 2026-09-26 — `/api/health` reports `commit` and `builtAt` and no longer returns the data directory path (it will be reachable from the internet).
- 2026-09-26 — NAS install uses the guided Custom App form with an ixVolume for `/data` (ACL entry for the container user), not a hand-made dataset — owner wants the app's data stored with the other apps' data. `nas-updater.sh` looks up the dataset's mountpoint (ixVolumes mount under `/mnt/.ix-apps`) and lives in the plain folder `/mnt/SSD/AppData`, outside anything the container can write. The YAML/host-path install stays as the documented alternative.
- 2026-09-26 — Container user is UID/GID 568 (`apps`), replacing 1001 — 568 is TrueNAS SCALE's built-in apps user, so the ixVolume carries the same owner as the NAS's other apps. Changed before the first NAS install, so no data needed re-owning.
