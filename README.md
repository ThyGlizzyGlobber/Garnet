# Home Utilities Dashboard — Prototype 1

Self-hosted household bills dashboard by BRJ Labs. Households forward their bills
to their own bills address (or upload them); an AI reader turns each one into a
bill, which is totalled per service, split between housemates, tracked for
payment, and projected forward. Runs as a single Docker container with all data
on one mounted directory.

See [SCOPE.md](SCOPE.md) for goals and architecture, [BRAND.md](BRAND.md) for the
look, and [CLAUDE.md](CLAUDE.md) for engineering conventions and the decisions log.

## Local development

Requires Node 22.12 or later (`brew install node@22`).

```bash
cp .env.example .env      # then set AUTH_SECRET (openssl rand -base64 48)
npm install
npm run dev               # http://localhost:3000 — migrations run on start
```

Sign in with an emailed code: without a Resend key (or with `EMAIL_LOG_ONLY=true`)
the code is printed in the server log as `[email:dev]`. Choose **Create a
household**, go through the setup wizard (household, region, your details), then
set your PIN.

For a fictional household to click around in, set `DEMO_MODE=true` in `.env`
before the first start, or run `npm run db:seed:demo` on an empty database, and
use **Try the demo household** on the sign-in page.

Checks: `npm run check` (lint, types, formatting, dead code, tests). It runs on
every push and must pass before a commit.

## Deployment

Every push to `main` is checked and built by GitHub Actions into
`ghcr.io/thyglizzyglobber/home-utilities`; the NAS installs it from
Settings → Software update (`deploy/nas-updater.sh`). See [DEPLOY.md](DEPLOY.md).
