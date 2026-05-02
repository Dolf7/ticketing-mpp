# Database migrations (Prisma)

This project uses Prisma for schema definition and migrations. Key files:

- `prisma/schema.prisma` — your database schema.
- `prisma.config.ts` — custom Prisma config (reads `dolf7_project_db_PRISMA_DATABASE_URL`).
- `services/db/prisma.ts` — runtime Prisma client (falls back to `DATABASE_URL`).

Quick commands

- Install deps and generate client:
```bash
npm ci
npm run prisma:generate
```
- Create a development migration and apply it (interactive):
```bash
npm run prisma:migrate:dev
```
- Apply already-created migrations (non-creative; use in CI/production):
```bash
npm run prisma:migrate:deploy
```
- Reset the database (destructive — drops all data):
```bash
npx prisma migrate reset
```

Environment variables

- `prisma.config.ts` expects `dolf7_project_db_PRISMA_DATABASE_URL`; many Prisma CLI commands also read `DATABASE_URL`. Set both in `.env.local` for consistency.

Examples (`.env.local`)

- Host dev (Next.js running on your machine; Postgres on Docker mapped to localhost):
```
dolf7_project_db_PRISMA_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ticketing?schema=public"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ticketing?schema=public"
```

- Containerized web (Next.js running in `web` container):
```
dolf7_project_db_PRISMA_DATABASE_URL="postgresql://postgres:postgres@postgres:5432/ticketing?schema=public"
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/ticketing?schema=public"
```

Best practices

- During development, use `prisma migrate dev` to create migration files and test schema changes locally. Commit the generated migration files under `prisma/migrations`.
- In production or CI, use `prisma migrate deploy` to apply committed migrations.
- Avoid running `prisma migrate dev` in production — it can modify the schema interactively.

Verify and inspect data

- Open Prisma Studio (web UI):
```bash
npx prisma studio
```

Troubleshooting

- P1000 (authentication failed): verify the connection string credentials and host (`localhost` vs `postgres`) depending on where the app is running.
- Migration fails because DB is not ready: ensure Postgres container is healthy and reachable before running `prisma migrate deploy` (use `docker-compose logs postgres` to check). Consider running migrations from the host during development.
