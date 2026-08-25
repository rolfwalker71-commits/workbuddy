import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TTV_LOOKBACK_DAYS,
  TTV_INBOX_STATUS_ID,
  sanitizeTtvLookbackDays,
  sanitizeYmd,
  ttvInboxDateWindow,
  ttvLookbackLabel,
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

test("sanitizeTtvLookbackDays clamps to 1–14", () => {
  assert.equal(sanitizeTtvLookbackDays(2), 2);
  assert.equal(sanitizeTtvLookbackDays("4"), 4);
  assert.equal(sanitizeTtvLookbackDays(0), null);
  assert.equal(sanitizeTtvLookbackDays(15), null);
  assert.equal(sanitizeTtvLookbackDays("x"), null);
});

test("ttvInboxDateWindow default is today plus yesterday in Zurich", () => {
  const { fromYmd, toYmd, lookbackDays } = ttvInboxDateWindow(
    new Date("2026-08-25T10:00:00+02:00")
  );
  assert.equal(lookbackDays, DEFAULT_TTV_LOOKBACK_DAYS);
  assert.equal(toYmd, "2026-08-25");
  assert.equal(fromYmd, "2026-08-24");
});

test("ttvInboxDateWindow of 4 days covers Friday through Monday", () => {
  const { fromYmd, toYmd } = ttvInboxDateWindow(
    new Date("2026-08-24T10:00:00+02:00"),
    4
  );
  assert.equal(toYmd, "2026-08-24");
  assert.equal(fromYmd, "2026-08-21");
});

test("ttvLookbackLabel is German", () => {
  assert.equal(ttvLookbackLabel(1), "heute");
  assert.equal(ttvLookbackLabel(4), "letzte 4 Tage");
});
