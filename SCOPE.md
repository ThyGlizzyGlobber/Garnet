# Home Utilities Dashboard — Prototype 1 Scope

**Project:** BRJ Labs · Home Utilities Software (Prototype-1)
**Status:** Draft for alpha-tester review
**Last updated:** 24 Sep 2026

---

## 1. The problem

Shared-household utility costs are opaque and manually managed. Bills arrive scattered across inboxes and portals, someone has to do the math on who owes what, and nobody can see spending trends or plan ahead. Existing tools (spreadsheets, Splitwise, banking apps) all require manual data entry — that's the part that fails in practice.

**The idea:** a dashboard that _automatically_ ingests the household's utility bills, totals them monthly/annually across services, splits costs between housemates, and projects what's coming — all visible at a glance on any phone and on a shared wall display.

## 2. Prototype 1 goals

The first working version, alpha-tested by our own household, then demoed to family/friends in other households.

A successful Prototype 1 means:

1. Bills for internet, electricity, gas, and water flow into the system with **zero manual typing** for supported providers (manual entry as fallback).
2. Any housemate can open the dashboard and see: current month's total, their personal share, what's due and when, and cost trends per service.
3. The system calculates each member's share and **tracks who has paid** (it does not move money — see §6).
4. Simple projections: "based on recent bills, set aside ~$X each this month."
5. A full-screen glanceable **wall view** running on an iPad in kiosk mode.

### Explicitly deferred (not in Prototype 1)

- Native iOS app (the web app is responsive; App Store comes after alpha feedback)
- Automated money pooling / direct debit of housemates (see §6)
- Hardware integrations (per-person water-flow sensing, smart meters)
- Consumer Data Right (CDR) energy/banking API integration
- Multi-household support / hosted SaaS (Prototype 1 is single-household, self-hosted)

## 3. Alpha household — provider inventory

> **⬜ FILL IN** — complete one row per service when the bill documents are on hand.

| Service                                             | Provider             | How the bill arrives (email / portal-only / paper) | Billing frequency | Approx. amount | Who receives it today | Notes (e.g. water billed to landlord?)                     |
| --------------------------------------------------- | -------------------- | -------------------------------------------------- | ----------------- | -------------- | --------------------- | ---------------------------------------------------------- |
| Internet                                            | **Aussie Broadband** | Email                                              | _TODO_            | _TODO_         | _TODO_                | First provider onboarded — sample bills in `sample-bills/` |
| Electricity                                         | _TODO_               | _TODO_                                             | _TODO_            | _TODO_         | _TODO_                |                                                            |
| Gas                                                 | _TODO_               | _TODO_                                             | _TODO_            | _TODO_         | _TODO_                |                                                            |
| Water                                               | _TODO_               | _TODO_                                             | _TODO_            | _TODO_         | _TODO_                |                                                            |
| _(other — streaming? cleaning? add rows as needed)_ |                      |                                                    |                   |                |                       |                                                            |

Also to fill in:

- **Household members:** _TODO — names + default split ratio (equal? weighted?)_
- **Dedicated bills mailbox address:** _TODO — e.g. a new Gmail account used only for bill forwarding_

**Sample bill corpus:** a `sample-bills/` folder in this project holds real (redact-if-shared) bill PDFs, starting with a few Aussie Broadband invoices. These seed the dashboard during development, act as the test corpus for the extraction pipeline, and are the reference for per-provider template parsers. Bills from other services get added to the corpus as they arrive.

## 4. How it works — the pipeline

```
Provider email ──▶ Dedicated bills mailbox (Gmail)
                        │  IMAP poll (every few minutes)
                        ▼
                  Ingestion service
                        │  saves raw email/PDF to NAS (audit trail)
                        ▼
                  Extractor (pluggable)
                   ├─ 1. Template parser (known providers, deterministic)
                   ├─ 2. LLM extraction (Anthropic API → structured JSON)
                   └─ 3. Low confidence? → Manual-review queue in the UI
                        ▼
                  Bill record in database
                        ▼
        Dashboard · Splits · Projections · Wall view
```

Key properties:

