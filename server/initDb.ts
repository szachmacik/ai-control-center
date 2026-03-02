import mysql from "mysql2/promise";

/**
 * Ensures the database specified in DATABASE_URL exists.
 * Connects without a database name and runs CREATE DATABASE IF NOT EXISTS.
 */
export async function ensureDatabaseExists(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;

  try {
    const url = new URL(dbUrl);
    const dbName = url.pathname.replace(/^\//, "");
    if (!dbName) return;

    const baseConfig = {
      host: url.hostname,
      port: parseInt(url.port || "3306"),
      user: url.username,
      password: decodeURIComponent(url.password),
      connectTimeout: 10000,
    };

    let connection: mysql.Connection | null = null;

    // Try without SSL first (internal Docker networks), then with SSL
    for (const sslConfig of [undefined, { rejectUnauthorized: false }]) {
      try {
        connection = await mysql.createConnection({
          ...baseConfig,
          ...(sslConfig ? { ssl: sslConfig } : {}),
        });
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("insecure transport") || msg.includes("SSL")) {
          continue; // Try next SSL config
        }
        throw err;
      }
    }

    if (!connection) {
      console.warn("[Database] Could not connect to create database");
      return;
    }

    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`[Database] Ensured database '${dbName}' exists`);
    await connection.end();
  } catch (error) {
    console.warn("[Database] Could not ensure database exists:", error);
    // Non-fatal - the database might already exist or be managed externally
  }
}
