import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function withIsolatedPublicUrl<T>(
  publicUrl: string | null,
  fn: () => T | Promise<T>
): Promise<T> {
  const prevPublic = process.env.APP_PUBLIC_URL;
  const prevNext = process.env.NEXT_PUBLIC_APP_URL;
  const prevDb = process.env.DATABASE_PATH;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-app-url-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");
  if (publicUrl) {
    process.env.APP_PUBLIC_URL = publicUrl;
  } else {
    delete process.env.APP_PUBLIC_URL;
  }
  delete process.env.NEXT_PUBLIC_APP_URL;

  const { resetDbForTests } = await import("./db/client.ts");
  resetDbForTests();
  try {
    return await fn();
  } finally {
    resetDbForTests();
    if (prevPublic === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = prevPublic;
    if (prevNext === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevNext;
    if (prevDb === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = prevDb;
  }
}

test("absoluteOauthRedirectUrl prefers APP_PUBLIC_URL over Docker request host", async () => {
  await withIsolatedPublicUrl("https://workbuddy.rolfwalker.ch", async () => {
    const { absoluteOauthRedirectUrl } = await import("./app-url.ts");
    const req = new Request("http://0.0.0.0:3311/api/google/oauth/start", {
      headers: {
        host: "0.0.0.0:3311",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "0.0.0.0:3311",
      },
    });
    assert.equal(
      absoluteOauthRedirectUrl("/api/google/oauth/callback", req),
      "https://workbuddy.rolfwalker.ch/api/google/oauth/callback"
    );
    assert.equal(
      absoluteOauthRedirectUrl("/api/microsoft/oauth/callback", req),
      "https://workbuddy.rolfwalker.ch/api/microsoft/oauth/callback"
    );
  });
});

test("absoluteOauthRedirectUrl strips trailing slash on APP_PUBLIC_URL origin", async () => {
  await withIsolatedPublicUrl("https://workbuddy.rolfwalker.ch/", async () => {
    const { absoluteOauthRedirectUrl } = await import("./app-url.ts");
    const req = new Request("https://preview.local:3311/account", {
      headers: {
        host: "preview.local:3311",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(
      absoluteOauthRedirectUrl("/api/google/oauth/callback", req),
      "https://workbuddy.rolfwalker.ch/api/google/oauth/callback"
    );
  });
});

test("absoluteOauthRedirectUrl falls back to request host when unset", async () => {
  await withIsolatedPublicUrl(null, async () => {
    const { absoluteOauthRedirectUrl } = await import("./app-url.ts");
    const req = new Request("https://buddyapp.rolfwalker.ch/settings", {
      headers: {
        host: "buddyapp.rolfwalker.ch",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(
      absoluteOauthRedirectUrl("/api/microsoft/oauth/callback", req),
      "https://buddyapp.rolfwalker.ch/api/microsoft/oauth/callback"
    );
  });
});
