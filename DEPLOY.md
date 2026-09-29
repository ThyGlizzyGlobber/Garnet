# Deploying Home Utilities Dashboard

One container, one port, one data volume. The volume holds everything: the
SQLite database, config, and every raw bill file under `inbox/`. Nothing else
has state. The code lives in the image,
which GitHub builds for every push to `main`.

Written for **TrueNAS SCALE 25.10 (Goldeye)** with the apps pool `SSD`.
`deploy/truenas-app.yaml` is an alternative install (Install via YAML, host-path dataset)
for setups that prefer their own dataset.

## How releases flow

```
git push origin main
  → GitHub Actions: lint + typecheck + tests, then builds the image
  → ghcr.io/thyglizzyglobber/home-utilities:latest (and :<commit>)
Settings → Software update → Update now
  → app writes /data/config/update-request.json
  → NAS cron job (every minute): snapshot data, pull image, redeploy
  → app restarts on the new version (~2 min); the settings page reloads itself
```

The app never holds credentials that can control the NAS. It can only leave a
request file; the host decides what to do with it.

## 1. GitHub tokens

Both are read-only. Create them at GitHub → Settings → Developer settings → Personal access tokens.

| Token                                                                                   | Used by                                  | Scope                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| **Classic** token (GHCR only accepts classic tokens)                                    | TrueNAS, to pull the private image       | `read:packages` only                    |
| **Fine-grained** token, repository access: only `Home-Utilities-Software--Prototype-1-` | the app, to show what an update contains | Actions: Read-only, Contents: Read-only |

## 2. Sign TrueNAS in to GitHub's registry

Apps → **Configuration** → **Sign-in to a Docker registry** → **Add Registry**:

- URI: **Other Registry**, `https://ghcr.io`
- Name: `ghcr`
- Username: your GitHub username
- Password: the **classic** token

## 3. Install the app (Custom App form, ixVolume storage)

Apps → Discover Apps → **Custom App**. Data goes in an **ixVolume**, the same
TrueNAS-managed storage the catalog apps use
(`SSD/ix-apps/app_mounts/home-utilities/data`), so no dataset has to be made
by hand. Fill in only these fields; leave everything else at its default.

| Section                 | Field                  | Value                                                                           |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| Application Name        | Application Name       | `home-utilities` (the updater expects this name)                                |
| Image Configuration     | Repository             | `ghcr.io/thyglizzyglobber/home-utilities`                                       |
|                         | Tag                    | `latest`                                                                        |
| Container Configuration | Timezone               | `Australia/Melbourne`                                                           |
|                         | Environment Variables  | `AUTH_SECRET` = output of `openssl rand -base64 48`                             |
|                         |                        | `UPDATE_REPO` = `ThyGlizzyGlobber/Home-Utilities-Software--Prototype-1-`        |
|                         |                        | `UPDATE_GITHUB_TOKEN` = the **fine-grained** token                              |
|                         | Restart Policy         | Unless Stopped                                                                  |
| Security Context        | Custom User            | leave **off** (the image already runs as 568, TrueNAS's `apps` user)            |
| Network Configuration   | Ports                  | Container Port `3000`, Host Port `30080`, TCP                                   |
| Portal Configuration    | Name / Protocol / Port | `Web UI` / HTTP / `30080`                                                       |
| Storage Configuration   | Add → Type             | **ixVolume**                                                                    |
|                         | Mount Path             | `/data`                                                                         |
|                         | Dataset Name           | `data`                                                                          |
|                         | Enable ACL             | on, then ACL Entries → Add: ID Type **USER**, ID `568`, Access **FULL_CONTROL** |

Everything else (currency, locale, bill mailbox, AI extraction) has working
defaults; add `ANTHROPIC_API_KEY` etc. later with **Edit** on the app.

Check it's up: `http://<nas-ip>:30080/api/health` shows `"status":"ok"` and the
running commit.

**Deleting the app:** TrueNAS asks whether to remove its ixVolumes. Leave that
unticked unless you mean to delete the household's data.

## 4. The updater cron job

The script must live outside the app's storage (root runs it; the container can
write to its own storage). A plain folder such as `/mnt/SSD/AppData` works.

