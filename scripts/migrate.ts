import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { openDb } from "../src/db/client";

migrate(openDb(), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
console.log("Migraciones aplicadas");
