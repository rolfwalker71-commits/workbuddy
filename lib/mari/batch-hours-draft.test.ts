import assert from "node:assert/strict";
import test from "node:test";
import { batchHoursRowsForDay } from "./batch-hours-rows.ts";
import {
  draftBlockers,
  draftBlockersWithPositions,
  draftFromRow,
  draftToLinePayload,
  isKnownInternalRemark,
  parseDraftHours,
  setDraftBillable,
  setDraftHours,
} from "./batch-hours-draft.ts";

function rowWithProject() {
  const [row] = batchHoursRowsForDay([
    {
      id: "ev-1",
      provider: "microsoft",
      calendarId: "cal",
      title: "Rinco: Server",
      date: "2026-09-09",
      time: "13:00",
      endTime: "14:30",
      done: true,
      attendeeEmails: [],
      mari: {
        issueId: 4711,
        stampStatus: "pending",
        hours: null,
        cardCode: null,
        briefDescription: null,
        status: null,
        statusName: null,
        booking: {
          cardCode: "C1",
          customerName: "Rinco",
          projectNumber: "P103763",
          projectLabel: "P103763 Rinco",
          contractId: 55,
          contractVisible: "V103763",
          source: "pinned",
          meetingKind: "external",
          contractOptional: false,
        },
      },
    },
  ]);
  assert.ok(row);
  return row;
}

test("draft starts from the row defaults", () => {
  const row = rowWithProject();
  const draft = draftFromRow(row);
  assert.equal(draft.projectNumber, "P103763");
  assert.equal(draft.contractId, 55);
  assert.equal(draft.hoursRaw, "1.5");
  assert.equal(draft.hoursBillableRaw, "1.5");
  assert.equal(draft.billableDirty, false);
  assert.deepEqual(draftBlockers(draft), []);
});

test("memo starts empty and is sent as null when untouched", () => {
  const row = rowWithProject();
  const draft = draftFromRow(row);
  assert.equal(draft.memoText, "");
  assert.equal(draftToLinePayload(row, draft)?.memoText, null);
  assert.equal(draft.activity, "Rinco: Server", "activity keeps the title");
});

test("Verrechenbar follows Geleistet until it is edited", () => {
  const row = rowWithProject();
  let draft = draftFromRow(row);
  draft = setDraftHours(draft, "2");
  assert.equal(draft.hoursBillableRaw, "2");

  draft = setDraftBillable(draft, "1");
  assert.equal(draft.billableDirty, true);
  draft = setDraftHours(draft, "3");
  assert.equal(draft.hoursRaw, "3");
  assert.equal(draft.hoursBillableRaw, "1", "edited billable must stay put");
});

test("parseDraftHours takes commas and rejects nonsense", () => {
  assert.equal(parseDraftHours("1,25"), 1.25);
  assert.equal(parseDraftHours(" 0.5 "), 0.5);
  assert.equal(parseDraftHours(""), null);
  assert.equal(parseDraftHours("abc"), null);
  assert.equal(parseDraftHours("-1"), null);
  assert.equal(parseDraftHours("25"), null);
});

test("blockers list every field Maringo would reject", () => {
  const row = rowWithProject();
  const draft = {
    ...draftFromRow(row),
    projectNumber: null,
    contractId: null,
    contractOptional: false,
    activity: "  ",
    hoursRaw: "x",
    hoursBillableRaw: "",
  };
  assert.deepEqual(draftBlockers(draft).sort(), [
    "activity",
    "billable",
    "contract",
    "hours",
    "project",
  ]);
});

test("a position is required as soon as the contract offers any", () => {
  const row = rowWithProject();
  const draft = { ...draftFromRow(row), contractPositionId: null };
  assert.deepEqual(draftBlockersWithPositions(draft, 0), [], "none offered");
  assert.deepEqual(draftBlockersWithPositions(draft, 3), ["position"]);
  assert.deepEqual(
    draftBlockersWithPositions({ ...draft, contractPositionId: 7 }, 3),
    []
  );
});

test("an internal meeting needs no contract", () => {
  const row = rowWithProject();
  const draft = {
    ...draftFromRow(row),
    contractId: null,
    contractOptional: true,
  };
  assert.deepEqual(draftBlockers(draft), []);
  const payload = draftToLinePayload(row, draft);
  assert.equal(payload?.contractId, 0, "0 means kein Vertrag nötig");
});

test("payload carries the ticket link and the UDF fields", () => {
  const row = rowWithProject();
  const draft = {
    ...draftFromRow(row),
    internalRemarkVerr: "Rueckfrage",
    zeroHoursReason: "  Kulanz  ",
  };
  const payload = draftToLinePayload(row, draft);
  assert.equal(payload?.dayOfService, "2026-09-09");
  assert.equal(payload?.issueId, 4711);
  assert.equal(payload?.hours, 1.5);
  assert.equal(payload?.internalRemarkVerr, "Rueckfrage");
  assert.equal(payload?.zeroHoursReason, "Kulanz");
});

test("a blocked draft yields no payload", () => {
  const row = rowWithProject();
  const draft = { ...draftFromRow(row), projectNumber: null };
  assert.equal(draftToLinePayload(row, draft), null);
});

test("only the four Maringo remark values are accepted", () => {
  assert.equal(isKnownInternalRemark(null), true);
  assert.equal(isKnownInternalRemark("Verrechnen"), true);
  assert.equal(isKnownInternalRemark("Quatsch"), false);
});
