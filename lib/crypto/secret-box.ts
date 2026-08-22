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

export function decryptSecret(stored: string | null | undefined): string | null {
  const raw = stored?.trim() || "";
  if (!raw) return null;
  if (!raw.startsWith(`${PREFIX}:`)) {
    // Legacy plaintext — accept once, never log.
    return raw;
  }
  const parts = raw.split(":");
  if (parts.length !== 4) return null;
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
    return plain.toString("utf8") || null;
  } catch {
    return null;
  }
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(`${PREFIX}:`));
}

export function secretIsSet(stored: string | null | undefined): boolean {
  return Boolean(stored?.trim());
}
