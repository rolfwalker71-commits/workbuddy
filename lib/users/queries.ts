import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import path from "path";
import {
  ALL_APP_MODULES,
  normalizeAppModules,
  type AppModule,
} from "@/lib/users/modules";
import { decryptSecret, encryptSecret, secretIsSet } from "@/lib/crypto/secret-box";

export type UserGender = "male" | "female" | null;

export type AppUserRow = {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  gender: UserGender;
  avatar_path: string | null;
  avatar_prompt: string | null;
  active: number;
  is_admin: number;
  mari_employee_number: string | null;
  mari_rest_username: string | null;
  mari_rest_password_enc: string | null;
  openai_api_key_enc: string | null;
  openai_model: string | null;
  chat_provider: string | null;
  chat_api_key_enc: string | null;
  chat_base_url: string | null;
  chat_model: string | null;
  notification_prefs: string | null;
  created_at: string;
  updated_at: string;
};

export type AppUserPublic = Omit<
  AppUserRow,
  | "password_hash"
  | "avatar_path"
  | "avatar_prompt"
  | "mari_rest_password_enc"
  | "openai_api_key_enc"
  | "chat_api_key_enc"
> & {
  modules: AppModule[];
  avatar_url: string | null;
  has_mari_password: boolean;
  has_openai_key: boolean;
  has_chat_key: boolean;
};

function normalizeGender(raw: string | null | undefined): UserGender {
  if (raw === "male" || raw === "female") return raw;
  return null;
}

function avatarUrlFromPath(avatarPath: string | null | undefined): string | null {
  if (!avatarPath) return null;
  return `/api/users/media/avatar/${encodeURIComponent(
    path.basename(avatarPath)
  )}`;
}

function mapPublic(row: AppUserRow, modules: AppModule[]): AppUserPublic {
  const {
    password_hash: _hash,
    avatar_path,
    avatar_prompt: _prompt,
    mari_rest_password_enc,
    openai_api_key_enc,
    chat_api_key_enc,
    ...rest
  } = row;
  return {
    ...rest,
    gender: normalizeGender(row.gender),
    mari_employee_number: row.mari_employee_number?.trim() || null,
    mari_rest_username: row.mari_rest_username?.trim() || null,
    has_mari_password: secretIsSet(mari_rest_password_enc),
    has_openai_key: secretIsSet(openai_api_key_enc),
    has_chat_key: secretIsSet(chat_api_key_enc),
    avatar_url: avatarUrlFromPath(avatar_path),
    modules,
  };
}

function coerceUserRow(row: AppUserRow & { mari_rest_password?: string | null }): AppUserRow {
  const legacyPassword = row.mari_rest_password ?? null;
  return {
    ...row,
    gender: normalizeGender(row.gender),
    avatar_path: row.avatar_path ?? null,
    avatar_prompt: row.avatar_prompt ?? null,
    is_admin: row.is_admin ? 1 : 0,
    mari_employee_number: row.mari_employee_number?.trim() || null,
    mari_rest_username: row.mari_rest_username?.trim() || null,
    mari_rest_password_enc: row.mari_rest_password_enc || legacyPassword,
    openai_api_key_enc: row.openai_api_key_enc ?? null,
    openai_model: row.openai_model ?? null,
    chat_provider: row.chat_provider ?? null,
    chat_api_key_enc: row.chat_api_key_enc ?? null,
    chat_base_url: row.chat_base_url ?? null,
    chat_model: row.chat_model ?? null,
    notification_prefs: row.notification_prefs ?? null,
  };
}

export function listAppUsers(): AppUserPublic[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM users ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE, id`
    )
    .all() as AppUserRow[];
  return rows.map((row) =>
    mapPublic(coerceUserRow(row), listUserModules(row.id))
  );
}

export function getAppUserById(id: number): AppUserRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM users WHERE id = ?`)
    .get(id) as AppUserRow | undefined;
  return row ? coerceUserRow(row) : null;
}

