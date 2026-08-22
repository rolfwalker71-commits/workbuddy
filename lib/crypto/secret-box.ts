import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "wb1";

function encryptionSecret(): string {
  const explicit = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (explicit) return explicit;
  return process.env.WORKBUDDY_SESSION_SECRET?.trim() || "";
}

export function getEncryptionKey(): Buffer {
  const secret = encryptionSecret();
  if (secret.length < 32) {
    throw new Error(
      "DATA_ENCRYPTION_KEY oder WORKBUDDY_SESSION_SECRET (≥ 32 Zeichen) fehlt für die Verschlüsselung."
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string | null | undefined): string | null {
  const value = plaintext?.trim() || "";
  if (!value) return null;
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export type StoredSecretRead = {
  value: string | null;
  /** Encrypted blob present but key mismatch / corrupt — not “missing”. */
  unreadable: boolean;
};

function encryptionKeySource(): "DATA_ENCRYPTION_KEY" | "WORKBUDDY_SESSION_SECRET" | "none" {
  if (process.env.DATA_ENCRYPTION_KEY?.trim()) return "DATA_ENCRYPTION_KEY";
  if (process.env.WORKBUDDY_SESSION_SECRET?.trim()) {
    return "WORKBUDDY_SESSION_SECRET";
  }
  return "none";
}

function logDecryptFailure(reason: string): void {
  console.warn(
    `[secret-box] decrypt failed (${reason}; key source=${encryptionKeySource()}). Secret not logged.`
  );
}

export function readStoredSecret(
  stored: string | null | undefined
): StoredSecretRead {
  const raw = stored?.trim() || "";
  if (!raw) return { value: null, unreadable: false };
  if (!raw.startsWith(`${PREFIX}:`)) {
    // Legacy plaintext — accept once, never log.
    return { value: raw, unreadable: false };
  }
  const parts = raw.split(":");
  if (parts.length !== 4) {
    logDecryptFailure("malformed blob");
    return { value: null, unreadable: true };
  }
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const key = getEncryptionKey();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    const value = plain.toString("utf8") || null;
    if (!value) {
      logDecryptFailure("empty plaintext");
      return { value: null, unreadable: true };
    }
    return { value, unreadable: false };
  } catch {
    logDecryptFailure("auth/key mismatch");
    return { value: null, unreadable: true };
  }
}

export function decryptSecret(stored: string | null | undefined): string | null {
  return readStoredSecret(stored).value;
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(`${PREFIX}:`));
}

export function secretIsSet(stored: string | null | undefined): boolean {
  return Boolean(stored?.trim());
}
