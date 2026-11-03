FROM node:lts-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN npm install -g pnpm@12
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
ARG GIT_HASH=unknown
ENV GIT_HASH=$GIT_HASH NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1

FROM build AS build-web
RUN pnpm build

FROM build AS build-scraper
RUN pnpm build:scraper

FROM build AS build-compactor
RUN pnpm build:compactor

FROM base AS prod-deps
RUN pnpm install --prod --frozen-lockfile

FROM node:lts-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends 7zip && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production DATA_DIR=/data SEVEN_ZIP_PATH=/usr/bin/7zz
VOLUME /data

FROM runtime AS scraper
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/hermes-dec && /opt/hermes-dec/bin/pip install --no-cache-dir hermes-dec==0.1.8
ENV HERMES_DECOMPILER_PATH=/opt/hermes-dec/bin/hbc-decompiler
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build-scraper /app/dist/scraper.mjs ./
CMD ["node", "scraper.mjs"]

FROM runtime AS compactor
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build-compactor /app/dist/compactor.mjs ./
CMD ["node", "compactor.mjs"]

FROM runtime AS web
ENV NEXT_TELEMETRY_DISABLED=1 PORT=8484 HOSTNAME=0.0.0.0
COPY --from=build-web /app/.next/standalone ./
COPY --from=build-web /app/.next/static ./.next/static
COPY --from=build-web /app/public ./public
EXPOSE 8484
CMD ["node", "server.js"]
