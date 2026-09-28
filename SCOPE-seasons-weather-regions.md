# Seasons, weather and regional insights — project scope

**Status:** approved 29 September 2026 with the §10 recommendations as the decisions (owner). **S1–S4 built** (29 Sep 2026). S4 was started before the §7 legal checklist, by the owner's decision, and D2 changed: sharing is **on by default** with an opt-out in Settings (not opt-in). The §7 review is still recommended before the app is offered beyond family households. S2 used GeoNames postcode data (owner's choice) instead of ABS + NCC climate zones; climate zones are deferred to S3's weather data.
**Owner:** BRJ Labs · **Drafted:** 29 September 2026 · **Extends:** [SCOPE.md](SCOPE.md) (roadmap item 14)

Each phase below is approved on its own before it is built, as with Prototype 1.

---

## 1. Summary

Households' energy bills follow the weather: electricity climbs in winter for
heating (and in summer for cooling), gas peaks in winter, and solar export peaks
in summer. The app doesn't know this yet. It flags a normal winter bill as
"Unusual", it can only anticipate a seasonal jump once it has a year of the
household's own bills, and it never tells anyone why a month will cost more.

This project makes the app season- and weather-aware in four phases:

| Phase                                | What it delivers                                                                                                                                                           | Needs                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **S1 Seasons from your own history** | "Unusual" stops firing on normal seasonal swings; forecasts say "winter usually adds 35% to your electricity, about $X a month".                                           | Nothing new: bills already stored                        |
| **S2 Household location**            | Postcode + country on each household; hemisphere, season names, climate zone and a map point derived from it.                                                              | Postcode reference data                                  |
| **S3 Weather**                       | Degree-days per bill, weather-adjusted comparisons ("you used 12% more, but it was 18% colder"), weather-driven forecasts, solar expectations, a dashboard weather widget. | Weather data provider                                    |
| **S4 Regional insights**             | Opt-in pooled, de-identified figures by area: "households like yours in 3550 used 11.2 kWh a day this winter", area rates, solar comparisons.                              | Consent, privacy policy, legal advice, enough households |

S1 fixes a real problem today and stands alone. S4 is where the long-term value
of the data is, and it changes what the product promises users, so it has its
own legal and consent gate (§7).

## 2. Goals and non-goals

**Goals**

1. No false "Unusual" flags for normal seasonal changes; a real jump still gets flagged.
2. Every household is told, ahead of time and in plain words, when a season will raise or lower a bill, and by roughly how much, based on evidence.
3. Separate "you used more" from "it was colder/hotter", so households can see whether their own behaviour changed.
4. Collect location in a privacy-preserving way (postcode, not address) that works internationally.
5. Build a regional dataset that is useful to households now and valuable later, without ever exposing any single household.

**Non-goals (this project)**

- Street addresses, GPS or smart-meter interval data.
- Real-time usage or appliance-level breakdowns (roadmap: hardware experiments).
- Selling or licensing the dataset (a separate decision after legal review; S4 builds only the in-app feature and the consent to enable it later, if chosen).
- Retail plan switching advice (roadmap item 7, which S4 feeds).
- Weather alerts unrelated to bills (storms, fire danger).

## 3. Where the app is today

| Area                                         | Today                                                                                                                            | Problem                                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unusual flag (`src/lib/anomaly.ts`)          | Bill's cost per day vs the median of all earlier bills for the service; flag at ≥30% above or below (≥2 earlier bills).          | A winter bill after autumn bills is flagged "Unusual" although nothing is wrong; a genuinely high winter bill can't be told apart from a normal one. |
| Projections (`src/lib/projections.ts`)       | Per service: same month last year × drift when ≥4 bills and last-year coverage, else mean of last 3 bills, else the single bill. | Needs a full year of the household's own bills; never explains a seasonal change; no weather.                                                        |
| Usage comparisons (`src/lib/consumption.ts`) | Per day vs last bill, same time last year, recent average, the household's limit, similar households (when printed).             | Doesn't separate weather from behaviour.                                                                                                             |
| Bill figures (`bill_metric`)                 | Every figure on each bill, incl. `solar_export`, usage by tariff, daily averages.                                                | Ready to use; nothing seasonal reads it yet.                                                                                                         |
| Household settings                           | Currency, locale, IANA timezone, fiscal year, week start.                                                                        | No location; hemisphere is only implied by the timezone.                                                                                             |
| Data scope                                   | Every query scoped to one household; a household only sees its own data (hard constraint).                                       | S4 needs a controlled, consented exception for aggregates.                                                                                           |

