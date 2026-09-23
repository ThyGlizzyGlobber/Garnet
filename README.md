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

Checks: `npm run check` (lint + typecheck + tests).

## Docker

```bash
docker compose up --build   # data persists in ./data
```

Deployment on TrueNAS Scale is documented in `DEPLOY.md` (Phase 4).
