import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Use the custom env var you provided for the connection string
    url: env('dolf7_project_db_PRISMA_DATABASE_URL'),
  },
});
