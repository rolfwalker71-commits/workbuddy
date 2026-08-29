import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_LOG_DEFAULT_WEEKS,
  ACTIVITY_LOG_MAX_DAYS,
  activityLogDefaultRange,
  activityLogRetentionFrom,
  clampActivityLogRange,
  inclusiveYmdCount,
} from "./activity-log-range.ts";

const TODAY = "2026-08-29";

test("activityLogDefaultRange is last 7 weeks through today", () => {
  const range = activityLogDefaultRange(TODAY);
  assert.equal(range.to, TODAY);
  assert.equal(range.from, "2026-07-11");
  assert.equal(
    inclusiveYmdCount(range.from, range.to),
    ACTIVITY_LOG_DEFAULT_WEEKS * 7 + 1
  );
});

test("activityLogRetentionFrom is 60 inclusive days ending today", () => {
  assert.equal(activityLogRetentionFrom(TODAY), "2026-07-01");
  assert.equal(
    inclusiveYmdCount(activityLogRetentionFrom(TODAY), TODAY),
    ACTIVITY_LOG_MAX_DAYS
  );
});

test("clampActivityLogRange defaults to 7 weeks when ends are missing", () => {
  const range = clampActivityLogRange({ today: TODAY });
  assert.ok(!("error" in range));
  assert.deepEqual(range, activityLogDefaultRange(TODAY));
});

test("clampActivityLogRange swaps inverted bounds and caps to at today", () => {
  const swapped = clampActivityLogRange({
    from: "2026-08-20",
    to: "2026-08-10",
    today: TODAY,
  });
  assert.ok(!("error" in swapped));
  assert.deepEqual(swapped, { from: "2026-08-10", to: "2026-08-20" });

  const future = clampActivityLogRange({
    from: "2026-08-20",
    to: "2026-09-15",
    today: TODAY,
  });
  assert.ok(!("error" in future));
  assert.deepEqual(future, { from: "2026-08-20", to: TODAY });
});

test("clampActivityLogRange clamps to retention and 60-day window", () => {
  const beforeRetention = clampActivityLogRange({
    from: "2026-01-01",
    to: TODAY,
    today: TODAY,
  });
  assert.ok(!("error" in beforeRetention));
  assert.equal(beforeRetention.from, "2026-07-01");
  assert.equal(beforeRetention.to, TODAY);
  assert.equal(
    inclusiveYmdCount(beforeRetention.from, beforeRetention.to),
    ACTIVITY_LOG_MAX_DAYS
  );

  const tooWide = clampActivityLogRange({
    from: "2026-05-01",
    to: TODAY,
    today: TODAY,
  });
  assert.ok(!("error" in tooWide));
  assert.equal(tooWide.from, "2026-07-01");
  assert.equal(tooWide.to, TODAY);
  assert.ok(
    inclusiveYmdCount(tooWide.from, tooWide.to) <= ACTIVITY_LOG_MAX_DAYS
  );
});

test("clampActivityLogRange rejects invalid YYYY-MM-DD", () => {
  const badFrom = clampActivityLogRange({ from: "29.08.2026", today: TODAY });
  assert.ok("error" in badFrom);
  assert.match(badFrom.error, /from/i);

  const badTo = clampActivityLogRange({ to: "2026/08/29", today: TODAY });
  assert.ok("error" in badTo);
  assert.match(badTo.error, /to/i);
});
