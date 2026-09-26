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

| Section                 | Field                  | Value                                                                            |
| ----------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| Application Name        | Application Name       | `home-utilities` (the updater expects this name)                                 |
| Image Configuration     | Repository             | `ghcr.io/thyglizzyglobber/home-utilities`                                        |
|                         | Tag                    | `latest`                                                                         |
| Container Configuration | Timezone               | `Australia/Melbourne`                                                            |
|                         | Environment Variables  | `AUTH_SECRET` = output of `openssl rand -base64 48`                              |
|                         |                        | `UPDATE_REPO` = `ThyGlizzyGlobber/Home-Utilities-Software--Prototype-1-`         |
|                         |                        | `UPDATE_GITHUB_TOKEN` = the **fine-grained** token                               |
|                         | Restart Policy         | Unless Stopped                                                                   |
| Security Context        | Custom User            | leave **off** (the image runs as UID/GID 1001)                                   |
| Network Configuration   | Ports                  | Container Port `3000`, Host Port `30080`, TCP                                    |
| Portal Configuration    | Name / Protocol / Port | `Web UI` / HTTP / `30080`                                                        |
| Storage Configuration   | Add → Type             | **ixVolume**                                                                     |
|                         | Mount Path             | `/data`                                                                          |
|                         | Dataset Name           | `data`                                                                           |
|                         | Enable ACL             | on, then ACL Entries → Add: ID Type **USER**, ID `1001`, Access **FULL_CONTROL** |

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
`chown -R 1001:1001 /mnt/.ix-apps/app_mounts/home-utilities/data`, start the app.

## 7. Remote access (Cloudflare Tunnel)

Install **Cloudflared** from Apps → Discover with your tunnel token, and in the
Cloudflare dashboard point the public hostname (e.g. `nameplaceholder.brjlabs.com`) at
`http://<nas-ip>:30080`.

**Until accounts and invitations ship, don't leave the hostname open.** Login is
still name + PIN and the login page lists members' names. In the meantime, put
a Cloudflare Access application in front of the hostname (Zero Trust → Access →
Applications) that only lets in the email addresses you list.

## 8. Wall display (iPad)

Open `http://<nas-ip>:30080/wall` in Safari, log in once (the session lasts
`AUTH_SESSION_DAYS`, default 30), then Share → Add to Home Screen and open it
from there for a full-screen kiosk. Use Guided Access to lock it. The page
refreshes itself every minute.

Phones: open the app in the browser and Add to Home Screen; it installs as an
app with an icon and keeps the last-loaded pages available offline.

## 9. Where things live on the volume

```
/data/db/utilities.sqlite          the database (WAL files beside it)
/data/inbox/YYYY/MM/…              raw emails, PDFs and uploads, never deleted
/data/config/imap-state.json       last processed mailbox UID
/data/config/update-request.json   present only while an update is queued
/data/config/update-last.json      the last update request (shown in Settings)
```

Exports: Ledger → "Download statement" gives a per-member CSV; the owner can
also download every bill from the same endpoint (`/api/export?kind=bills`).
