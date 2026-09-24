FROM node:lts-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG GIT_HASH=unknown
ENV GIT_HASH=$GIT_HASH NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN pnpm build

FROM node:lts-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends 7zip && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8484 HOSTNAME=0.0.0.0 DATA_DIR=/data SEVEN_ZIP_PATH=/usr/bin/7zz
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
VOLUME /data
EXPOSE 8484
CMD ["node", "server.js"]
