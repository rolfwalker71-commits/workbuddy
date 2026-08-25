import assert from "node:assert/strict";
import test from "node:test";
import {
  TTV_INBOX_STATUS_ID,
  sanitizeYmd,
  ttvInboxDateWindow,
} from "./ttv.ts";

test("TTV inbox uses status NEU", () => {
  assert.equal(TTV_INBOX_STATUS_ID, 11);
});

test("sanitizeYmd accepts ISO dates only", () => {
  assert.equal(sanitizeYmd("2026-08-24"), "2026-08-24");
  assert.equal(sanitizeYmd("2026-08-24T15:00:00"), "2026-08-24");
  assert.equal(sanitizeYmd("24.08.2026"), null);
  assert.equal(sanitizeYmd(""), null);
});

test("ttvInboxDateWindow is today plus yesterday in Zurich", () => {
  const { fromYmd, toYmd } = ttvInboxDateWindow(
    new Date("2026-08-25T10:00:00+02:00")
  );
  assert.equal(toYmd, "2026-08-25");
  assert.equal(fromYmd, "2026-08-24");
});
