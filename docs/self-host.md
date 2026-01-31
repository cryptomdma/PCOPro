# Self-Host (MVP)

This guide describes a production-ready, provider-agnostic self-host setup using Docker Compose on a Linux VPS.

## Recommended VPS
- 2 vCPU / 4 GB RAM minimum
- Ubuntu 22.04 LTS
- DigitalOcean recommended (provider-agnostic steps below)

## 1) DNS
- Create a DNS A record for your domain:
  - `app.example.com -> <VPS_PUBLIC_IP>`

## 2) Server prep
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

## 3) Clone repo
```bash
git clone <your_repo_url> pestledger
cd pestledger
```

## 4) Configure environment
```bash
cp .env.example .env
```
Update `.env` with your values:
- `APP_DOMAIN`
- `APP_BASE_URL`
- `JWT_SECRET`
- `POSTGRES_*`
- `DATABASE_URL`

## 5) Start production stack
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## 6) Run migrations (production-safe)
```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

## 7) Create the first admin (one-time)
```bash
docker compose -f docker-compose.prod.yml exec backend env \
  SETUP_ADMIN_TOKEN=your_one_time_token \
  SETUP_ADMIN_EMAIL=admin@yourdomain.com \
  SETUP_ADMIN_PASSWORD='strong-password' \
  npm run setup:admin
```
Notes:
- `SETUP_ADMIN_TOKEN` is required; the command will refuse to run without it.
- If `SETUP_ADMIN_PASSWORD` is omitted, a random password is generated and printed once.
- If an admin already exists, the command exits without changes.

## 8) Backups
```bash
export POSTGRES_CONTAINER=pestledger-db
export POSTGRES_USER=pco
export POSTGRES_DB=pco
./scripts/backup.sh
```

Retention: set `RETENTION_DAYS=14` to delete backups older than 14 days.

## 9) Restore
```bash
./scripts/restore.sh ./backups/pestledger_YYYYMMDD_HHMMSS.sql
```

## 10) Updates
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

## Notes
- TLS is handled by Caddy automatically.
- Do not run `prisma migrate dev` in production.
