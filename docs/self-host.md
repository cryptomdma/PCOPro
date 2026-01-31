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

## 7) Backups
```bash
export POSTGRES_CONTAINER=pestledger-db
export POSTGRES_USER=pco
export POSTGRES_DB=pco
./scripts/backup.sh
```

Retention: set `RETENTION_DAYS=14` to delete backups older than 14 days.

## 8) Restore
```bash
./scripts/restore.sh ./backups/pestledger_YYYYMMDD_HHMMSS.sql
```

## 9) Updates
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

## Notes
- TLS is handled by Caddy automatically.
- Do not run `prisma migrate dev` in production.
