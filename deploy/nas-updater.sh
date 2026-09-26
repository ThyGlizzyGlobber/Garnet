#!/bin/sh
# Applies updates requested from Settings → Software update.
#
# Runs on the TrueNAS host as root, every minute, from a cron job
# (System → Advanced Settings → Cron Jobs). Keep this file OUTSIDE the data
# dataset: the container can write to the data dataset, and root runs this.
#
# When DATA/config/update-request.json exists it:
#   1. deletes the request (so a failing update isn't retried every minute),
#   2. snapshots the data dataset (roll back here if an update goes wrong),
#   3. pulls the app's images and redeploys it,
#   4. keeps the newest $KEEP pre-update snapshots and destroys older ones.
# The request's contents are never read; only its presence matters.
set -u
PATH=/usr/sbin:/usr/bin:/sbin:/bin

APP_NAME="${APP_NAME:-home-utilities}"
DATASET="${DATASET:-SSD/home-utilities/data}"
KEEP="${KEEP:-10}"
LOG="${LOG:-$(dirname "$0")/update.log}"
REQUEST="/mnt/$DATASET/config/update-request.json"

[ -e "$REQUEST" ] || [ -L "$REQUEST" ] || exit 0
rm -f "$REQUEST"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG"; }
log "update requested for $APP_NAME"

SNAP="$DATASET@pre-update-$(date -u +%Y%m%d-%H%M%S)"
if zfs snapshot "$SNAP"; then
  log "snapshot $SNAP"
else
  log "snapshot failed; not updating"
  exit 1
fi

if midclt call -j app.pull_images "$APP_NAME" '{"redeploy": true}' >> "$LOG" 2>&1; then
  log "pulled and redeployed"
else
  log "update FAILED (output above); roll back with: zfs rollback $SNAP"
fi

zfs list -H -t snapshot -o name -s creation -d 1 "$DATASET" \
  | grep "@pre-update-" \
  | awk -v keep="$KEEP" '{ s[NR] = $0 } END { for (i = 1; i <= NR - keep; i++) print s[i] }' \
  | while read -r old; do zfs destroy "$old" && log "pruned $old"; done
exit 0
