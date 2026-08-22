import assert from "node:assert/strict";
import test from "node:test";

process.env.WORKBUDDY_SESSION_SECRET =
  "a-secure-test-secret-with-more-than-32-characters";

test("encrypt/decrypt roundtrip", async () => {
  const { encryptSecret, decryptSecret, secretIsSet } = await import(
    "./secret-box.ts"
  );
  const enc = encryptSecret("sk-test-key");
  assert.ok(enc?.startsWith("wb1:"));
  assert.equal(decryptSecret(enc), "sk-test-key");
  assert.equal(secretIsSet(enc), true);
  assert.equal(encryptSecret("  "), null);
});

test("does not return empty as set", async () => {
  const { secretIsSet } = await import("./secret-box.ts");
  assert.equal(secretIsSet(null), false);
  assert.equal(secretIsSet(""), false);
});

test("decrypt fail is unreadable, not a missing secret", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  delete process.env.DATA_ENCRYPTION_KEY;
  const { encryptSecret, readStoredSecret } = await import("./secret-box.ts");
  const enc = encryptSecret("plain-secret");
  assert.ok(enc);

  process.env.DATA_ENCRYPTION_KEY =
    "a-different-encryption-key-with-more-than-32-chars";
  const read = readStoredSecret(enc);
  assert.equal(read.value, null);
  assert.equal(read.unreadable, true);
});
