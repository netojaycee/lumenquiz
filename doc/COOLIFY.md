# Deploying Apoquiz on Coolify

Apoquiz should run as one Coolify application. The Next frontend is statically
exported during the Docker build, copied into `apps/backend/public`, and served
by the Nest backend together with the API and Socket.IO gateway.

Leave the existing VPS/PM2 deployment in place. This file only describes the
Coolify deployment path.

## Application

- Type: Dockerfile
- Dockerfile: `Dockerfile`
- Exposed port: `3000`
- Health check path: `/api/health`
- Replicas: `1`

Do not create a separate frontend service for Coolify.

## Database

Use the existing PostgreSQL database connection string as `DATABASE_URL` if this
app is already running somewhere else and you are moving it to Coolify.

Only create a new Coolify PostgreSQL resource for a fresh deployment that does
not already have a database.

The container runs `pnpm exec prisma migrate deploy` on startup by default.
Set `RUN_MIGRATIONS=0` only if migrations are handled by a separate one-off job.

## Environment

```env
APP_MODE=cloud
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
PUBLIC_URL=https://quiz.example.com
SESSION_SECRET=<openssl rand -hex 32>
ADMIN_PASSWORD=<initial-admin-password>
MODERATOR_PIN=<moderator-pin>
SYNC_API_KEY=<openssl rand -hex 24>
```

Optional AI keys:

```env
GEMINI_API_KEY=
GROQ_API_KEY=
GROK_API_KEY=
```

Optional New Relic APM (the agent is a no-op without a license key):

```env
NEW_RELIC_LICENSE_KEY=<your-new-relic-license-key>
NEW_RELIC_APP_NAME=apoquiz
```

## Persistent Volumes

Persist these paths:

```text
/app/apps/backend/data
/app/apps/backend/uploads
```

`data` stores sessions, admin/moderator settings, sync settings, custom sound
configuration, and the bundled Bible JSON. `uploads` stores member avatars and
Ultimate Challenge audio uploads.