export function getAppUserByUsername(username: string): AppUserRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`)
    .get(username.trim()) as AppUserRow | undefined;
  return row ? coerceUserRow(row) : null;
}

export function getAppUserPublic(id: number): AppUserPublic | null {
  const row = getAppUserById(id);
  if (!row) return null;
  return mapPublic(row, listUserModules(id));
}

export function createAppUser(input: {
  username: string;
  email: string;
  displayName: string;
  passwordHash: string;
  active?: boolean;
  gender?: UserGender;
  isAdmin?: boolean;
}): AppUserRow {
  const db = getDb();
  const ts = nowIso();
  const username = input.username.trim();
  const email = input.email.trim();
  const displayName = input.displayName.trim() || username;
  if (!username) throw new Error("Benutzername fehlt");
  if (!email) throw new Error("E-Mail fehlt");
  if (!input.passwordHash) throw new Error("Passwort-Hash fehlt");
  try {
    const result = db
      .prepare(
        `INSERT INTO users
           (username, email, password_hash, display_name, gender, avatar_path, avatar_prompt, active, is_admin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`
      )
      .run(
        username,
        email,
        input.passwordHash,
        displayName,
        input.gender ?? null,
        input.active === false ? 0 : 1,
        input.isAdmin ? 1 : 0,
        ts,
        ts
      );
    return getAppUserById(Number(result.lastInsertRowid))!;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      throw new Error("Benutzername ist bereits vergeben");
    }
    throw error;
  }
}

export function updateAppUser(
  id: number,
  input: {
    username?: string;
    email?: string;
    displayName?: string;
    passwordHash?: string;
    active?: boolean;
    gender?: UserGender;
    isAdmin?: boolean;
    mariEmployeeNumber?: string | null;
    mariRestUsername?: string | null;
    mariRestPassword?: string | null;
    clearMariRestPassword?: boolean;
    openaiApiKey?: string | null;
    clearOpenaiApiKey?: boolean;
    openaiModel?: string | null;
    chatProvider?: string | null;
    chatApiKey?: string | null;
    clearChatApiKey?: boolean;
    chatBaseUrl?: string | null;
    chatModel?: string | null;
  }
): AppUserRow {
  const existing = getAppUserById(id);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  const db = getDb();
  let mariEmployeeNumber = existing.mari_employee_number;
  if (input.mariEmployeeNumber !== undefined) {
    const emp = input.mariEmployeeNumber?.trim() || null;
    if (emp && !/^[A-Za-z0-9]+$/.test(emp)) {
      throw new Error(
        "Personalnummer darf nur Buchstaben und Ziffern enthalten (z.B. M1010)."
      );
    }
    mariEmployeeNumber = emp;
  }
  let mariRestUsername = existing.mari_rest_username;
  if (input.mariRestUsername !== undefined) {
    mariRestUsername = input.mariRestUsername?.trim() || null;
  }
  let mariRestPasswordEnc = existing.mari_rest_password_enc;
  if (input.clearMariRestPassword) {
    mariRestPasswordEnc = null;
  } else if (input.mariRestPassword != null && input.mariRestPassword.trim()) {
    mariRestPasswordEnc = encryptSecret(input.mariRestPassword.trim());
  }
  if (mariRestUsername && (!mariRestPasswordEnc || !mariEmployeeNumber)) {
    throw new Error(
      "Für persönliche MARI-Zugangsdaten bitte Benutzer, Passwort und Personalnummer setzen."
    );
  }
  if (!mariRestUsername) {
    mariRestPasswordEnc = null;
  }

  let openaiApiKeyEnc = existing.openai_api_key_enc;
  if (input.clearOpenaiApiKey) {
    openaiApiKeyEnc = null;
  } else if (input.openaiApiKey != null && input.openaiApiKey.trim()) {
    openaiApiKeyEnc = encryptSecret(input.openaiApiKey.trim());
  }

  let chatApiKeyEnc = existing.chat_api_key_enc;
  if (input.clearChatApiKey) {
    chatApiKeyEnc = null;
  } else if (input.chatApiKey != null && input.chatApiKey.trim()) {
    chatApiKeyEnc = encryptSecret(input.chatApiKey.trim());
  }

  try {
    db.prepare(
      `UPDATE users SET
         username = ?,
         email = ?,
         password_hash = ?,
         display_name = ?,
         gender = ?,
         active = ?,
         is_admin = ?,
         mari_employee_number = ?,
         mari_rest_username = ?,
         mari_rest_password_enc = ?,
         openai_api_key_enc = ?,
         openai_model = ?,
         chat_provider = ?,
         chat_api_key_enc = ?,
         chat_base_url = ?,
         chat_model = ?,
         updated_at = ?
       WHERE id = ?`
    ).run(
      input.username !== undefined ? input.username.trim() : existing.username,
      input.email !== undefined ? input.email.trim() : existing.email,
      input.passwordHash !== undefined
        ? input.passwordHash
        : existing.password_hash,
      input.displayName !== undefined
        ? input.displayName.trim() || existing.display_name
        : existing.display_name,
      input.gender !== undefined ? input.gender : existing.gender,
      input.active !== undefined ? (input.active ? 1 : 0) : existing.active,
      input.isAdmin !== undefined ? (input.isAdmin ? 1 : 0) : existing.is_admin,
      mariEmployeeNumber,
      mariRestUsername,
      mariRestPasswordEnc,
      openaiApiKeyEnc,
      input.openaiModel !== undefined
        ? input.openaiModel?.trim() || null
        : existing.openai_model,
      input.chatProvider !== undefined
        ? input.chatProvider?.trim() || null
        : existing.chat_provider,
      chatApiKeyEnc,
      input.chatBaseUrl !== undefined
        ? input.chatBaseUrl?.trim() || null
        : existing.chat_base_url,
      input.chatModel !== undefined
        ? input.chatModel?.trim() || null
        : existing.chat_model,
      nowIso(),
      id
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      throw new Error("Benutzername ist bereits vergeben");
    }
    throw error;
  }
  return getAppUserById(id)!;
}

export function getUserMariPassword(user: AppUserRow): string | null {
  return decryptSecret(user.mari_rest_password_enc);
}

export function getUserOpenAiApiKey(user: AppUserRow): string | null {
  return decryptSecret(user.openai_api_key_enc);
}

export function getUserChatApiKey(user: AppUserRow): string | null {
  return decryptSecret(user.chat_api_key_enc);
}

export function setUserAvatar(
  userId: number,
  input: {
    avatarPath: string | null;
    avatarPrompt: string | null;
  }
): AppUserRow {
  const existing = getAppUserById(userId);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  getDb()
    .prepare(
      `UPDATE users SET avatar_path = ?, avatar_prompt = ?, updated_at = ? WHERE id = ?`
    )
    .run(input.avatarPath, input.avatarPrompt, nowIso(), userId);
  return getAppUserById(userId)!;
}

export function deleteAppUser(id: number): void {
  const existing = getAppUserById(id);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  getDb().prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

export function listUserModules(userId: number): AppModule[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT module FROM user_module_access WHERE user_id = ?`)
    .all(userId) as Array<{ module: string }>;
  return normalizeAppModules(rows.map((r) => r.module));
}

