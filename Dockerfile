FROM node:24-bookworm-slim AS build

WORKDIR /app

ENV CI=1
ENV APP_MODE=cloud

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@9.15.9 --activate

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/socket-events/package.json packages/socket-events/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json

# --prod=false forces devDependencies (tsc, next, nest) to install even when
# NODE_ENV=production is set in the build environment. The runtime stage below
# installs prod-only dependencies separately.
RUN pnpm install --frozen-lockfile --prod=false

COPY . .

# Prisma 7 requires DATABASE_URL to be present while generating the client.
# This build-time placeholder is not used at runtime and does not create or
# connect to a database.
RUN DATABASE_URL=postgresql://apoquiz:apoquiz@localhost:5432/apoquiz bash scripts/build-web.sh

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV APP_MODE=cloud
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl curl wget \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@9.15.9 --activate \
  && groupadd -r apoquiz --gid 1001 \
  && useradd -r -g apoquiz -d /app -s /bin/sh --uid 1001 apoquiz \
  && chown apoquiz:apoquiz /app

COPY --chown=apoquiz:apoquiz .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=apoquiz:apoquiz apps/backend/package.json apps/backend/package.json
COPY --chown=apoquiz:apoquiz packages/shared-types/package.json packages/shared-types/package.json
COPY --chown=apoquiz:apoquiz packages/socket-events/package.json packages/socket-events/package.json
COPY --chown=apoquiz:apoquiz packages/game-engine/package.json packages/game-engine/package.json

USER apoquiz

RUN pnpm install --prod --frozen-lockfile --filter=@apoquiz/backend...

COPY --from=build --chown=apoquiz:apoquiz /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build --chown=apoquiz:apoquiz /app/packages/socket-events/dist packages/socket-events/dist
COPY --from=build --chown=apoquiz:apoquiz /app/packages/game-engine/dist packages/game-engine/dist
COPY --from=build --chown=apoquiz:apoquiz /app/apps/backend/dist apps/backend/dist
COPY --from=build --chown=apoquiz:apoquiz /app/apps/backend/public apps/backend/public
COPY --from=build --chown=apoquiz:apoquiz /app/apps/backend/prisma apps/backend/prisma
COPY --from=build --chown=apoquiz:apoquiz /app/apps/backend/prisma-pg apps/backend/prisma-pg
COPY --from=build --chown=apoquiz:apoquiz /app/apps/backend/prisma.config.ts apps/backend/prisma.config.ts

# New Relic agent config — a source file (not a build artifact), so copy from
# the build context. Sits next to the running app; the agent auto-discovers it
# from the WORKDIR below.
COPY --chown=apoquiz:apoquiz apps/backend/newrelic.cjs apps/backend/newrelic.cjs

# Prisma 7 requires DATABASE_URL to be present while generating the client.
# This build-time placeholder is not used at runtime and does not create or
# connect to a database.
RUN cd apps/backend \
  && DATABASE_URL=postgresql://apoquiz:apoquiz@localhost:5432/apoquiz pnpm exec prisma generate

COPY --from=build --chown=apoquiz:apoquiz /app/apps/backend/data seed-data
COPY --chown=apoquiz:apoquiz docker-entrypoint.sh docker-entrypoint.sh

RUN mkdir -p apps/backend/data apps/backend/uploads

WORKDIR /app/apps/backend

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# -r newrelic preloads the APM agent before any app code (incl. reflect-metadata).
CMD ["node", "-r", "newrelic", "dist/main.js"]
