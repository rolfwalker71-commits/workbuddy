import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { bootstrapDatabase } from "./bootstrap";

const globalForDb = globalThis as unknown as {
  workbuddyDb?: Database.Database;
  workbuddyInitialized?: boolean;
};

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
  }
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "data",
    "supportdesk.sqlite"
  );
}

export function getDb(): Database.Database {
  if (globalForDb.workbuddyDb && globalForDb.workbuddyInitialized) {
    return globalForDb.workbuddyDb;
  }

  if (globalForDb.workbuddyDb && !globalForDb.workbuddyInitialized) {
    try {
      globalForDb.workbuddyDb.close();
    } catch {
      /* ignore */
    }
    globalForDb.workbuddyDb = undefined;
  }

  const dbPath = resolveDbPath();
  const dbDir = path.dirname(dbPath);
  try {
    fs.mkdirSync(dbDir, { recursive: true });
  } catch (error) {
    throw new Error(
      `Cannot create database directory '${dbDir}': ${
        error instanceof Error ? error.message : String(error)
      }. Fix host volume permissions (e.g. chown -R 1000:1000 ./data).`,
      { cause: error }
    );
  }

  let db: Database.Database;
  try {
    db = new Database(dbPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot open SQLite database '${dbPath}': ${detail}. ` +
        `The directory must be writable by the app user (Docker: uid 1000). ` +
        `On the host: sudo chown -R 1000:1000 ./data && docker compose restart`,
      { cause: error }
    );
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  globalForDb.workbuddyDb = db;

  try {
    bootstrapDatabase(db);
    globalForDb.workbuddyInitialized = true;
  } catch (error) {
    globalForDb.workbuddyInitialized = false;
    try {
      db.close();
    } catch {
      /* ignore */
    }
    globalForDb.workbuddyDb = undefined;
    throw error;
  }

  return db;
}

export function getDatabasePath(): string {
  return resolveDbPath();
}

/** Test helper — close the singleton so the next getDb() reopens. */
export function resetDbForTests(): void {
  if (globalForDb.workbuddyDb) {
    try {
      globalForDb.workbuddyDb.close();
    } catch {
      /* ignore */
    }
  }
  globalForDb.workbuddyDb = undefined;
  globalForDb.workbuddyInitialized = false;
}
