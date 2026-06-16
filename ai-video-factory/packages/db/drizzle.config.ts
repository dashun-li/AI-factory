import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? 'aifactory',
    password: process.env.POSTGRES_PASSWORD ?? 'aifactory_dev',
    database: process.env.POSTGRES_DB ?? 'ai_video_factory',
  },
});