- **Raw bills are kept forever** on the NAS (`inbox/` folder) — audit trail and re-parse source.
- **LLM extraction** (Anthropic API) turns any bill layout into `{provider, service_type, amount, billing_period, due_date, usage + units}` with one prompt — no per-provider parser maintenance. Volume is ~10–30 calls/month (cents).
- The extractor is an **interface**, not a hard dependency: template parsers first, LLM fallback, manual queue last. Swapping or adding extraction methods later (local LLM, CDR APIs) touches config, not architecture.
- Anything unparseable becomes a "needs review" card with a pre-filled manual-entry form — the system degrades gracefully, never silently misses a bill.

## 5. Core features

### Dashboard (phone-friendly web)

- This month's total across all services + per-service breakdown
- **Your share** front and centre for the logged-in member
- Upcoming bills with due dates
- Trend charts per service (monthly, with same-period-last-year comparison as data accumulates)
- Annual running total and cost-per-service ranking

### Housemate splitting

- Configurable split ratios per service (default: equal)
- Per-member ledger: what you owe this cycle, what you've paid, running balance
- "Mark as paid" + payment reference generation from the bill payer's stored payment details (PayID/BSB, IBAN, Venmo, etc. — configurable per member)
- Reminder nudges for unpaid shares (in-app for Prototype 1)

### Projections

- Next-bill estimate per service from recent cycles, seasonally aware (winter gas ≠ summer gas)
- "Set aside ~$X each this fortnight/month" recommendation per member

### Wall view (`/wall`)

- Full-screen, glanceable, auto-refreshing route designed for an iPad in kiosk mode
- Household total, who-owes-what status, next due bill, trend sparkline
- Design target: readable from across the room, no interaction needed

### Manual review & entry

- Queue for failed/low-confidence parses
- Plain manual-entry form (covers paper bills and portal-only providers)

## 6. Money: calculate and track, never hold

Prototype 1 **never touches funds**. Holding or moving other people's money is a regulated activity everywhere (AFSL in Australia, EMI/PSD2 in the EU/UK, MSB licensing in the US), so settlement is designed as a **pluggable layer**:

- **v1 adapter:** compute shares → generate payment reference → track paid/unpaid.
- **Future adapter:** a licensed pooling/direct-debit service (shared-account products, bill-splitting services) plugs into the same interface when the project is ready — no core changes.

## 7. Architecture & deployment

| Decision      | Choice                                                                                                             | Why                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| App           | **Next.js (TypeScript)**, full-stack, single repo                                                                  | One language everywhere; fast to build and iterate with Claude Code; React ecosystem for the iOS-feel UI                           |
| UI            | Tailwind CSS + Recharts                                                                                            | Apple-like clean design; charting for trends/projections                                                                           |
| Database      | **SQLite** (single file) via ORM                                                                                   | Household-scale data; the DB file lives on a ZFS dataset, so **existing ZFS snapshots/replication = the entire backup strategy**   |
| Ingestion     | IMAP polling of a dedicated mailbox (Gmail for the alpha household)                                                | Works with any IMAP provider; no self-hosted mail server on a residential IP                                                       |
| Extraction    | Anthropic API (pluggable extractor interface)                                                                      | One prompt handles all providers in any country; also classifies service type and normalises units (kWh, MJ, therms, m³, kL, gal…) |
| Deployment    | **Single Docker container**; TrueNAS Scale custom app is the primary target, plain `docker compose` works anywhere | One image, one port, one host-path volume                                                                                          |
| Data location | `/mnt/<pool>/apps/utilities-dashboard/` → `data/` (SQLite, config) + `inbox/` (raw bills)                          | Everything lives and dies on the NAS                                                                                               |
| Access        | LAN: `http://nas.local:<port>`; remote access later via Tailscale if wanted                                        | No public exposure for the alpha                                                                                                   |
| Auth          | Simple member accounts (name + PIN/password)                                                                       | Household-scale; not internet-facing                                                                                               |

External dependencies: **the bills mailbox and the Anthropic API key. Nothing else.**

## 7a. International-ready by design

The alpha household is in Australia, but the alpha build is the version most likely to be shown to investors and to households in other countries. Nothing country-specific lives in core logic:

