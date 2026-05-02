# Docker integration

This project includes a Postgres database and a Next.js `web` service defined in `docker-compose.yml`.

Quick overview
- `postgres` service: runs Postgres 15 (image: `postgres:15-alpine`). Environment vars are defined in `docker-compose.yml` (defaults: `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=ticketing`).
- `web` service: builds the Next.js app using the provided `Dockerfile`. It reads environment variables from `.env.local` (via `env_file`).

Start services

- Start only Postgres (recommended while developing migrations):
```bash
docker-compose up -d postgres
```
- Start the web and DB together (rebuild web):
```bash
docker-compose up --build
```
- Stop and remove containers and volumes:
```bash
docker-compose down -v
```

Environment (.env.local)

The `web` container loads `.env.local`. Use different DB host values depending on where Next.js runs:

- If you run Next.js on your host (local development), use `localhost`:

```
dolf7_project_db_PRISMA_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ticketing?schema=public"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ticketing?schema=public"
```

- If you run Next.js inside Docker (the `web` service), the DB host must be the service name `postgres`:

```
dolf7_project_db_PRISMA_DATABASE_URL="postgresql://postgres:postgres@postgres:5432/ticketing?schema=public"
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/ticketing?schema=public"
```

PS: `prisma.config.ts` in this repo reads `dolf7_project_db_PRISMA_DATABASE_URL`. The runtime Prisma client falls back to `DATABASE_URL`.

Using `psql` inside the container

- Open an interactive shell as the `postgres` user (avoids root permission errors):
```bash
docker-compose exec -u postgres postgres psql -U postgres -d ticketing
```
- Run a single SQL command without an interactive shell:
```bash
docker-compose exec -u postgres postgres psql -U postgres -d ticketing -c "SELECT * FROM ticket;"
```

Notes about migrations in Docker

- The `Dockerfile` runtime image runs `npx prisma migrate deploy && npm start` on container start. That command applies already-generated migrations (the files in `prisma/migrations`).
- For development you typically run `prisma migrate dev` on your host to create migration files and get an interactive schema preview. After migration files are committed, the Docker runtime can run `prisma migrate deploy`.
- If `prisma migrate deploy` runs too early (DB not ready), the container may exit with an error. In CI or production, use a retry/wait strategy or run migrations separately before starting the app.

Troubleshooting

- Authentication failed (P1000): check the credentials in `.env.local` and `docker-compose.yml` (default user/password: `postgres`/`postgres`).
- Connection refused: ensure Postgres is running (`docker-compose ps`) and ports are not already in use on `localhost:5432`.

Useful commands

```bash
docker-compose ps
docker-compose logs -f postgres
docker-compose exec -u postgres postgres psql -U postgres -d ticketing
npx prisma studio    # open Prisma Studio (requires correct env vars)
```
