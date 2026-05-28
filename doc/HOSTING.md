# HOSTING.md — Deploying Apoquiz to Ubuntu (Internet Play)

> This guide covers deploying apoquiz on a Ubuntu 22.04 VPS for internet play.
> The same codebase supports both local LAN mode and cloud internet mode —
> the difference is environment variables and a PostgreSQL database.

---

## Minimum Server Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| RAM | 512 MB | 1 GB |
| CPU | 1 vCPU | 1–2 vCPU |
| Disk | 10 GB | 20 GB |
| Network | 100 Mbps | 100 Mbps |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Node | 20+ | 22+ |

**Estimated monthly cost:** $4–6/mo on Hetzner (CAX11), DigitalOcean ($6 Droplet), or Vultr.

For a typical session (4 teams, 2 moderators, 100+ audience):
- RAM usage: ~300–450 MB
- Peak bandwidth: ~1–2 MB/s during busy emoji moments
- CPU: comfortably within 1 vCPU (Node.js is single-threaded per event loop)

---

## Step 1 — Provision the VPS

1. Create an Ubuntu 22.04 LTS instance at your preferred provider.
2. Add an SSH key during provisioning (or set a root password).
3. Point your domain's A record at the server IP. Wait for DNS to propagate.

```
quiz.yourdomain.com  →  <your_server_ip>
```

---

## Step 2 — Initial Server Setup

```bash
# SSH in
ssh root@<your_server_ip>

# Update system
apt update && apt upgrade -y

# Create a non-root user
adduser apoquiz
usermod -aG sudo apoquiz

# Switch to the new user for the rest of setup
su - apoquiz
```

---

## Step 3 — Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # should be v22.x
npm -v
```

---

## Step 4 — Install pnpm

```bash
npm install -g pnpm
```

---

## Step 5 — Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib

# Start and enable
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create a database and user
sudo -u postgres psql <<EOF
CREATE USER apoquiz WITH PASSWORD 'choose_a_strong_password';
CREATE DATABASE apoquiz OWNER apoquiz;
GRANT ALL PRIVILEGES ON DATABASE apoquiz TO apoquiz;
EOF
```

Your `DATABASE_URL` will be:
```
postgresql://apoquiz:choose_a_strong_password@localhost:5432/apoquiz
```

---

## Step 6 — Install Nginx and Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Enable and start nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## Step 7 — Clone the Repository

```bash
cd ~
git clone https://github.com/afmdevelopers/apoquiz.git
cd apoquiz
```

---

## Step 8 — Configure Environment

```bash
# Copy and edit the env file
cp .env.example apps/backend/.env
nano apps/backend/.env
```

Fill in the following values (delete or leave blank anything not needed):

```env
PORT=3002
NODE_ENV=production

# PostgreSQL
DATABASE_URL=postgresql://apoquiz:choose_a_strong_password@localhost:5432/apoquiz

# Public URL — your domain (with https)
PUBLIC_URL=https://quiz.yourdomain.com

# Session secret — generate with: openssl rand -hex 32
SESSION_SECRET=<your_random_secret>

# Admin and moderator credentials (can be changed later in Settings)
ADMIN_PASSWORD=your_secure_admin_password
MODERATOR_PIN=1234

# Sync API key — used by local instances to push quiz data to this server
# Generate with: openssl rand -hex 24
SYNC_API_KEY=<your_sync_api_key>
```

---

## Step 9 — Install Dependencies and Build

```bash
# From project root
pnpm install

# Build all packages
pnpm build

# Run Prisma migrations against PostgreSQL
cd apps/backend
pnpm exec prisma migrate deploy
pnpm exec prisma generate
cd ../..
```

---

## Step 10 — Configure Nginx

```bash
# Copy the sample nginx config
sudo cp nginx/apoquiz.conf /etc/nginx/sites-available/apoquiz

# Edit and replace quiz.yourdomain.com with your domain
sudo nano /etc/nginx/sites-available/apoquiz

# Enable the site
sudo ln -s /etc/nginx/sites-available/apoquiz /etc/nginx/sites-enabled/

# Remove the default site (optional but clean)
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

---

## Step 11 — Obtain SSL Certificate

```bash
sudo certbot --nginx -d quiz.yourdomain.com
```

Certbot will:
1. Verify domain ownership via HTTP challenge
2. Issue a Let's Encrypt certificate
3. Automatically edit your nginx config to include SSL paths
4. Set up auto-renewal (cron/systemd timer)

Test auto-renewal works:
```bash
sudo certbot renew --dry-run
```

---

## Step 12 — Run the Backend with PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the NestJS backend
pm2 start apps/backend/dist/main.js \
  --name apoquiz \
  --env production \
  --env-file apps/backend/.env

# Save the process list so it restarts on reboot
pm2 save
pm2 startup   # follow the printed command to enable boot startup
```

