# Managed Cloud (MVP)

This guide is provider-agnostic. You can host the frontend statically, run the backend in a container service, and use managed Postgres.

## Architecture
- Frontend: static hosting (CDN + object storage or static site platform)
- Backend: container service (HTTP)
- Database: managed Postgres
- TLS: provider-managed or reverse proxy

## Required environment variables (backend)
- `DATABASE_URL`
- `JWT_SECRET`
- `APP_BASE_URL`
- `PORT` (default 3000)

## Release steps (every deploy)
1) Build backend image and deploy.
2) Run migrations (production-safe):
   ```bash
   npx prisma migrate deploy
   ```
3) Deploy frontend static assets.

## Health endpoint
- `GET /api/v1/health`
- Returns `{ "status": "ok" }`
- Use for uptime checks and smoke tests.

## Backups
- Use managed Postgres backups + scheduled exports.
- Maintain a retention policy (14-30 days recommended).

## Monitoring
- API health checks
- DB storage growth and CPU usage
- Error logs and latency thresholds

## Rollback
- Keep last known good backend image and frontend build.
- Roll back app first, then rollback DB only if absolutely required.
