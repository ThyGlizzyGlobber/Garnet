#!/bin/sh
# Rebuild + redeploy on the NAS. Run from anywhere on the NAS as root:
#   sh "/mnt/<POOL>/<SHARE>/BRJ Labs/Home Utilities Software (Prototype-1)/deploy/update.sh"
#
# What it does:
#   1. builds brjlabs/home-utilities:local from the checkout this script lives in
#   2. asks TrueNAS to redeploy the app so it picks up the new image
# The YAML app's Update button does the same rebuild; this script is for
# scripting it (cron, a post-receive hook, or an SSH one-liner from the Mac).
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${APP_NAME:-home-utilities}"
cd "$REPO"
echo "Building from $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
docker build -t brjlabs/home-utilities:local .
if command -v midclt >/dev/null 2>&1; then
  echo "Redeploying app '$APP_NAME'"
  midclt call app.redeploy "$APP_NAME" >/dev/null && echo "Done. Health: curl http://localhost:30080/api/health"
else
  echo "midclt not found; press Update on the app in the TrueNAS UI."
fi