1. System → Shell:
   ```bash
   mkdir -p /mnt/SSD/AppData/home-utilities-updater
   cat > /mnt/SSD/AppData/home-utilities-updater/nas-updater.sh
   ```
   paste the contents of `deploy/nas-updater.sh`, press Ctrl-D, then
   `chmod 700 /mnt/SSD/AppData/home-utilities-updater/nas-updater.sh`.
2. System → Advanced Settings → **Cron Jobs** → Add:
   - Description: `Home Utilities updater`
   - Command: `sh /mnt/SSD/AppData/home-utilities-updater/nas-updater.sh`
   - Run As User: `root`
   - Schedule: Custom, every minute (`* * * * *`)
   - Hide Standard Output and Hide Standard Error: on

The script defaults to app `home-utilities` and dataset
`SSD/ix-apps/app_mounts/home-utilities/data` and looks up where that dataset is
mounted. Override with `APP_NAME=… DATASET=… sh …` in the command if you change
either (e.g. a host-path install from `deploy/truenas-app.yaml`). Its log is
`update.log` next to the script. It also snapshots the data before every update
and keeps the last 10 `pre-update-…` snapshots.

Test it: Settings → Software update → **Update now** (or "Install latest
release"). Within a minute `update.log` shows the snapshot and the pull, and the
page reloads on the new version.

## 5. Rolling back

The data and the code roll back separately:

1. **Data**: `zfs rollback SSD/ix-apps/app_mounts/home-utilities/data@pre-update-…`
   in System → Shell (the log prints the exact name). Stop the app first.
2. **Code**: **Edit** the app and change the Tag from `latest` to the previous
   commit's full SHA (every build is also tagged with its commit). Switch back to
   `latest` once the fix is released.

Do both together if an update ran a database migration you need to undo.

## 6. Bringing existing data over (optional)

To move a household from another machine: stop the app, copy that machine's
`data/` folder contents into `/mnt/.ix-apps/app_mounts/home-utilities/data`
(System → Shell, e.g. from an SMB share with `cp -a`), run
`chown -R 568:568 /mnt/.ix-apps/app_mounts/home-utilities/data`, start the app.

## 7. Remote access (Cloudflare Tunnel)

Install **Cloudflared** from Apps → Discover with your tunnel token, and in the
Cloudflare dashboard point the public hostname (e.g. `nameplaceholder.brjlabs.com`) at
`http://<nas-ip>:30080`.

Sign-in needs Google or an emailed code, and the login page shows no member
names. Through the tunnel, cookies are marked Secure (cloudflared sends
`X-Forwarded-Proto: https`); on the LAN (`http://<nas-ip>:30080`, the wall
iPad) they aren't, so both keep working. Sign-in steps are rate-limited per
network (Cloudflare's `CF-Connecting-IP`), pages refuse to be framed, and
archived HTML bills are shown sandboxed. A Cloudflare Access policy in front
of the hostname remains an optional extra gate.

## 8. Accounts and sign-in

People sign in with Google or a one-time code sent by email, join a household
by invitation, and then choose their own PIN. The PIN only unlocks the app on
a browser that has already fully signed in (for `AUTH_SESSION_DAYS`, default 7);
five wrong PINs sign that browser out.

Add these to the app (**Edit → Container Configuration → Environment Variables**):

| Variable                                    | Value                                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                   | the public address, e.g. `https://home.brjlabs.com`                                                                                                        |
| `OPERATOR_EMAILS`                           | your email (comma-separate several). Operators get Software update and Poll now, and can link a household that existed before accounts                     |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud → Google Auth Platform → Clients (Web application). Redirect URI: `<APP_URL>/api/auth/google/callback`. Leave empty to hide the Google button |
| `RESEND_API_KEY`                            | Resend API key with sending access to your verified domain                                                                                                 |
| `EMAIL_FROM`                                | e.g. `Home Utilities <no-reply@mail.brjlabs.com>`                                                                                                          |
| `EMAIL_LOG_ONLY`                            | `true` writes emails to the app log instead of sending (only for trying things out)                                                                        |
| `AI_MONTHLY_LIMIT`                          | AI bill reads per household per month (default 60). Beyond it, new documents wait in the review queue until next month                                     |

**First sign-in after upgrading from a version without accounts:** sign in with
the email in `OPERATOR_EMAILS`. The Welcome screen offers to link your existing
household; confirm with your old PIN, which stays your PIN. Everyone else in the
household gets an invitation from **Members → (name) → Invite**.

## 9. Household bills addresses (Cloudflare Email Routing)

Each household gets its own address (Settings → **Bills email address**).
Email Routing hands mail for those addresses to a small Email Worker
(`deploy/email-worker/worker.js`), which signs each message and posts it to
`<APP_URL>/api/inbound/email`. The app archives it and reads it like any other bill.

**How households use it (prototype, 2026-09-28):** members forward each bill
from their own inbox to the household address as it arrives. Nobody changes the
email address on their provider accounts. From a forwarded email only the
attached PDFs are kept (each with the forward's sender and subject); an email
with no PDF is kept as the bill itself. The address is shown on the Bills page
for every member, with a Copy button.

**Chosen for this install (2026-09-28): the apex catch-all, `BILLS_ADDRESS_TEMPLATE={alias}@brjlabs.com`.**

Pick one address style. Cloudflare catch-alls only work on a zone's apex, so:

| Style                       | `BILLS_ADDRESS_TEMPLATE`          | Email Routing setup                                                                                                              | Trade-off                                                                                                        |
| --------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Apex catch-all              | `{alias}@brjlabs.com`             | Enable Email Routing on `brjlabs.com`; **Catch-all → Send to a Worker**                                                          | Cleanest addresses; all `@brjlabs.com` mail goes through the Worker (set `FORWARD_OTHER_TO` to receive the rest) |
| Plus address on a subdomain | `bills+{alias}@bills.brjlabs.com` | Email Routing → **Settings → Subdomains** → add `bills.brjlabs.com`; custom address `bills@bills.brjlabs.com` → Send to a Worker | Leaves `brjlabs.com` mail alone; a few provider forms reject `+`                                                 |

Steps:

1. Make a shared secret on the Mac: `openssl rand -hex 32`.
2. Cloudflare → `brjlabs.com` → **Email → Email Routing**: enable it (Cloudflare adds the MX/SPF records). For the subdomain style, add the subdomain under Settings.
3. **Destination addresses**: add and verify your own email (used as `FALLBACK_TO`, and `FORWARD_OTHER_TO` for the apex style).
4. **Email Workers → Create**: start from any template, replace the code with `deploy/email-worker/worker.js`, **Deploy**.
5. The Worker's **Settings → Variables and Secrets**: `APP_INBOUND_URL` = `https://home-utilities.brjlabs.com/api/inbound/email`, `INBOUND_EMAIL_SECRET` (type **Secret**) = the value from step 1, `FALLBACK_TO` = your verified email, and for the apex style `FORWARD_OTHER_TO` = your verified email.
6. **Routing rules**: the catch-all (apex style) or the `bills@` custom address (subdomain style) → action **Send to a Worker** → this Worker.
7. On TrueNAS add `BILLS_ADDRESS_TEMPLATE` and `INBOUND_EMAIL_SECRET` (same value) to the app and save.
8. Send a test: forward any bill to the address shown in Settings. It appears under Bills (or in the review queue) within a minute.

**Who can create bills by email.** Anyone who learns a household's address can
send to it, so the app checks each message's DKIM signature itself (Cloudflare
doesn't pass its verdicts to Workers). A signed bill is added straight away when
it comes from a household member (forwarded from the email they sign in with —
the usual case), from a sender already trusted for that
service, or from a domain that is plainly the provider's (`agl.com.au` for
AGL, `yvw.com.au` for Yarra Valley Water) — that domain is then remembered.
Unsigned mail, and signed mail from a domain that doesn't look like the
provider, waits in the review queue. Personal mailbox domains (gmail.com, …)
are only ever trusted as an exact address.

**Provider notices.** "Payment failed / declined / dishonoured" and "overdue"
emails flag that service's latest bill (a failed payment also un-marks it as
paid to the provider); "payment received" marks it paid and clears the flag.
**With `ANTHROPIC_API_KEY` set, no per-provider readers are needed.** The AI
reader decides what each document is — a bill, a payment receipt, a payment
problem, an overdue reminder, a payment confirmation, or something else — and
extracts the matching details (for bills also auto-pay and "last month
received"). Receipts, notices and other documents never become bills; unsure
readings change nothing. The AI reads every document; there are no built-in
per-provider readers. Without a key (or once the month's limit is used up)
bills wait for entry by hand, and emails are sorted by simple subject-line
rules ("payment failed", "payment received"). Model: `ANTHROPIC_MODEL` (default
`claude-opus-5`); reads count toward `AI_MONTHLY_LIMIT` (households the operator belongs to have no cap).
**Every figure is kept.** Besides the amount due, the AI lists every figure on a
bill (usage by tariff, meter readings, charges and credits, rates, daily
averages, comparisons, data used…) and they're stored with the bill for later
features (see "From the bill" on a bill's page). Bills read before this was
added can be read again from Settings → **Usage details from earlier bills**
(one AI read each).

**Usage comparisons.** Each service has its own page (tap it on Services):
usage per day on the latest bill, compared with the last bill, the same time
last year, the average of recent bills, an optional monthly usage limit (set it
when editing the service) and, when the bill prints it, similar households.
Everything is compared per day so monthly and quarterly bills compare fairly.
A bill's figures show their change since the last bill, the dashboard has a
Usage tile, and the new-bill email says when usage went over the limit.

**Finding bills.** Bills and the Inbox are grouped by the month each bill
belongs to (its issue date, or the billing period), not when the email arrived,
so forwarding a stack of old bills files each under its own month. The Bills
page has a search box (provider, month, amount, invoice number…, every word
must match, matches highlighted) and filters by status, service and year; the
Inbox has the same search.

**Area comparisons.** Households share anonymised monthly figures (cost,
usage, rates, supply charges, solar export per kind of service, with postcode
area and size band) unless an admin turns it off in Settings → Area
comparisons. Figures are pooled every six hours and only kept for areas with at
least `REGIONAL_MIN_HOUSEHOLDS` (default 10) households, so a small install
shows none. `/privacy` explains it to users. `REGIONAL_INSIGHTS=off` stops it.

**Weather.** Households with a postcode get local weather from Open-Meteo
(no key needed; data CC BY 4.0, credited in the app). The first update after
someone adds a postcode fetches ten years of daily history for that area (one
request), then the forecast every few hours. Open-Meteo's free API is for
non-commercial use: once the product charges, buy their commercial plan and set
`OPEN_METEO_API_KEY`. `WEATHER_PROVIDER=off` turns weather off. Status shows
when it last updated.

**Household location.** Each household can add its postcode (Settings →
Location, or during setup). It sets the hemisphere, seasons and local weather. Australian postcodes come from GeoNames
(`reference/postcodes/`, CC BY 4.0, credited in Settings); other countries keep
the postcode without a map point until their file is added.

**Scans and photos.** A PDF with no text layer (a scan) or a photo of a paper
bill (JPEG/PNG; upload it, or forward it) is sent to the AI as the file itself,
since there is no text to send. Everything else is sent as text only. iPhone
HEIC photos aren't supported yet: send them as JPEG (iPhone Mail and Safari
uploads usually convert automatically).

Create the key inside a workspace (Console → Settings → Workspaces → pick one →
API keys). An organisation-wide key is refused with "This API key is not
scoped to a workspace"; either make a workspace key or set
`ANTHROPIC_WORKSPACE_ID` to the workspace's ID. If the AI reader fails for
any reason, documents wait in the review queue with the error, and failed
calls don't count toward the limit.

**New providers set themselves up.** When a readable bill arrives from a
provider the household has no service for, the service is created from the
bill (type, name, billing frequency, account number, auto-pay), paid by the
member who forwarded it or otherwise the admin, split equally, and the admins
get a "New service" email asking them to check the payer and split. This only
happens for uploads, member forwards, and signed mail from the provider's own
domain (which is then trusted for that service); a stranger's mail still goes
to review. A cancelled service for the same provider is switched back on
instead of duplicated.

**Paid to the provider, without anyone ticking it.** A payment receipt (like
Aussie Broadband's "PAYMENT RECEIPT" PDF) marks the invoices it names as paid on the
receipt's date and clears any flag. Each new invoice's "Last Month … Payment
Received" line also confirms the previous bill (or flags it overdue if nothing
was received). Services whose invoices show automatic payment (card on file /
direct debit) are marked **Paid automatically**: their bills count as paid the
day after the due date unless a payment problem is reported, and the payer gets
no "pay the provider" reminder.

Other non-bill emails (password resets, plan changes) are kept as notices,
out of the review queue. Only signed notices change a bill.

Unknown addresses are rejected; if the app can't be reached, the Worker forwards
the message to `FALLBACK_TO` so no bill is lost. Each household can receive
`INBOUND_MAX_PER_HOUR` messages (default 60). If Cloudflare Access protects the
hostname, add a bypass for `/api/inbound/email` (the Worker authenticates by signature).

### Household emails

With `RESEND_API_KEY` set, members who have joined (signed in) get:

- **New bill**: their share, due date, payment reference and the payer's payment
  details; the payer gets what's due to the provider and what the others owe.
- **Reminders**: three days before a share is due, then on the first day
  overdue and weekly up to three times; the payer is reminded two days before a
  bill is due to the provider if it isn't marked paid. Sent 8am–8pm household
  time, checked every 15 minutes; bills overdue by more than four weeks are left alone.
- **Payment problems**: when a provider says a payment failed or a bill is
  overdue, the household admin and the payer are emailed straight away.

Each email is sent once (`notification_log`). Members switch each kind off on
their member page (**Email me about**), or from the link at the bottom of
every email; Gmail's one-click Unsubscribe works too (RFC 8058).

## 10. DMARC for brjlabs.com

DMARC tells other mail servers what to do with mail that claims to be from
`brjlabs.com` but fails authentication, which stops others spoofing the domain
and helps invites, sign-in codes and household emails avoid spam folders. The
only legitimate sender is Resend (`mail.brjlabs.com`, DKIM-signed and aligned).

1. Cloudflare → `brjlabs.com` → **Email → DMARC Management** → enable it. Cloudflare
   adds a `_dmarc` TXT record with a reporting address and shows the reports.
2. In **DNS → Records**, edit the `_dmarc` TXT record to:
   `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:<the address Cloudflare added>`
3. After a few weeks of reports showing only Resend passing, change `p=quarantine`
   to `p=reject`.

## 11. Wall display (iPad)

Open `http://<nas-ip>:30080/wall` in Safari and sign in once (the device stays
trusted for `AUTH_DEVICE_DAYS`, default 180; the PIN is asked every
`AUTH_SESSION_DAYS`), then Share → Add to Home Screen and open it
from there for a full-screen kiosk. Use Guided Access to lock it. The page
refreshes itself every minute.

Phones: open the app in the browser and Add to Home Screen; it installs as an
app with an icon and keeps the last-loaded pages available offline.

## 12. Where things live on the volume

```
/data/db/utilities.sqlite          the database (WAL files beside it)
/data/db/utilities.pre-migrate-*   a copy from before each update's migrations (latest five)
/data/inbox/households/<Household name> (<id>)/YYYY/MM Month/<service>/…
                                   every bill's file with its receipts and notices
/data/inbox/YYYY/MM/…              files as they arrived, until they're filed (or
                                   when they aren't about a bill)
/data/originals/<id>.<ext>         a scan exactly as it arrived, once it was turned upright
/data/config/upgrades.json         one-off upgrade steps already run on this install
/data/config/imap-state.json       last processed mailbox UID
/data/config/update-request.json   present only while an update is queued
/data/config/update-last.json      the last update request (shown in Settings)
/data/config/demo-off.json         present once someone left demo mode
```

Bill files are kept as the audit trail; deleting a bill deletes its file (and
its original).

Exports: Bills → "Download everything" gives a zip for an accountant (a README,
spreadsheets of bills, instalments, shares and files, and every file). Admins
get the household's bills plus their own personal ones, and so does every
member while "Everyone can download the household's bills" is on (Settings);
otherwise members get just their own personal bills. Ledger → "Download
statement" gives one member's shares for the financial year as a CSV.
