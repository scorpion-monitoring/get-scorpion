# syntax=docker/dockerfile:1
# The landing page image (docs/plan.md §9). Build from the repository root:
#   docker build -f docker/Dockerfile -t get-scorpion .                    # web (default)
#   docker build -f docker/Dockerfile --target events -t get-scorpion-events .
# Targets:
#   web     nginx serving dist/ as a non-root user on 8080; read-only root filesystem, needs /tmp writable
#   events  the events fetcher sidecar (scripts/fetch-events.mjs, §4), fills the /srv/events volume
# Base images are pinned by tag and digest; Dependabot (docker, /docker) moves both together.

FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS node

FROM node AS build
WORKDIR /src
# Corepack is no longer shipped with Node 26; pnpm's version is the one in package.json's packageManager.
RUN npm install --global --ignore-scripts pnpm@12.21.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Fetches the pinned docs export (scorpion-release.json, §3), builds and runs check-dist.mjs.
RUN pnpm build

FROM node AS events
WORKDIR /app
# src/lib/events.ts imports nothing; Node strips its types, as for scripts/build-events.mjs.
COPY scripts/fetch-events.mjs scripts/
COPY src/lib/events.ts src/lib/
USER node
ENTRYPOINT ["node", "scripts/fetch-events.mjs"]
CMD ["--dir", "/srv/events"]

FROM nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03 AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
