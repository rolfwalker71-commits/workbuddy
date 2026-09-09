import assert from "node:assert/strict";
import test from "node:test";
import type { MariTimeLine } from "./timekeeping-shared.ts";
import {
  compareMariProjectNumbers,
  nextTimeLinesSort,
  sortMariTimeLines,
} from "./time-lines-sort.ts";

function line(over: Partial<MariTimeLine> = {}): MariTimeLine {
  return {
    lineId: 1,
    serviceDate: "2026-09-09",
    projectNumber: "P600143",
    projectCustomer: null,
    activity: "",
    memo: null,
    hours: 1,
    hoursBillable: 1,
    contractId: null,
    contractNumber: null,
    contractName: null,
    contractPositionId: null,
    contractPositionName: null,
    employeeNumber: null,
    employeeName: null,
    approvalStatus: "recorded",
    approved: false,
    ...(over as Record<string, unknown>),
  } as MariTimeLine;
}

test("the toggle cycles asc, desc, then back to Maringo's order", () => {
  assert.equal(nextTimeLinesSort(null), "project-asc");
  assert.equal(nextTimeLinesSort("project-asc"), "project-desc");
  assert.equal(nextTimeLinesSort("project-desc"), null);
});

test("project numbers compare numerically, not by character", () => {
  assert.ok(compareMariProjectNumbers("P600074", "P600143") < 0);
  assert.ok(compareMariProjectNumbers("P300052", "P600021") < 0);
  // Plain string compare would put P9 after P10 here.
  assert.ok(compareMariProjectNumbers("P9", "P10") < 0);
  assert.equal(compareMariProjectNumbers("P600143", "P600143"), 0);
});

test("lines without a project number sort last in both directions", () => {
  assert.ok(compareMariProjectNumbers("", "P200000") > 0);
  assert.ok(compareMariProjectNumbers("P200000", "  ") < 0);
  const sorted = sortMariTimeLines(
    [
      line({ lineId: 1, projectNumber: "" }),
      line({ lineId: 2, projectNumber: "P600021" }),
    ],
    "project-desc"
  );
  assert.deepEqual(
    sorted.map((l) => l.lineId),
    [2, 1]
  );
});

test("null keeps the incoming order untouched", () => {
  const input = [
    line({ lineId: 3, projectNumber: "P600143" }),
    line({ lineId: 1, projectNumber: "P200000" }),
  ];
  assert.deepEqual(
    sortMariTimeLines(input, null).map((l) => l.lineId),
    [3, 1]
  );
});

test("sorting does not mutate the input", () => {
  const input = [
    line({ lineId: 2, projectNumber: "P600143" }),
    line({ lineId: 1, projectNumber: "P200000" }),
  ];
  sortMariTimeLines(input, "project-asc");
  assert.deepEqual(
    input.map((l) => l.lineId),
    [2, 1]
  );
});

test("equal projects keep day order, then line id", () => {
  const sorted = sortMariTimeLines(
    [
      line({ lineId: 9, projectNumber: "P200000", serviceDate: "2026-09-09" }),
      line({ lineId: 4, projectNumber: "P200000", serviceDate: "2026-09-09" }),
      line({ lineId: 7, projectNumber: "P200000", serviceDate: "2026-09-08" }),
    ],
    "project-asc"
  );
  assert.deepEqual(
    sorted.map((l) => l.lineId),
    [7, 4, 9]
  );
});
