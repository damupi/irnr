import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export function dataDir(): string {
  return path.resolve(process.env.IRNR_DATA_DIR ?? "./data");
}

export function openDb(dir = dataDir()): Db {
  fs.mkdirSync(dir, { recursive: true });
  const sqlite = new Database(path.join(dir, "irnr.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

const g = globalThis as unknown as { __irnrDb?: Db };

/** Singleton (también entre recargas de `next dev`). */
export function getDb(): Db {
  if (!g.__irnrDb) {
    const db = openDb();
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") }); // idempotente
    g.__irnrDb = db;
  }
  return g.__irnrDb;
}