## 4. Concepts

- **Season.** Meteorological seasons by hemisphere. Southern: summer Dec–Feb, autumn Mar–May, winter Jun–Aug, spring Sep–Nov; northern is shifted six months. Tropical climate zones use **wet (Nov–Apr) and dry (May–Oct)** instead; calendar winter means little in Darwin. Season names are for wording only: the calculations use months and weather, never season labels.
- **Seasonal index.** For one service, how each calendar month's cost (or usage) per day compares with the service's yearly average: 1.35 in July means July runs 35% above average. Computed from the household's own history (S1) and later from weather (S3) or the area (S4).
- **Heating and cooling degree-days (HDD/CDD).** For each day, how far the mean temperature fell below (HDD) or rose above (CDD) a base temperature. Summed over a bill period, they measure how much heating or cooling the weather demanded. Base temperatures are settings (start at 18 °C for both; tune against real bills).
- **Weather-adjusted usage.** Usage per day with the weather's effect removed, from a per-service model: _usage/day ≈ base + h·HDD/day + c·CDD/day_. Lets "you used more" be separated from "it was colder".
- **Area levels.** Postcode → region (a group of postcodes within a state and climate zone) → state → country. S4 shows the finest level that meets the privacy threshold.
- **k-threshold.** The minimum number of distinct households behind any figure shown from pooled data (proposed k = 10), plus a dominance rule (no single household may make up more than half of a figure).

## 5. Phases

### S1 — Seasons from the household's own history

**User-facing**

