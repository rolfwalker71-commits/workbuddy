import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import {
  mailSenderBlacklistEmails,
  parseMailSenderBlacklist,
  removeMailSenderBlacklistEntry,
  serializeMailSenderBlacklist,
  upsertMailSenderBlacklistEntry,
  type MailSenderBlacklistEntry,
} from "@/lib/mail/sender-blacklist";

let columnReady = false;

function ensureBlacklistColumn(): void {
  if (columnReady) return;
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === "mail_sender_blacklist")) {
    db.exec(`ALTER TABLE users ADD COLUMN mail_sender_blacklist TEXT`);
  }
  columnReady = true;
}

export function getUserMailSenderBlacklist(
  userId: number
): MailSenderBlacklistEntry[] {
  if (!Number.isInteger(userId) || userId <= 0) return [];
  ensureBlacklistColumn();
  const row = getDb()
    .prepare(`SELECT mail_sender_blacklist FROM users WHERE id = ?`)
    .get(userId) as { mail_sender_blacklist: string | null } | undefined;
  return parseMailSenderBlacklist(row?.mail_sender_blacklist);
}

export function listUserMailSenderBlacklistEmails(userId: number): string[] {
  return mailSenderBlacklistEmails(getUserMailSenderBlacklist(userId));
}

function writeUserMailSenderBlacklist(
  userId: number,
  entries: MailSenderBlacklistEntry[]
): MailSenderBlacklistEntry[] {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("User ungültig.");
  }
  ensureBlacklistColumn();
  const parsed = parseMailSenderBlacklist(entries);
  const result = getDb()
    .prepare(
      `UPDATE users SET mail_sender_blacklist = ?, updated_at = ? WHERE id = ?`
    )
    .run(serializeMailSenderBlacklist(parsed), nowIso(), userId);
  if (result.changes < 1) {
    throw new Error("Benutzer nicht gefunden");
  }
  return parsed;
}

export function addUserMailSenderBlacklist(
  userId: number,
  input: { email: string; name?: string | null }
): MailSenderBlacklistEntry[] {
  return writeUserMailSenderBlacklist(
    userId,
    upsertMailSenderBlacklistEntry(getUserMailSenderBlacklist(userId), input)
  );
}

export function removeUserMailSenderBlacklist(
  userId: number,
  email: string
): MailSenderBlacklistEntry[] {
  return writeUserMailSenderBlacklist(
    userId,
    removeMailSenderBlacklistEntry(getUserMailSenderBlacklist(userId), email)
  );
}
