import assert from "node:assert/strict";
import test from "node:test";
import { MariTimeLineCreateSchema } from "./timekeeping.ts";
import { timeBookPostHours } from "./time-book-hours.ts";

function payload(hours: number, hoursBillable: number) {
  return {
    dayOfService: "2026-08-29",
    projectNumber: "P600111",
    activity: "Workshop",
    hours,
    hoursBillable,
    contractId: 1,
  };
}

test("MariTimeLineCreateSchema accepts independent hours and hoursBillable 0–24", () => {
  const workedOnly = MariTimeLineCreateSchema.parse(payload(1.5, 0));
  assert.equal(workedOnly.hours, 1.5);
  assert.equal(workedOnly.hoursBillable, 0);

  const billedMore = MariTimeLineCreateSchema.parse(payload(1.5, 2));
  assert.equal(billedMore.hours, 1.5);
  assert.equal(billedMore.hoursBillable, 2);

  const bothZero = MariTimeLineCreateSchema.parse(payload(0, 0));
  assert.equal(bothZero.hours, 0);
  assert.equal(bothZero.hoursBillable, 0);
});

test("MariTimeLineCreateSchema does not cap hoursBillable to hours", () => {
  const parsed = MariTimeLineCreateSchema.parse(payload(1.25, 1.5));
  assert.ok(parsed.hoursBillable > parsed.hours);
  assert.deepEqual(timeBookPostHours(parsed.hours, parsed.hoursBillable), {
    hours: 1.25,
    hoursBillable: 1.5,
  });
});

test("booking Geleistet=1.5 Verrechenbar=0 posts hours and hoursBillable", () => {
  const posted = timeBookPostHours(1.5, 0);
  const parsed = MariTimeLineCreateSchema.parse({
    ...payload(posted.hours, posted.hoursBillable),
  });
  assert.deepEqual(
    { hours: parsed.hours, hoursBillable: parsed.hoursBillable },
    { hours: 1.5, hoursBillable: 0 }
  );
});
