# Deploying Home Utilities Dashboard

One container, one port, one host-path volume. The volume holds everything:
the SQLite database, config, and every raw bill file under `inbox/`. Back it
up by snapshotting the dataset; nothing else has state.

## 1. Build the image

On any machine with Docker (the NAS itself works):

```bash
git clone <your repo> home-utilities && cd home-utilities
docker build -t brjlabs/home-utilities:0.4.0 .
```

Push it to a registry the NAS can pull from, or build directly on the NAS with
`docker build` and reference the local tag.

## 2. Prepare the data directory on TrueNAS Scale

1. Create a dataset, e.g. `tank/apps/utilities-dashboard`.
2. The container runs as UID/GID **1001**. Give that user ownership of the dataset:
   ```bash
   chown -R 1001:1001 /mnt/tank/apps/utilities-dashboard
   ```
   (Or set the dataset's ACL owner to 1001 in the UI.)
3. Turn on periodic snapshots for the dataset. That is the entire backup plan;
   the app never writes outside `/data`.

## 3. Create the custom app

Apps → Discover Apps → Custom App:

| Field | Value |
|---|---|
| Image repository / tag | `brjlabs/home-utilities` / `0.4.0` (or your registry path) |
| Port | container `3000` → node port of your choice, e.g. `30080` |
| Host path volume | host `/mnt/tank/apps/utilities-dashboard` → mount `/data` |
| Restart policy | Always |

Environment variables (Container → Environment):

| Variable | Required | Notes |
|---|---|---|
| `DATA_DIR` | yes | `/data` |
| `AUTH_SECRET` | yes | ≥32 random chars: `openssl rand -base64 48` |
| `DEFAULT_CURRENCY`, `DEFAULT_LOCALE`, `DEFAULT_TIMEZONE`, `DEFAULT_FISCAL_YEAR_START_MONTH` | no | Wizard defaults; e.g. `AUD`, `en-AU`, `Australia/Melbourne`, `7` |
| `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_MAILBOX`, `IMAP_POLL_INTERVAL_SECONDS` | for email ingestion | Gmail: `imap.gmail.com`, `993`, an app password. `0` disables polling. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | for AI extraction | Without a key, unknown providers go to the review queue. |
| `EXTRACTOR_CONFIDENCE_THRESHOLD` | no | Default `0.85` |
| `DEMO_MODE` | no | `true` seeds a fictional household on an empty volume |

Deploy, then open `http://<nas-ip>:30080`. The first visit runs the setup
wizard. Migrations run automatically on every start.

The image has a health check on `/api/health`; TrueNAS shows it under the app's
status. The same endpoint reports whether the mailbox and AI key are configured.

## 4. Plain Docker Compose (any host)

```yaml
services:
  app:
    image: brjlabs/home-utilities:0.4.0
    restart: unless-stopped
    ports: ['30080:3000']
    env_file: .env          # DATA_DIR=/data plus the variables above
    volumes: ['/srv/utilities-dashboard:/data']
```

## 5. Wall display (iPad)

Open `http://<nas-ip>:30080/wall` in Safari, log in once (the session lasts
`AUTH_SESSION_DAYS`, default 30), then Share → Add to Home Screen and open it
from there for a full-screen kiosk. Use Guided Access to lock it. The page
refreshes itself every minute.

Phones: open the app in the browser and Add to Home Screen; it installs as an
app with an icon and keeps the last-loaded pages available offline.

## 6. Updating

Build the new tag, change the tag in the app's settings, and redeploy. The
volume is untouched; pending migrations apply on first start. Take a snapshot
first if you want a one-click rollback.

## 7. Where things live on the volume

```
/data/db/utilities.sqlite   the database (WAL files beside it)
/data/inbox/YYYY/MM/…       raw emails, PDFs and uploads, never deleted
/data/config/imap-state.json  last processed mailbox UID
```

Exports: Ledger → "Download statement" gives a per-member CSV; the owner can
also download every bill from the same endpoint (`/api/export?kind=bills`).

## 8. Security notes

The app is meant for a LAN. It has no HTTPS of its own and PIN login is
household-grade. For remote access, put it behind Tailscale or a reverse proxy
with TLS rather than exposing the port to the internet.
