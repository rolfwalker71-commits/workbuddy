import assert from "node:assert/strict";
import test from "node:test";
import { hoursSplitFromStamp } from "../workspace/event-mari-shared.ts";
import {
  bagelHoursAriaLabel,
  isValidBookHours,
  parseBookHours,
  timeBookFollowBillableRaw,
  timeBookHoursFromDefaults,
  timeBookInitialBillableDirty,
  timeBookPostHours,
} from "./time-book-hours.ts";

test("timeBookHoursFromDefaults prefills Geleistet and Verrechenbar the same", () => {
  assert.deepEqual(timeBookHoursFromDefaults(null), {
    hours: 0.25,
    hoursBillable: 0.25,
  });
  assert.deepEqual(timeBookHoursFromDefaults({ hours: 1.5 }), {
    hours: 1.5,
    hoursBillable: 1.5,
  });
});

test("timeBookHoursFromDefaults keeps explicit Verrechenbar including 0 and billed > worked", () => {
  assert.deepEqual(
    timeBookHoursFromDefaults({ hours: 1.5, hoursBillable: 0 }),
    { hours: 1.5, hoursBillable: 0 }
  );
  assert.deepEqual(
    timeBookHoursFromDefaults({ hours: 1.5, hoursBillable: 2 }),
    { hours: 1.5, hoursBillable: 2 }
  );
});

test("changing one posted field does not force the other", () => {
  const start = timeBookHoursFromDefaults({ hours: 1.5 });
  assert.equal(start.hours, start.hoursBillable);
  assert.deepEqual(timeBookPostHours(start.hours, 0), {
    hours: 1.5,
    hoursBillable: 0,
  });
  assert.deepEqual(timeBookPostHours(1.25, start.hoursBillable), {
    hours: 1.25,
    hoursBillable: 1.5,
  });
});

test("billableDirty starts false when Geleistet and Verrechenbar match", () => {
  assert.equal(
    timeBookInitialBillableDirty(timeBookHoursFromDefaults({ hours: 1.5 })),
    false
  );
  assert.equal(
    timeBookInitialBillableDirty({ hours: 1.5, hoursBillable: 0 }),
    true
  );
});

test("Geleistet copies into Verrechenbar until billableDirty", () => {
  assert.equal(timeBookFollowBillableRaw("2", "1.5", false), "2");
  assert.equal(timeBookFollowBillableRaw("2", "0", true), "0");
  assert.equal(timeBookFollowBillableRaw("1,", "1.5", false), "1,");
});

test("parseBookHours and isValidBookHours are independent 0–24", () => {
  assert.equal(parseBookHours("1,5"), 1.5);
  assert.equal(isValidBookHours(0), true);
  assert.equal(isValidBookHours(24), true);
  assert.equal(isValidBookHours(-0.01), false);
  assert.equal(isValidBookHours(24.01), false);
});

test("hoursSplitFromStamp keeps Geleistet and Verrechenbar independent", () => {
  assert.deepEqual(hoursSplitFromStamp(1.5, 0), { hours: 1.5, billable: 0 });
  assert.deepEqual(hoursSplitFromStamp(1.5, 2), { hours: 1.5, billable: 2 });
  assert.deepEqual(hoursSplitFromStamp(1.5, null), { hours: 1.5, billable: 1.5 });
});

test("bagel aria-label names Geleistet and Verrechenbar", () => {
  assert.equal(
    bagelHoursAriaLabel(1.5, 0),
    "Geleistet 1.50 h, verrechenbar 0.00 h"
  );
  assert.equal(
    bagelHoursAriaLabel(1.5, 2),
    "Geleistet 1.50 h, verrechenbar 2.00 h"
  );
});