- **Household settings** (one record): currency (ISO 4217), locale (BCP 47), IANA timezone, fiscal-year start month, week start. Every total, period boundary, and display reads from these.
- **Money** is stored as integer minor units plus a currency code; display uses `Intl.NumberFormat`. Tax (GST/VAT/sales tax) is an optional amount + label on a bill.
- **Dates** are stored as ISO-8601; extractors receive a locale hint so DD/MM vs MM/DD is resolved per provider.
- **Units** go through a registry (kWh, MJ, therm, m³, kL, gal, ccf, GB…) with canonical conversions. Service types (internet, electricity, gas, water, rent, custom) and billing cadences (weekly … annual, irregular) are configurable data.
- **Payment details** per member are generic label/value pairs (PayID, BSB/account, IBAN, Venmo, Zelle…), and payment references come from a template.
- **UI copy** is externalised (next-intl) from day one. English only in the alpha; other languages are a data change.
- **Demo mode** boots a fictional household so the product can be shown without exposing real bills.
- Australian defaults (AUD, en-AU, July financial year) live in `.env.example` and seed data only.

## 8. Data model (sketch)

- **Household** — single record: name, currency, locale, timezone, fiscal-year start, week start (one per install; the seam for multi-household later)
- **Member** — name, PIN/password hash, split weights, active date range (move-in/out pro-rating), payment details as ordered label/value pairs
- **Service** — type (internet/electricity/gas/water/rent/custom), provider, billing cadence, default split
- **Bill** — service, amount (minor units) + currency, optional tax amount/label, billing period, due date, usage + normalised unit, source (template/llm/manual) + confidence, link to raw document, status, anomaly flag
- **Share** — bill × member → amount owed, paid_at, method
- **Projection** — service × month → estimated amount (computed, cached)

## 9. Privacy & security notes

- All bill data stays on the household NAS; only extracted bill _text_ is sent to the LLM API for parsing.
- Dedicated mailbox contains only forwarded utility emails — no personal inbox access, ever.
- App is LAN-only for the alpha; no ports exposed to the internet.

## 10. Alpha success criteria

After ~2 billing cycles with our household:

- [ ] ≥80% of bills ingested with no manual typing
- [ ] Every member checks their share without asking anyone
- [ ] Zero missed/lost bills (review queue catches all failures)
- [ ] Projection within ~15% of the actual next bill
- [ ] Wall iPad is genuinely glanced at (the honest test)
- [ ] At least one outside household says "I want this" after a demo

## 11. Roadmap after Prototype 1

1. **Alpha feedback round** — family/friends' households, structured feedback
2. **Settlement adapter** — integrate a licensed pooling / auto-collection service
3. **Native iOS app** (SwiftUI) + push notifications; wall-display product support as the market develops
4. **CDR integration** — regulated energy + banking data APIs to supplement or replace email ingestion
5. **Multi-household / hosted offering** — turn the self-hosted core into a product
6. **Hardware experiments** — per-person usage attribution (e.g. shower flow sensing)
7. **Tariff and plan tracking** — store rate plans; "you'd save $X on plan Y" comparisons (switching referrals are the obvious monetisation path)
8. **Carbon estimate** — regional emissions factors over normalised kWh/MJ usage
9. **Notifications beyond in-app** — web push, email digest, Telegram/Slack webhooks
10. **Read-only guest links** — landlord, accountant, or a departing housemate
11. **Community template parsers** — declarative rules so other households add providers without a release
12. **Open Banking / CDR payment confirmation** — close the "did they actually pay" loop automatically
13. **Product metrics** — % of bills auto-parsed, time saved, money tracked; logged from the alpha onward for the pitch deck

## 12. Open questions

- Split rules for uneven usage (e.g. one member works from home — weighted electricity split?)
- ~~How to handle a housemate moving in/out mid-billing-cycle (pro-rating)~~ → **Resolved:** members have an active date range; shares pro-rate by days active in the billing period (Phase 1–2)
- ~~Rent itself: in or out of scope for the dashboard?~~ → **Resolved:** in scope as a first-class fixed recurring service type (Phase 1)
- Portal-only providers: manual entry acceptable, or build a fetch step later?

---

_BRJ Labs — Prototype 1 scope. Feedback welcome: what's missing, what's overbuilt, would you use it?_
