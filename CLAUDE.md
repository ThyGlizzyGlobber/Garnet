# Home Utilities Dashboard — Prototype 1 (BRJ Labs)

Self-hosted household utilities dashboard: ingests utility bills from a dedicated
mailbox, totals costs per service, splits them between housemates, tracks who has
paid, and projects upcoming bills. Runs as one Docker container on TrueNAS Scale.

**SCOPE.md is the source of truth.** Never contradict it. If something is ambiguous
or a decision seems wrong, stop and ask the owner before building around it.
§3 (provider inventory) may contain TODOs — providers are configurable data in the
DB, never hardcoded.

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
Docker multi-stage on node:22-bookworm-slim with Next standalone output.

## Commands

- `npm run dev` — dev server; migrations run on start via `src/instrumentation.ts`
- `npm run build` / `npm start` — production build / server
- `npm run check` — lint + typecheck + tests (must pass before every commit)
- `npm run lint` · `npm run typecheck` · `npm test` · `npm run format`
- `npm run db:generate` — generate a migration from `src/db/schema.ts` changes
- `npm run db:migrate` — apply migrations to `DATA_DIR/db/utilities.sqlite`
- `npm run db:seed` — load the four real Aussie Broadband invoices into the existing household (creates a dev household + owner PIN 1234 if none)
- `npm run db:seed:demo` — create the fictional "Riverside House" demo household (also runs automatically when `DEMO_MODE=true`)
- `npm run extract:dry-run <file>` — run the extractor pipeline on a bill file (Phase 3)
- `docker compose up --build` — run the container locally with `./data` mounted

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

- The repo lives on an SMB share mounted from the NAS. Installs and file watching
  are slow; that is expected. Don't move it without asking.
- Node 22 is installed via Homebrew (`node@22`, linked). Docker is not installed on
  the dev Mac, so image builds are verified on the NAS or another machine.
- Real bill PDFs live in `sample-bills/`; text extraction locally can use `pdftotext`.

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
