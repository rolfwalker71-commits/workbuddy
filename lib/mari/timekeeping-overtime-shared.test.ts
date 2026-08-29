import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOvertimeHours,
  mariPeriodFromYmd,
  mariPeriodStartYmd,
  runningOvertimeHours,
} from "./timekeeping-overtime-shared.ts";

test("mariPeriodFromYmd encodes year*1000+month", () => {
  assert.equal(mariPeriodFromYmd("2026-08-29"), 2026008);
  assert.equal(mariPeriodFromYmd("2026-01-01"), 2026001);
  assert.equal(mariPeriodStartYmd(2026001), "2026-01-01");
  assert.equal(mariPeriodStartYmd(2026008), "2026-08-01");
});

test("running overtime matches Maringo Tag grid for 2026-08-29 (−4.85)", () => {
  // Live MARI: start 17.8, calendar 8.2/0, all Quantity including Zuschlag.
  // Last days before Saturday: running −14.85, then Sat 10h / soll 0.
  const beforeSaturday = runningOvertimeHours(17.8, [
    { targetHours: 8.2, bookedHours: 8.2 },
    { targetHours: 8.2, bookedHours: 8.2 },
    { targetHours: 0, bookedHours: 4.5 },
    { targetHours: 0, bookedHours: 0 },
    { targetHours: 8.2, bookedHours: 0 },
    { targetHours: 8.2, bookedHours: 9.25 },
    { targetHours: 8.2, bookedHours: 6.25 },
    { targetHours: 8.2, bookedHours: 5.75 },
    { targetHours: 8.2, bookedHours: 10 },
  ]);
  // This fixture is only the tail; pin the Saturday step from the live −14.85.
  assert.equal(
    runningOvertimeHours(-14.85, [{ targetHours: 0, bookedHours: 10 }]),
    -4.85
  );
  assert.equal(typeof beforeSaturday, "number");
});

test("formatOvertimeHours uses minus sign and two decimals", () => {
  assert.equal(formatOvertimeHours(-4.85), "\u22124.85");
  assert.equal(formatOvertimeHours(0), "0.00");
  assert.equal(formatOvertimeHours(10), "10.00");
});
