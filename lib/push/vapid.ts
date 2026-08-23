import webpush from "web-push";
import { getDb } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/db/migrations";

export const VAPID_PUBLIC_KEY_SETTING = "vapid_public_key";
export const VAPID_PRIVATE_KEY_SETTING = "vapid_private_key";
export const VAPID_SUBJECT_SETTING = "vapid_subject";

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

function envOrEmpty(name: string): string {
  return process.env[name]?.trim() || "";
}

function mailtoFromAppPublicUrl(): string | null {
  const raw =
    envOrEmpty("APP_PUBLIC_URL") || envOrEmpty("NEXT_PUBLIC_APP_URL");
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    return host ? `mailto:buddy@${host}` : null;
  } catch {
    return null;
  }
}

function resolveVapidSubject(stored?: string | null): string {
  return (
    envOrEmpty("VAPID_SUBJECT") ||
    stored?.trim() ||
    mailtoFromAppPublicUrl() ||
    envOrEmpty("SMTP_FROM") ||
    "mailto:buddy@localhost"
  );
}

function envVapidOverride(): VapidConfig | null {
  const publicKey = envOrEmpty("VAPID_PUBLIC_KEY");
  const privateKey = envOrEmpty("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: resolveVapidSubject(null),
  };
}

function readStoredVapid(): VapidConfig | null {
  const publicKey = getSetting(VAPID_PUBLIC_KEY_SETTING)?.trim() || "";
  const privateKey = getSetting(VAPID_PRIVATE_KEY_SETTING)?.trim() || "";
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: resolveVapidSubject(getSetting(VAPID_SUBJECT_SETTING)),
  };
}

/** Generate a key pair once and persist it. BEGIN IMMEDIATE avoids a split pair on race. */
function generateAndPersistVapid(): VapidConfig {
  const db = getDb();
  const persist = db.transaction((): VapidConfig => {
    const existing = readStoredVapid();
    if (existing) return existing;

    const keys = webpush.generateVAPIDKeys();
    const subject = resolveVapidSubject(null);
    setSetting(VAPID_PUBLIC_KEY_SETTING, keys.publicKey);
    setSetting(VAPID_PRIVATE_KEY_SETTING, keys.privateKey);
    setSetting(VAPID_SUBJECT_SETTING, subject);
    return {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject,
    };
  });
  return persist.immediate();
}

/**
 * Env `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` override when both are set.
 * Otherwise keys live in `settings` and are created on first use.
 */
export function getVapidConfig(): VapidConfig | null {
  const fromEnv = envVapidOverride();
  if (fromEnv) return fromEnv;
  try {
    return readStoredVapid() ?? generateAndPersistVapid();
  } catch {
    return null;
  }
}

export function isWebPushConfigured(): boolean {
  return getVapidConfig() != null;
}

let appliedSignature: string | null = null;

export function ensureWebPushConfigured(): VapidConfig | null {
  const cfg = getVapidConfig();
  if (!cfg) return null;
  const signature = `${cfg.subject}\0${cfg.publicKey}\0${cfg.privateKey}`;
  if (appliedSignature !== signature) {
    webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    appliedSignature = signature;
  }
  return cfg;
}
