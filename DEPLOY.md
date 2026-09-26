# Deploying Home Utilities Dashboard

One container, one port, one data volume. The volume holds everything: the
SQLite database, config, and every raw bill file under `inbox/`. Back it up by
snapshotting its dataset; nothing else has state. The code lives in the image,
which GitHub builds for every push to `main`.

Written for **TrueNAS SCALE 25.10 (Goldeye)**. Paths below use the pool `SSD`;
change them if yours differ.

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

## 1. Datasets

Storage → Datasets → select `SSD/AppData` → **Add Dataset**:

1. `home-utilities` (preset **Generic**). Parent for everything below. Stays root-owned.
2. Inside it, `data` (preset **Generic**). Mounted into the container as `/data`.

Then in **System → Shell**:

```bash
chown -R 1001:1001 /mnt/SSD/AppData/home-utilities/data
mkdir -p /mnt/SSD/AppData/home-utilities/updater
```

The container runs as UID/GID **1001** and only ever sees the `data` dataset.
The `updater` folder is a plain folder in the parent dataset, deliberately out
of the container's reach, because root runs the script inside it.

Resulting layout:

```
/mnt/SSD/AppData/home-utilities/
  data/          dataset, owner 1001 → /data  (db/, inbox/, config/)
  updater/       root only: nas-updater.sh + update.log
```

Data Protection → **Periodic Snapshot Tasks** → add one for
`SSD/AppData/home-utilities/data` (e.g. daily, keep 2 weeks). The updater also
takes its own `pre-update-…` snapshot before every update and keeps the last 10.

Optional, to bring the existing household over from the Mac: stop the app,
copy the Mac's `data/` folder contents into the `data` dataset (SMB or `rsync`),
then run the `chown` above again.

## 2. GitHub tokens

Both are read-only. Create them at GitHub → Settings → Developer settings.

| Token                                                                                   | Used by                                  | Scope                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| **Classic** token (GHCR only accepts classic tokens)                                    | TrueNAS, to pull the private image       | `read:packages` only                    |
| **Fine-grained** token, repository access: only `Home-Utilities-Software--Prototype-1-` | the app, to show what an update contains | Actions: Read-only, Contents: Read-only |

## 3. Sign TrueNAS in to GitHub's registry

Apps → **Configuration** → Docker registries → add a registry:

- URI: Other registry, `https://ghcr.io`
- Name: `ghcr`
- Username: your GitHub username
- Password: the **classic** token

## 4. Install the app

Apps → Discover Apps → ⋮ → **Install via YAML**. Name it `home-utilities`
(the updater expects that name) and paste `deploy/truenas-app.yaml` after
filling in:

- `AUTH_SECRET`: output of `openssl rand -base64 48`
- `UPDATE_GITHUB_TOKEN`: the **fine-grained** token
- optionally `ANTHROPIC_API_KEY` and the IMAP settings

Check it's up: `http://<nas-ip>:30080/api/health` shows `"status":"ok"` and the
running commit.

## 5. The updater cron job

1. Copy `deploy/nas-updater.sh` to `/mnt/SSD/AppData/home-utilities/updater/nas-updater.sh`.
   In System → Shell, run `cat > /mnt/SSD/AppData/home-utilities/updater/nas-updater.sh`,
   paste the file's contents, then press Ctrl-D.
2. System → Advanced Settings → **Cron Jobs** → Add:
   - Description: `Home Utilities updater`
   - Command: `sh /mnt/SSD/AppData/home-utilities/updater/nas-updater.sh`
   - Run As User: `root`
   - Schedule: Custom, every minute (`* * * * *`)
   - Hide Standard Output and Hide Standard Error: on

The script defaults to app `home-utilities` and dataset
`SSD/AppData/home-utilities/data`. Override with `APP_NAME=… DATASET=… sh …`
in the command if you change either. Its log is `updater/update.log`.

Test it: Settings → Software update → **Update now** (or "Install latest
release"). Within a minute `update.log` shows the snapshot and the pull, and the
page reloads on the new version.

## 6. Rolling back

The data and the code roll back separately:

1. **Data**: Storage → Datasets → `data` → Snapshots → roll back to the
   `pre-update-…` snapshot (or `zfs rollback <snapshot>`; the log prints the name).
2. **Code**: edit the app's YAML and change `:latest` to `:<previous commit sha>`
   (every build is also tagged with its commit), then save. Switch back to
   `:latest` once the fix is released.

Do both together if an update ran a database migration you need to undo.

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
