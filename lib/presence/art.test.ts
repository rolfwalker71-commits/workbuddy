import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PRESENCE_ISO_ART, presenceIsoArt } from "./art.ts";
import {
  PRESENCE_STATUSES,
  PRESENCE_STATUS_LABELS,
} from "./status.ts";
import { PRESENCE_PILL_LABELS } from "./client.ts";

test("vacation stays the key and reads Frei / Ferien in the UI", () => {
  assert.equal(PRESENCE_STATUS_LABELS.vacation, "Frei / Ferien");
  assert.equal(PRESENCE_PILL_LABELS.vacation, "Frei / Ferien");
});

test("each presence status has a public isometric asset", () => {
  const root = join(import.meta.dirname, "../..");
  for (const status of PRESENCE_STATUSES) {
    const art = presenceIsoArt(status);
    assert.ok(art);
    assert.equal(art.src, PRESENCE_ISO_ART[status].src);
    assert.equal(art.src, `/presence/iso/${status}.webp`);
    assert.equal(
      existsSync(join(root, "public", art.src.replace(/^\//, ""))),
      true,
      `missing ${art.src}`
    );
  }
  assert.equal(presenceIsoArt(null), null);
});
