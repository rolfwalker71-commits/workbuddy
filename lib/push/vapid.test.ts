import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ENV_KEYS = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "APP_PUBLIC_URL",
  "SMTP_FROM",
  "DATABASE_PATH",
] as const;

function snapshotEnv(): Record<(typeof ENV_KEYS)[number], string | undefined> {
  const snap = {} as Record<(typeof ENV_KEYS)[number], string | undefined>;
  for (const key of ENV_KEYS) snap[key] = process.env[key];
  return snap;
}

function restoreEnv(
  snap: Record<(typeof ENV_KEYS)[number], string | undefined>
): void {
  for (const key of ENV_KEYS) {
    if (snap[key] === undefined) delete process.env[key];
    else process.env[key] = snap[key];
  }
}

function clearVapidEnv(): void {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  delete process.env.APP_PUBLIC_URL;
  delete process.env.SMTP_FROM;
}

test("generates and persists VAPID keys when env is empty", async () => {
  const snap = snapshotEnv();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-vapid-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");
  clearVapidEnv();

  try {
    const { resetDbForTests } = await import("../db/client.ts");
    resetDbForTests();
    const { getSetting } = await import("../db/migrations.ts");
    const {
      getVapidConfig,
      isWebPushConfigured,
      VAPID_PUBLIC_KEY_SETTING,
      VAPID_PRIVATE_KEY_SETTING,
      VAPID_SUBJECT_SETTING,
    } = await import("./vapid.ts");

    assert.equal(getSetting(VAPID_PUBLIC_KEY_SETTING), null);
    assert.equal(isWebPushConfigured(), true);

    const first = getVapidConfig();
    assert.ok(first);
    assert.ok(first.publicKey.length > 20);
    assert.ok(first.privateKey.length > 20);
    assert.equal(first.subject, "mailto:buddy@localhost");
    assert.equal(getSetting(VAPID_PUBLIC_KEY_SETTING), first.publicKey);
    assert.equal(getSetting(VAPID_PRIVATE_KEY_SETTING), first.privateKey);
    assert.equal(getSetting(VAPID_SUBJECT_SETTING), first.subject);

    const second = getVapidConfig();
    assert.deepEqual(second, first);
  } finally {
    restoreEnv(snap);
    const { resetDbForTests } = await import("../db/client.ts");
    resetDbForTests();
  }
});

test("env VAPID keys override stored settings", async () => {
  const snap = snapshotEnv();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-vapid-env-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");
  clearVapidEnv();

  try {
    const { resetDbForTests } = await import("../db/client.ts");
    resetDbForTests();
    const { setSetting } = await import("../db/migrations.ts");
    const {
      getVapidConfig,
      VAPID_PUBLIC_KEY_SETTING,
      VAPID_PRIVATE_KEY_SETTING,
    } = await import("./vapid.ts");

    setSetting(VAPID_PUBLIC_KEY_SETTING, "stored-public");
    setSetting(VAPID_PRIVATE_KEY_SETTING, "stored-private");
    process.env.VAPID_PUBLIC_KEY = "env-public";
    process.env.VAPID_PRIVATE_KEY = "env-private";
    process.env.VAPID_SUBJECT = "mailto:override@example.com";

    const cfg = getVapidConfig();
    assert.deepEqual(cfg, {
      publicKey: "env-public",
      privateKey: "env-private",
      subject: "mailto:override@example.com",
    });
  } finally {
    restoreEnv(snap);
    const { resetDbForTests } = await import("../db/client.ts");
    resetDbForTests();
  }
});
