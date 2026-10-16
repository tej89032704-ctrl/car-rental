# syntax=docker/dockerfile:1
###############################################################################
# CAR-ENT — one container, one origin.
#
# Render's free tier is a single web service, so the API and all five portals
# ship together and share one host. The API serves each portal's static build
# under its own path prefix — /renter /owner /admin /agent /manager — and keeps
# the JSON API under /api, so no two apps ever claim the same route. The routing
# lives in apps/api/src/serve-portals.ts, gated on NODE_ENV=production in
# apps/api/src/main.ts, which is why local development (a Vite server per portal
# on :5173-:5177) is completely unaffected by anything here.
###############################################################################

# ---- build -------------------------------------------------------------------
# The full node image, not -slim: it ships gcc/make/python, which better-sqlite3
# needs if its prebuilt binary is unavailable for this platform. That module is
# only ever used by a one-time migration script, but npm installs it either way.
FROM node:22 AS build
WORKDIR /app

# Dependency layer first, keyed on the lockfile alone, so editing source never
# re-downloads the world.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/renter-web/package.json apps/renter-web/
COPY apps/owner-web/package.json apps/owner-web/
COPY apps/admin-web/package.json apps/admin-web/
COPY apps/agent-web/package.json apps/agent-web/
COPY apps/manager-web/package.json apps/manager-web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# Compile the API (its build also copies the KYC trust anchors into dist/),
# then build each portal. PORTAL_BASE is the path prefix production serves that
# portal under; leaving it unset is byte-for-byte the local dev build, so this
# changes nothing about how the portals are written or run day to day.
COPY . .
RUN npm run build -w apps/api
RUN PORTAL_BASE=/renter/  npm run build -w apps/renter-web
RUN PORTAL_BASE=/owner/   npm run build -w apps/owner-web
RUN PORTAL_BASE=/admin/   npm run build -w apps/admin-web
RUN PORTAL_BASE=/agent/   npm run build -w apps/agent-web
RUN PORTAL_BASE=/manager/ npm run build -w apps/manager-web

# ---- production dependencies -------------------------------------------------
# The same lockfile, but only what the running process imports, resolved in the
# full image so the one native module is already built before it reaches the
# slim runtime.
FROM node:22 AS proddeps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/renter-web/package.json apps/renter-web/
COPY apps/owner-web/package.json apps/owner-web/
COPY apps/admin-web/package.json apps/admin-web/
COPY apps/agent-web/package.json apps/agent-web/
COPY apps/manager-web/package.json apps/manager-web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev

# ---- runtime -----------------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# What actually runs: production node_modules, the compiled API, its SQL
# migrations (read from disk at boot, so they ship as files), and the five built
# portals. Nothing else from the repo is needed.
COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/migrations ./apps/api/migrations
COPY --from=build /app/apps/renter-web/dist ./apps/renter-web/dist
COPY --from=build /app/apps/owner-web/dist ./apps/owner-web/dist
COPY --from=build /app/apps/admin-web/dist ./apps/admin-web/dist
COPY --from=build /app/apps/agent-web/dist ./apps/agent-web/dist
COPY --from=build /app/apps/manager-web/dist ./apps/manager-web/dist

# Owner photos and KYC documents land here. Render's free tier has an ephemeral
# filesystem, so these survive inside a running container but not a redeploy; a
# paid disk or object storage is the durable answer.
RUN mkdir -p /app/apps/api/uploads

# Render terminates TLS and forwards to the port it injects as $PORT (10000).
# main.js reads process.env.PORT, so this is only the fallback for `docker run`.
ENV PORT=10000
EXPOSE 10000

CMD ["node", "apps/api/dist/main.js"]
