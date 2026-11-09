import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the real environment, as in CI and production.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // `prisma generate` runs on install, before any database exists, so an empty URL must not throw.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