- **Unusual flag, seasonal.** A bill is compared with the bill(s) covering the same months last year (per day, adjusted for the service's overall drift). Only when there's no last-year bill does it fall back to the recent median, and for weather-sensitive services (electricity, gas, and others the household marks) the fallback allows for the expected seasonal swing instead of flagging it.
  - Note wording says what it compared against: "38% above the same time last year" or "22% above your recent bills (no bill from last winter to compare yet)".
  - Existing flags are recalculated once with the new rule, so historical winter bills lose false flags.
- **"Season ahead" notice** on the dashboard and each weather-sensitive service page, two to four weeks before a heavy or light season, when the household has last year's bills for it:
  - "Winter starts in 3 weeks. Last winter your electricity ran 35% above autumn: about $84 more a month. Your set-aside for June already allows for it."
  - "Summer's coming: last summer your solar export roughly doubled and electricity dropped 20%."
- **Projections explain themselves.** Each projected month shows its driver: "Seasonal: based on last July, adjusted for your recent usage" or "Recent: no bill from last July yet".
- **Optional email heads-up** once per season per service (category: reminders, off by default for members, on for the payer).

**Logic**

- Seasonal index per service from ≥12 months of bills (accrue each bill across the months it covers, as monthly totals already do; per-day cost and per-day usage).
- Anomaly baseline: same-period-last-year bill(s) by midpoint (±45 days), × drift (recent 3 bills vs the 3 before last year's bill, bounded 0.8–1.25). Threshold stays 30%.
- Weather-sensitive by default: electricity, gas. Households can switch it per service ("This service changes with the seasons").
- Hemisphere in S1 comes from the household's timezone (e.g. `Australia/*`, `Pacific/Auckland` → southern); S2 replaces this with the postcode.

**Data model**

- `bill.anomaly_basis` text: `last_year` | `recent` | `seasonal_allowance` (so the UI can say what was compared).
- `service.seasonal` boolean (default true for electricity and gas).
- No new tables; seasonal indexes are computed on read and cached with projections.

**Acceptance**

- A household with last winter's bills: this winter's bill within 30% of last winter (after drift) is not flagged; one 40% higher is, with a "same time last year" note.
- No last-year bill: a winter electricity bill 35% above the autumn median is not flagged on a seasonal service, is flagged on a non-seasonal one (e.g. internet).
- Recalculating existing flags changes only `is_anomaly`, `anomaly_note`, `anomaly_basis`.
- The season-ahead notice appears only when evidence exists and shows its basis.

**Size:** small–medium (≈3–4 working days incl. tests).

### S2 — Household location

**User-facing**

- Setup wizard (Region page) and Settings ask for **country** (already implied by currency/locale, confirmed here) and **postcode**. Wording: "Your postcode lets the app know your seasons and weather. We never ask for your address."
- Settings shows the derived area: "3550 · Bendigo, Victoria · Climate zone 6 (mild temperate) · Southern hemisphere".
- Existing households are asked once, with a dismissible card on the dashboard (admins only).

**Data model**

- `household.country` (ISO 3166-1 alpha-2), `household.postal_code`, `household.latitude`, `household.longitude` (postcode centroid, rounded to 0.01°), `household.climate_zone`, `household.region_code`, `household.location_updated_at`.
- Reference table `postcode_area`: country, postcode, locality name, state, region code, centroid lat/lon, climate zone. Seeded from open data at build time (committed CSV + migration), not fetched at runtime.

**Reference data (Australia first)**

- Postcode areas and centroids: ABS Postal Areas (ASGS Edition 3), licensed CC BY 4.0 (attribution in Settings → About).
- Climate zones: National Construction Code climate zones by postcode (ABCB). **Licence to confirm before use.**
- Region grouping: postcodes grouped by ABS SA4 within climate zone (ABS correspondence files, CC BY 4.0).
- Other countries: postcode + manual map-point fallback (country centroid + a "move the pin" map) until a country dataset is added. The model stays international; only Australia is seeded.

**Acceptance**

- Postcode validated per country (AU: 4 digits, in the reference table); unknown postcode → asks for the nearest town instead.
- Hemisphere, season names and climate zone come from location once set; timezone only as fallback.
- Location is visible only to the household's members; the operator sees it only via the database.

**Size:** small (≈2–3 working days, most of it reference data preparation and licence checks).

### S3 — Weather

**Architecture**

- A `WeatherProvider` interface (same pattern as `Extractor` and `SettlementAdapter`): `dailyHistory(lat, lon, from, to)`, `forecast(lat, lon, days)`, `climateNormals(lat, lon)`, each returning daily mean/min/max temperature, HDD/CDD at the configured bases, solar radiation (MJ/m²) and sunshine hours.
- First provider: **Open-Meteo** (historical reanalysis, 16-day forecast, no key). Its free tier is for non-commercial use; a paid plan is needed once the product charges. **Terms to confirm (D5).** An alternative provider can be swapped in behind the interface.
- `weather_day` cache table keyed by grid cell (lat/lon rounded to 0.1°) and date: shared by every household in the same cell, contains no personal data, filled lazily and by a nightly job. Forecasts cached 3 hours.
- Network calls happen in the worker, never while rendering a page; pages read the cache.

**Per bill**

- `bill.hdd`, `bill.cdd`, `bill.solar_mj`, `bill.weather_filled_at`: weather summed over the bill's period, filled when the bill is created (or backfilled for history).

**Model per service** (weather-sensitive services with ≥6 bills spanning at least two seasons)

- Fit usage per day (and cost per day) ≈ base + h·HDD/day + c·CDD/day by least squares with sanity bounds (h, c ≥ 0); keep the fit's R² and use it only when it explains the data (R² ≥ 0.5), else stay on S1.
- Solar: export per day ≈ k·radiation per day for services with a `solar_export` figure.
- Refit when a bill is added; store coefficients on `service_weather_model` (service_id, base, h, c, solar_k, r2, bills_used, fitted_at).

**User-facing**

- **Weather-adjusted comparisons** on the service page and bill figures: "You used 12% more than last winter, but it was 18% colder. Adjusted for the weather, you used 5% less." Only shown when the model qualifies.
- **Forecasts from normal weather:** projections for months without last-year bills use the model × the area's normal degree-days; the season-ahead notice (S1) switches to "a normal July in Bendigo adds about 160 kWh".
- **Solar expectations:** "Sunnier months ahead: expect about 9 kWh a day of export in January (last January: 8.6)."
- **Dashboard weather widget:** today and 7-day outlook for the household's area, with heating/cooling days highlighted and a one-line bill impact ("A cold week ahead: about $12 more heating than a mild week"). Designed as a self-contained tile so a designer can restyle it.
- **Wall view:** optional weather strip.

**Acceptance**

- Backfilled degree-days for every bill in a test household with known weather match hand-calculated values (to 0.5 HDD).
- A fitted model reproduces held-out bills within 15% (per day) on the owner's real history before it's switched on for users.
- With no weather available (provider down), every screen falls back to S1 wording; no page waits on the network.

**Size:** medium–large (≈6–8 working days).

### S4 — Regional insights (pooled, opt-in)

**Gate:** does not start until D1–D3 and D6–D8 are decided and the legal checklist (§7) is done.

**Consent**

- Household-level opt-in by the admin, with a clear explanation and a link to the privacy policy: "Share anonymised usage and rates with households in your area. Nobody can see your household's bills; you'll see area averages in return." Members are told it's on (Settings shows it to everyone).
- Withdraw at any time; the household leaves every aggregate at the next nightly run.
- Terms and privacy policy updated; consent recorded with time and policy version (`household_consent`: household_id, kind, version, granted_at, withdrawn_at, by_member_id).

**What is pooled** (per bill, computed nightly from opted-in households)

- Area keys (postcode, region, state, country), climate zone, service type, normalised provider name, billing period and month(s), days.
- Usage per day (canonical unit), cost per day, effective rate (cost ÷ usage), tariff figures (rates, supply charge per day), solar export per day, weather-adjusted usage (S3), household size band (1, 2, 3–4, 5+ active members).
- **Never:** names, emails, addresses, account or invoice numbers, member names, free-text notes, raw documents, exact household size above 4, anything from a household that hasn't opted in.

**How it's stored and shown**

- Aggregates only: `regional_stat` (area level, area code, service type, month, metric key, n households, median, p25, p75, computed_at). Rows are written only when n ≥ k and no single household contributes more than 50% of the underlying data; otherwise the next wider area level is used.
- The nightly job reads source bills through a single audited query; no per-household pooled rows are stored.
- Figures shown in the app (household must also be opted in to see them):
  - "Households like yours in 3550 used 11.2 kWh a day this winter; you used 12.8 (14% more)."
  - "The typical electricity rate in your area this quarter was 31.2c/kWh; yours was 34.9c."
  - "Solar households in your region exported a median 7.9 kWh a day in January."
  - "3 retailers in your region raised supply charges in July."
- Minimum history before any regional figure appears: at least k households for that area, service and month.

**Commercial use (not built in this project)**

- If D1 is "commercial": a separate export pipeline over `regional_stat` only, after legal sign-off, with its own consent wording. Designed so it can never read household tables directly.

**Acceptance**

- Automated tests prove no aggregate is written for n < k or with a dominant contributor, and that withdrawal removes a household at the next run.
- A privacy review checklist signed off (§7) before release.
- Figures only appear for opted-in households.

**Size:** large (≈8–10 working days), plus legal review time.

## 6. Cross-cutting requirements

- **International-ready.** Seasons from hemisphere and climate zone, never hard-coded months; units through the unit registry; money in minor units; all wording in `messages/*.json`; Australia is the first seeded country.
- **Explainability.** Every seasonal or regional figure says what it's based on ("based on last July", "based on 14 households in your region") and is hidden when the evidence is too thin.
- **Performance.** No page makes network calls; weather and regional work happens in the worker; projections stay cached.
- **Security.** Location is household data (household-scoped like everything else); `weather_day` and `regional_stat` hold no personal data; regional reads never join back to households.
- **Tests.** Each phase adds unit tests over fixed fixtures (including a southern and a northern household, a tropical one, and a solar one) and a regression test over the owner's redacted real history.
- **Design handoff.** The calculations live in `src/lib` (season, weather, regional modules) returning plain data; the first screens are deliberately plain so a designer can restyle them without touching the numbers.
- **Documentation.** SCOPE.md, CLAUDE.md decisions log, DEPLOY.md (new settings, data licences and attributions) updated per phase.

## 7. Privacy and legal checklist (before S4; S2 items before S2)

Not legal advice; the points to take to a lawyer.

- **Australian Privacy Act 1988 / APPs.** Postcode plus household usage can be personal information for small households. Collection notice (APP 5), use for the stated purpose only (APP 6), security (APP 11), access and correction (APP 12–13).
- **Small business exemption.** Businesses under $3M turnover are usually exempt, but **not** if they trade in personal information. A commercial dataset likely removes the exemption; plan as if the APPs apply regardless.
- **De-identification.** Follow the OAIC De-identification Decision-Making Framework: aggregation thresholds (k), dominance rules, suppression of small areas, and a re-identification risk assessment before release.
- **Consent and policy.** Plain-language privacy policy and terms; versioned consent records; easy withdrawal.
- **Data licences.** ABS (CC BY 4.0, attribution), ABCB climate zones (to confirm), weather provider terms (commercial use).
- **Other countries.** GDPR/UK GDPR (lawful basis, DPIA) and US state laws before regional pooling is offered outside Australia.
- **Pending reform.** Privacy Act reforms are in progress; review the consent design against them at S4 start.

## 8. Risks

| Risk                                                           | Mitigation                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Too few households for regional figures to mean anything       | Build S1–S3 first (valuable alone); S4 shows nothing until k is met; widen areas automatically. |
| Weather model fits badly (small samples, changes in household) | Only use it when R² qualifies; fall back to S1; show the basis.                                 |
| Re-identification from small areas                             | k-threshold, dominance rule, household-size bands, no per-household pooled rows, legal review.  |
| Weather provider terms or availability                         | Provider behind an interface; cached history; graceful fallback.                                |
| Reference data licences                                        | Confirm before seeding; attribution in the app.                                                 |
| Trust: users feel watched                                      | Postcode only, opt-in pooling, plain wording, visible settings, easy withdrawal.                |
| Tropical and mixed climates                                    | Wet/dry seasons for tropical zones; calculations never depend on season names.                  |

## 9. Delivery plan

| Order | Phase                   | Depends on                                      | Gate                                               |
| ----- | ----------------------- | ----------------------------------------------- | -------------------------------------------------- |
| 1     | S1 Seasons from history | —                                               | Owner approves S1                                  |
| 2     | S2 Location             | D3, D4, data licence check                      | Owner approves S2                                  |
| 3     | S3 Weather              | S2, D5                                          | Owner approves S3; model validated on real history |
| 4     | S4 Regional             | S2 (S3 optional), D1–D3, D6–D8, legal checklist | Legal review done; owner approves S4               |

Each phase ships behind the usual release flow (commit → GitHub release → Update in Settings), with the owner's own household as the first test.

## 10. Decisions (all taken as recommended, owner 29 Sep 2026)

| #   | Decision                                                                       | Recommendation                                                                                              |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| D1  | Is the pooled dataset a commercial asset (sold/licensed) or an in-app feature? | Build it as an in-app feature first; design so commercial use is possible later, only after legal sign-off. |
| D2  | Opt-in or on by default for pooling?                                           | Opt-in by the household admin, visible to all members.                                                      |
| D3  | Location granularity                                                           | Postcode + country only; never an address.                                                                  |
| D4  | Countries                                                                      | Model international from the start; seed Australia only.                                                    |
| D5  | Weather provider                                                               | Open-Meteo behind an interface; budget for its commercial plan once the product charges.                    |
| D6  | Privacy threshold k                                                            | k = 10 households, dominance limit 50%.                                                                     |
| D7  | Where pooled data lives                                                        | Same install, aggregate-only tables, computed nightly, no pooled per-household rows.                        |
| D8  | Household size in pooled data                                                  | Size bands (1, 2, 3–4, 5+), not exact counts.                                                               |
| D9  | Season-ahead email                                                             | Off for members, on for the payer, per service; weekly digest later.                                        |
| D10 | Default weather-sensitive services                                             | Electricity and gas; household can switch any service on or off.                                            |

## 11. Success measures

- False "Unusual" flags on the owner's financial year of bills drop to zero for normal seasonal bills, while a planted genuine jump is still flagged.
- Season-ahead estimates land within 15% of the actual next seasonal bill for households with a year of history.
- With weather (S3): weather-adjusted comparisons explain at least half the variance in electricity usage for heating-driven households.
- S4: at least one region reaches k for electricity within the first year of opt-in; zero re-identification findings in review.

---

_BRJ Labs — seasons, weather and regional insights scope (proposed). Feedback and decisions to the owner before any phase starts._
