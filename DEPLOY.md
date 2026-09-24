# Deploying Home Utilities Dashboard

One container, one port, one host-path volume. The volume holds everything:
the SQLite database, config, and every raw bill file under `inbox/`. Back it
up by snapshotting the dataset; nothing else has state.

## 1. Get the repo onto the NAS

The git working copy lives on a share on the NAS (the Mac pushes into it with
`git push nas main`). Any path works as long as the YAML's `build.context`
points at it. Docker builds the image there, so the NAS needs nothing besides
TrueNAS SCALE 24.10 or later.

## 2. Prepare the data directory

1. Create a dataset, e.g. `tank/apps/utilities-dashboard`.
2. The container runs as UID/GID **1001**. Give that user ownership of the dataset:
   ```bash
   chown -R 1001:1001 /mnt/tank/apps/utilities-dashboard
   ```
   (Or set the dataset's ACL owner to 1001 in the UI.)
3. Turn on periodic snapshots for the dataset. That is the entire backup plan;
   the app never writes outside `/data`.

## 3. Install the YAML app (builds from the repo on the NAS)

If the repo checkout lives on the NAS (it does: the share holds the git working
copy), skip images and registries entirely. Paste `deploy/truenas-app.yaml`
into Apps → Discover Apps → **Install via YAML**, after replacing the two
`<POOL>/<SHARE>` paths and `AUTH_SECRET`. TrueNAS builds the image from that
folder and runs it.

Release flow from then on:

1. Get the new commits into the folder. From the Mac, `git push nas main`
   updates the NAS working copy directly (the NAS repo has
   `receive.denyCurrentBranch=updateInstead`). Or `git pull` on the NAS from
   wherever you host the repo.
2. Press **Update** (or Redeploy) on the app. `pull_policy: build` makes it
   rebuild from the folder; migrations run on start; the volume is untouched.

To script step 2, run `deploy/update.sh` on the NAS: it builds the image and
calls `midclt call app.redeploy home-utilities`. Chain both steps from the Mac:

```bash
git push nas main && ssh root@nas 'sh "/mnt/<POOL>/<SHARE>/BRJ Labs/Home Utilities Software (Prototype-1)/deploy/update.sh"'
```

If your TrueNAS version rejects `build:` in YAML apps, keep the YAML but delete
the `build`/`pull_policy` lines and run `deploy/update.sh` for each release;
it produces the `brjlabs/home-utilities:local` tag the YAML references.

## 4. Wall display (iPad)

Open `http://<nas-ip>:30080/wall` in Safari, log in once (the session lasts
`AUTH_SESSION_DAYS`, default 30), then Share → Add to Home Screen and open it
from there for a full-screen kiosk. Use Guided Access to lock it. The page
refreshes itself every minute.

Phones: open the app in the browser and Add to Home Screen; it installs as an
app with an icon and keeps the last-loaded pages available offline.

## 5. Updating

Push the new commits into the folder (`git push nas main` from the Mac) and
press **Update** on the app, or run `deploy/update.sh` on the NAS. Migrations
apply on first start; the volume is untouched. Snapshot the dataset first for a
one-click rollback.

## 6. Where things live on the volume

```
/data/db/utilities.sqlite   the database (WAL files beside it)
/data/inbox/YYYY/MM/…       raw emails, PDFs and uploads, never deleted
/data/config/imap-state.json  last processed mailbox UID
```

Exports: Ledger → "Download statement" gives a per-member CSV; the owner can
also download every bill from the same endpoint (`/api/export?kind=bills`).

## 7. Security notes

The app is meant for a LAN. It has no HTTPS of its own and PIN login is
household-grade. For remote access, put it behind Tailscale or a reverse proxy
with TLS rather than exposing the port to the internet.
