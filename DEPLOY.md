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
| `AI_MONTHLY_LIMIT`                          | AI bill reads per household per month (default 60). Beyond it, bills no template recognises wait in the review queue                                       |

**First sign-in after upgrading from a version without accounts:** sign in with
the email in `OPERATOR_EMAILS`. The Welcome screen offers to link your existing
household; confirm with your old PIN, which stays your PIN. Everyone else in the
household gets an invitation from **Members → (name) → Invite**.

## 9. Household bills addresses (Cloudflare Email Routing)

Each household gets its own address (Settings → **Bills email address**).
Email Routing hands mail for those addresses to a small Email Worker
(`deploy/email-worker/worker.js`), which signs each message and posts it to
`<APP_URL>/api/inbound/email`. The app archives it and reads it like any other bill.

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
5. The Worker's **Settings → Variables and Secrets**: `APP_INBOUND_URL` = `https://home.brjlabs.com/api/inbound/email`, `INBOUND_EMAIL_SECRET` (type **Secret**) = the value from step 1, `FALLBACK_TO` = your verified email, and for the apex style `FORWARD_OTHER_TO` = your verified email.
6. **Routing rules**: the catch-all (apex style) or the `bills@` custom address (subdomain style) → action **Send to a Worker** → this Worker.
7. On TrueNAS add `BILLS_ADDRESS_TEMPLATE` and `INBOUND_EMAIL_SECRET` (same value) to the app and save.
8. Send a test: forward any bill to the address shown in Settings. It appears under Bills (or in the review queue) within a minute.

Unknown addresses are rejected; if the app can't be reached, the Worker forwards
the message to `FALLBACK_TO` so no bill is lost. Each household can receive
`INBOUND_MAX_PER_HOUR` messages (default 60). If Cloudflare Access protects the
hostname, add a bypass for `/api/inbound/email` (the Worker authenticates by signature).

## 10. Wall display (iPad)

Open `http://<nas-ip>:30080/wall` in Safari and sign in once (the device stays
trusted for `AUTH_DEVICE_DAYS`, default 180; the PIN is asked every
`AUTH_SESSION_DAYS`), then Share → Add to Home Screen and open it
from there for a full-screen kiosk. Use Guided Access to lock it. The page
refreshes itself every minute.

Phones: open the app in the browser and Add to Home Screen; it installs as an
app with an icon and keeps the last-loaded pages available offline.

## 11. Where things live on the volume

```
/data/db/utilities.sqlite          the database (WAL files beside it)
/data/inbox/YYYY/MM/…              raw emails, PDFs and uploads, never deleted
/data/config/imap-state.json       last processed mailbox UID
/data/config/update-request.json   present only while an update is queued
/data/config/update-last.json      the last update request (shown in Settings)
```

Exports: Ledger → "Download statement" gives a per-member CSV; the owner can
also download every bill from the same endpoint (`/api/export?kind=bills`).
