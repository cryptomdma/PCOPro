# Security Checklist

- [ ] RBAC enforced server-side per route; roles: Admin, InventoryManager, Technician.
- [ ] JWT access + refresh tokens; short-lived access; refresh rotation and revocation list.
- [ ] Idempotency keys required for all mutations; duplicate submissions handled safely.
- [ ] Input validation via DTOs and class-validator; sanitization to prevent injection.
- [ ] Prisma least-privilege DB user; prepared statements.
- [ ] Audit logging for auth events and ledger writes (who/when/device/ip).
- [ ] HTTPS enforcement and secure cookies for refresh token in web builds.
- [ ] Rate limiting + brute-force protection on login and key mutation endpoints.
- [ ] SMTP creds stored in environment variables; test endpoint locked to Admin.
- [ ] CORS configured for allowed origins; CSRF mitigated via SameSite or token double-submit if cookies used.
- [ ] Service worker caches only public assets; IndexedDB encryption for tokens optional via WebCrypto.
- [ ] Backup/restore plan for Postgres; migrations versioned via Prisma.
