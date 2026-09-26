# syntax=docker/dockerfile:1
# Single-container image for the Home Utilities Dashboard.
# Debian slim (not Alpine) so better-sqlite3 uses its prebuilt glibc binary.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 has no prebuilt binary for every Node/arch pair (e.g. arm64),
# so the deps stage carries a compiler. The runtime stage stays slim.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data
# Unprivileged user; /data is the single host-path volume (DB, config, inbox/).
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m app \
    && mkdir -p /data && chown app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
# pdf.js loads its worker and canvas polyfill dynamically, which Next's file
# tracing cannot see, so copy those packages whole from the deps stage.
COPY --from=deps --chown=app:app /app/node_modules/@napi-rs ./node_modules/@napi-rs
COPY --from=deps --chown=app:app /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist
COPY --from=deps --chown=app:app /app/node_modules/pdf-parse ./node_modules/pdf-parse
# Stamped by the release workflow; Settings → Software update compares it with GitHub.
# Declared last so a new commit doesn't invalidate the layers above.
ARG APP_COMMIT=dev
ARG APP_BUILT_AT=
ENV APP_COMMIT=$APP_COMMIT \
    APP_BUILT_AT=$APP_BUILT_AT
USER app
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
