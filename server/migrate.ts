/**
 * Standalone migration script - runs Drizzle migrations on startup
 * Called by docker-entrypoint.sh before starting the server
 */
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[Migrate] DATABASE_URL not set, skipping migrations");
    process.exit(0);
  }

  console.log("[Migrate] Connecting to database...");

  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    const db = drizzle(connection);

    // Find migrations folder - works both in dev and in Docker (dist/)
    const migrationsFolder = path.resolve(__dirname, "../../drizzle");
    console.log(`[Migrate] Running migrations from: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });
    console.log("[Migrate] All migrations applied successfully");
  } catch (err) {
    console.error("[Migrate] Migration failed:", err);
    // Don't exit with error - server will fail with a clearer message
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

runMigrations();
