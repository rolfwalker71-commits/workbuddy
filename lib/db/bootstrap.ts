import type Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Apply schema + safe column migrations to an open DB connection.
 * Must NOT import getDb() — kept free of circular deps with client.ts.
 */
export function bootstrapDatabase(db: Database.Database): void {
  const schemaPath = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "lib",
    "db",
    "schema.sql"
  );
  const schema = fs.readFileSync(schemaPath, "utf8");
  try {
    db.exec(schema);
  } catch (error) {
    console.error(
      "[workbuddy] schema.sql apply had errors (continuing with migrations):",
      error instanceof Error ? error.message : error
    );
  }

  ensureUsersColumns(db);
  ensureMailAnalysesProvider(db);
  ensureMariCalendarStampOwner(db);
}

function tableColumnNames(
  db: Database.Database,
  table: string
): Set<string> {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return new Set(cols.map((c) => c.name));
}

function ensureUsersColumns(db: Database.Database): void {
  const names = tableColumnNames(db, "users");
  const adds: Array<[string, string]> = [
    ["gender", "TEXT"],
    ["avatar_path", "TEXT"],
    ["avatar_prompt", "TEXT"],
    ["is_admin", "INTEGER NOT NULL DEFAULT 0"],
    ["notification_prefs", "TEXT"],
    ["mari_employee_number", "TEXT"],
    ["mari_rest_username", "TEXT"],
    ["mari_rest_password_enc", "TEXT"],
    ["openai_api_key_enc", "TEXT"],
    ["openai_model", "TEXT"],
    ["chat_provider", "TEXT"],
    ["chat_api_key_enc", "TEXT"],
    ["chat_base_url", "TEXT"],
    ["chat_model", "TEXT"],
    ["google_oauth_client_id", "TEXT"],
    ["google_oauth_client_secret_enc", "TEXT"],
    ["teams_enabled", "INTEGER"],
  ];
  for (const [name, ddl] of adds) {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`);
    }
  }
  // Legacy plaintext password column → keep until values are re-saved encrypted.
  if (!names.has("mari_rest_password") && names.has("mari_rest_password")) {
    /* no-op */
  }
  const after = tableColumnNames(db, "users");
  if (after.has("mari_rest_password") && after.has("mari_rest_password_enc")) {
    db.exec(`
      UPDATE users
      SET mari_rest_password_enc = mari_rest_password
      WHERE (mari_rest_password_enc IS NULL OR mari_rest_password_enc = '')
        AND mari_rest_password IS NOT NULL
        AND mari_rest_password != ''
    `);
  }
}

function ensureMailAnalysesProvider(db: Database.Database): void {
  const names = tableColumnNames(db, "mail_analyses");
  if (!names.has("provider")) {
    db.exec(
      `ALTER TABLE mail_analyses ADD COLUMN provider TEXT NOT NULL DEFAULT 'microsoft'`
    );
  }
}

function ensureMariCalendarStampOwner(db: Database.Database): void {
  const names = tableColumnNames(db, "mari_calendar_stamps");
  if (!names.has("user_id")) {
    db.exec(
      `ALTER TABLE mari_calendar_stamps ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0`
    );
  }
  if (!names.has("owner_key")) {
    db.exec(
      `ALTER TABLE mari_calendar_stamps ADD COLUMN owner_key TEXT NOT NULL DEFAULT 'admin'`
    );
  }
  db.exec(`
    UPDATE mari_calendar_stamps
    SET owner_key = CASE
      WHEN user_id > 0 THEN 'user:' || user_id
      ELSE owner_key
    END
    WHERE owner_key IS NULL OR owner_key = ''
  `);
}
