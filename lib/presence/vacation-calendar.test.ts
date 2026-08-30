import assert from "node:assert/strict";
import test from "node:test";
import { vacationCalMustNotOverwrite } from "./status.ts";
import {
  COMPANY_VACATION_MAILBOX,
  normalizeVacationMailbox,
  userIdsOnVacationForDay,
  vacationEventAssigneeEmails,
} from "./vacation-calendar.ts";

test("normalizeVacationMailbox defaults to urlaubskalender@an-group.one", () => {
  assert.equal(normalizeVacationMailbox(null), COMPANY_VACATION_MAILBOX);
  assert.equal(normalizeVacationMailbox("  "), COMPANY_VACATION_MAILBOX);
  assert.equal(
    normalizeVacationMailbox("Urlaubskalender@AN-Group.one"),
    COMPANY_VACATION_MAILBOX
  );
});

test("vacation assignees prefer attendees over organizer and skip mailbox", () => {
  assert.deepEqual(
    vacationEventAssigneeEmails(
      {
        organizerEmail: "hr@an-group.one",
        attendeeEmails: [
          "rolf.walker@an-group.one",
          "urlaubskalender@an-group.one",
        ],
      },
      COMPANY_VACATION_MAILBOX
    ),
    ["rolf.walker@an-group.one"]
  );
  assert.deepEqual(
    vacationEventAssigneeEmails(
      { organizerEmail: "ada@an-group.one", attendeeEmails: [] },
      COMPANY_VACATION_MAILBOX
    ),
    ["ada@an-group.one"]
  );
  assert.deepEqual(
    vacationEventAssigneeEmails(
      {
        organizerEmail: COMPANY_VACATION_MAILBOX,
        attendeeEmails: [COMPANY_VACATION_MAILBOX],
      },
      COMPANY_VACATION_MAILBOX
    ),
    []
  );
});

test("userIdsOnVacationForDay maps emails on all-day covering entries", () => {
  const userIdByEmail = new Map([
    ["rolf.walker@an-group.one", 7],
    ["ada@an-group.one", 8],
  ]);
  const ids = userIdsOnVacationForDay({
    ymd: "2026-08-26",
    mailbox: COMPANY_VACATION_MAILBOX,
    userIdByEmail,
    events: [
      {
        isAllDay: true,
        date: "2026-08-26",
        start: "2026-08-26T00:00:00",
        end: "2026-08-29T00:00:00",
        subject: "Rolf Walker",
        assigneeEmails: ["rolf.walker@an-group.one"],
      },
      {
        isAllDay: false,
        date: "2026-08-26",
        start: "2026-08-26T09:00:00",
        end: "2026-08-26T10:00:00",
        subject: "Ignore timed",
        assigneeEmails: ["ada@an-group.one"],
      },
    ],
  });
  assert.deepEqual([...ids], [7]);
});

test("vacationCalMustNotOverwrite keeps deputy and self sick/vacation", () => {
  assert.equal(vacationCalMustNotOverwrite(null), false);
  assert.equal(
    vacationCalMustNotOverwrite({ source: "deputy", status: "office" }),
    true
  );
  assert.equal(
    vacationCalMustNotOverwrite({ source: "self", status: "sick" }),
    true
  );
  assert.equal(
    vacationCalMustNotOverwrite({ source: "self", status: "vacation" }),
    true
  );
  assert.equal(
    vacationCalMustNotOverwrite({ source: "self", status: "home" }),
    false
  );
  assert.equal(
    vacationCalMustNotOverwrite({ source: "oof", status: "absent" }),
    false
  );
});
