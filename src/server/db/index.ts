import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema';

const path = resolve(process.env.DATABASE_PATH ?? 'data/roomplanner.db');
mkdirSync(dirname(path), { recursive: true });

const client = createClient({ url: `file:${path}` });
export const db = drizzle(client, { schema });
export { schema };

export async function initDb() {
  await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA foreign_keys = ON');
  await migrate(db, { migrationsFolder: resolve(process.env.MIGRATIONS_PATH ?? 'drizzle') });
}
