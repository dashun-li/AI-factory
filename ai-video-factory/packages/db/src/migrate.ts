import { sql } from 'drizzle-orm';
import { createDb } from '../index';

/**
 * Run database migrations.
 * In production, use `drizzle-kit push` or `drizzle-kit migrate` instead.
 */
export async function runMigrations(config: Parameters<typeof createDb>[0]) {
  const { db, pool } = createDb(config);

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "drizzle_migrations" (
        "id" serial PRIMARY KEY,
        "hash" varchar(64) NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      );
    `);

    console.log('Migrations completed successfully');
  } finally {
    await pool.end();
  }
}
