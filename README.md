# Home Utilities Dashboard — Prototype 1

Self-hosted household utilities dashboard by BRJ Labs. Bills from a dedicated
mailbox are ingested automatically, totalled per service, split between
housemates, tracked for payment, and projected forward. Runs as a single Docker
container with all data on one mounted directory.

See [SCOPE.md](SCOPE.md) for goals and architecture and [CLAUDE.md](CLAUDE.md)
for engineering conventions.

## Local development

Requires Node 22 (`brew install node@22`).

```bash
cp .env.example .env      # then set AUTH_SECRET (openssl rand -base64 48)
npm install
npm run dev               # http://localhost:3000 — migrations run on start
```

On first visit the app runs a setup wizard (household name, region, shared or single
household, owner PIN). To load the real sample invoices afterwards:

```bash
npm run db:seed
```

For a fictional demo household instead, set `DEMO_MODE=true` in `.env` before first
start, or run `npm run db:seed:demo` on an empty database.

Checks: `npm run check` (lint + typecheck + tests).

## Deployment

The app runs as a TrueNAS SCALE YAML app that builds from the repo folder on
the NAS; pushing commits into that folder and pressing Update releases a new
version. See [DEPLOY.md](DEPLOY.md) and `deploy/`.