Check it's running:
```bash
pm2 status
pm2 logs apoquiz --lines 50
```

---

## Step 13 — Verify Everything Works

```bash
# Should return network info JSON
curl https://quiz.yourdomain.com/api/network/info

# Visit in browser
open https://quiz.yourdomain.com/host
```

Login with your `ADMIN_PASSWORD`. Create a quiz. Have participants open `https://quiz.yourdomain.com/join`.

---

## Deploying Updates

```bash
cd ~/apoquiz
git pull

pnpm install
pnpm build

# Run any new migrations
cd apps/backend
pnpm exec prisma migrate deploy
cd ../..

# Restart the backend
pm2 restart apoquiz
```

---

## Sync: Local → Cloud

After a local quiz session ends, you can sync the full quiz and results to the cloud:

**On the local machine, set in Settings → Cloud Sync:**
- Cloud Server URL: `https://quiz.yourdomain.com`
- Sync API Key: same value as `SYNC_API_KEY` in the cloud `.env`

Then click **Sync to Cloud** from the Quiz Overview or the Moderator panel at session end.

The cloud instance stores the full session history. Quizzes can be viewed at
`https://quiz.yourdomain.com/host/results/<sessionId>`.

---

## Firewall Setup (recommended)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # ports 80 + 443
sudo ufw enable
sudo ufw status
```

Do **not** expose port 3002 publicly — Nginx handles all traffic.

---

## Performance Under Internet Conditions

| Network | Latency | Impact |
|---|---|---|
| 5G / WiFi 6 | 10–30ms | Virtually identical to LAN |
| 4G LTE (good) | 30–80ms | Unnoticeable for quiz play |
| 4G LTE (weak) | 80–200ms | Timer displays lag slightly; scoring impact < 0.1pt on 30s question |
| 3G / poor data | 200–500ms | Emoji reactions delayed; answer submission deadline still fair (server-side) |
| Disconnection | — | Reconnection restores full state automatically (< 5s typically) |

**Audience of 100+:** The server handles ~100 WebSocket connections with ease on a 1 vCPU / 1 GB instance. The main load spike is emoji reactions — server-side rate limiting (1.5s per user) caps the broadcast rate at ~67 events/second total across all audience members, well within Node.js capacity.

**What doesn't change over internet:** Game fairness. All timestamps are server-side. The timer system (`startTime + durationMs` sent by server, computed locally by clients) means clients on different latencies all see the same remaining time — their submissions are judged by when they arrive at the server, not when the client thought it submitted.

---

## Logs and Monitoring

```bash
# Live logs
pm2 logs apoquiz

# Nginx access/error logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# PostgreSQL slow query log (optional, edit /etc/postgresql/14/main/postgresql.conf)
# log_min_duration_statement = 500
```

---

## Backup PostgreSQL

```bash
# One-off dump
pg_dump -U apoquiz apoquiz > backup_$(date +%Y%m%d).sql

# Restore
psql -U apoquiz apoquiz < backup_20260525.sql
```

For automated daily backups, add a cron job:
```bash
crontab -e
# Add:
0 2 * * * pg_dump -U apoquiz apoquiz | gzip > ~/backups/apoquiz_$(date +\%Y\%m\%d).sql.gz
```

---

## Troubleshooting

**"502 Bad Gateway"**
- Backend isn't running: `pm2 status`, `pm2 logs apoquiz`
- Port mismatch: confirm `PORT=3002` in `.env` and nginx proxies to `127.0.0.1:3002`

**"WebSocket connection failed"**
- Nginx must include `Upgrade` and `Connection` headers (already in `apoquiz.conf`)
- Check that `proxy_read_timeout` is set to a large value (86400s in the config)

**"CORS error"**
- `PUBLIC_URL` must exactly match your domain including `https://`
- Ensure no trailing slash in `PUBLIC_URL`

**Cookie/session not persisting after login**
- `SESSION_SECRET` must be set (non-default)
- `NODE_ENV=production` must be set
- Nginx must forward `X-Forwarded-Proto: https` (it does, per the config)

**Prisma migration fails**
- `DATABASE_URL` must be set correctly
- PostgreSQL user must have `CREATE` privileges on the database
- Run `pnpm exec prisma migrate deploy` from `apps/backend/`