export function effectiveUserModules(
  userId: number,
  isAdmin: boolean
): AppModule[] {
  if (isAdmin) return [...ALL_APP_MODULES];
  return listUserModules(userId);
}

export function userHasModule(
  userId: number,
  module: AppModule,
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  return effectiveUserModules(userId, false).includes(module);
}

export function setUserModules(userId: number, modules: AppModule[]): void {
  const existing = getAppUserById(userId);
  if (!existing) throw new Error("Benutzer nicht gefunden");
  const normalized = normalizeAppModules(modules);
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM user_module_access WHERE user_id = ?`).run(userId);
    const insert = db.prepare(
      `INSERT INTO user_module_access (user_id, module) VALUES (?, ?)`
    );
    for (const module of normalized) {
      insert.run(userId, module);
    }
  });
  tx();
}

export function setUserAccess(
  userId: number,
  input: {
    modules?: AppModule[];
  }
): AppUserPublic {
  setUserModules(userId, input.modules ?? []);
  return getAppUserPublic(userId)!;
}

export function listActiveUsersWithModule(module: AppModule): AppUserRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.* FROM users u
       INNER JOIN user_module_access a ON a.user_id = u.id AND a.module = ?
       WHERE u.active = 1
       UNION
       SELECT u.* FROM users u WHERE u.active = 1 AND u.is_admin = 1`
    )
    .all(module) as AppUserRow[];
  const seen = new Set<number>();
  const out: AppUserRow[] = [];
  for (const row of rows) {
    const coerced = coerceUserRow(row);
    if (seen.has(coerced.id)) continue;
    seen.add(coerced.id);
    out.push(coerced);
  }
  return out;
}
