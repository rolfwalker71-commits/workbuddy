import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyOofPresenceFromEvents,
  eventCoversYmd,
  isAllDayAbwesendSubject,
  isOutlookDayAbsence,
  isOutlookOofShowAs,
  type OutlookAbsenceEvent,
} from "./oof-sync.ts";
import { oofMustNotOverwrite } from "./status.ts";

function ev(
  partial: Partial<OutlookAbsenceEvent> & { subject?: string }
): OutlookAbsenceEvent {
  const date = partial.date || "2026-08-28";
  const isAllDay = partial.isAllDay ?? true;
  return {
    subject: partial.subject ?? "Abwesend",
    start: partial.start ?? `${date}T00:00:00`,
    end: partial.end ?? "2026-08-29T00:00:00",
    date,
    isAllDay,
    showAs: partial.showAs ?? "oof",
  };
}

test("showAs oof/away is OOO; busy is not", () => {
  assert.equal(isOutlookOofShowAs("oof"), true);
  assert.equal(isOutlookOofShowAs("Away"), true);
  assert.equal(isOutlookOofShowAs("busy"), false);
  assert.equal(isOutlookOofShowAs(null), false);
});

test("all-day Abwesend subject matches German templates", () => {
  assert.equal(isAllDayAbwesendSubject("Abwesend"), true);
  assert.equal(isAllDayAbwesendSubject("abwesend: Arzt"), true);
  assert.equal(isAllDayAbwesendSubject("Abwesend — Militär"), true);
  assert.equal(isAllDayAbwesendSubject("Abwesenheit"), false);
  assert.equal(isAllDayAbwesendSubject("Standup"), false);
});

test("day absence is all-day oof/away or all-day Abwesend", () => {
  assert.equal(
    isOutlookDayAbsence({ isAllDay: true, showAs: "oof", subject: "OOO" }),
    true
  );
  assert.equal(
    isOutlookDayAbsence({ isAllDay: true, showAs: "away", subject: "Away" }),
    true
  );
  assert.equal(
    isOutlookDayAbsence({
      isAllDay: true,
      showAs: "busy",
      subject: "Abwesend",
    }),
    true
  );
  assert.equal(
    isOutlookDayAbsence({
      isAllDay: false,
      showAs: "oof",
      subject: "Focus",
    }),
    false
  );
  assert.equal(
    isOutlookDayAbsence({
      isAllDay: true,
      showAs: "busy",
      subject: "Workshop",
    }),
    false
  );
});

test("all-day Graph events cover inclusive start and exclusive end", () => {
  const multi = ev({
    date: "2026-08-26",
    start: "2026-08-26T00:00:00",
    end: "2026-08-29T00:00:00",
  });
  assert.equal(eventCoversYmd(multi, "2026-08-25"), false);
  assert.equal(eventCoversYmd(multi, "2026-08-26"), true);
  assert.equal(eventCoversYmd(multi, "2026-08-28"), true);
  assert.equal(eventCoversYmd(multi, "2026-08-29"), false);
  const sameEnd = ev({
    date: "2026-08-28",
    start: "2026-08-28T00:00:00",
    end: "2026-08-28T00:00:00",
  });
  assert.equal(eventCoversYmd(sameEnd, "2026-08-28"), true);
});

test("oofMustNotOverwrite keeps deputy and self sick/vacation", () => {
  assert.equal(oofMustNotOverwrite(null), false);
  assert.equal(oofMustNotOverwrite({ source: "deputy", status: "sick" }), true);
  assert.equal(oofMustNotOverwrite({ source: "self", status: "sick" }), true);
  assert.equal(oofMustNotOverwrite({ source: "self", status: "vacation" }), true);
  assert.equal(oofMustNotOverwrite({ source: "self", status: "home" }), false);
  assert.equal(oofMustNotOverwrite({ source: "self", status: "office" }), false);
  assert.equal(oofMustNotOverwrite({ source: "oof", status: "absent" }), false);
});

test("applyOofPresenceFromEvents writes absent/oof and respects overwrite rules", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-oof-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser } = await import("../users/queries.ts");
  const {
    getUserDayStatus,
    setDelegatedDayStatus,
    setOwnDayStatus,
  } = await import("./day-status.ts");

  const ben = createAppUser({
    username: "ben",
    email: "ben@example.com",
    displayName: "Ben",
    passwordHash: "hash",
    organization: "CH",
  });
  const anna = createAppUser({
    username: "anna",
    email: "anna@example.com",
    displayName: "Anna",
    passwordHash: "hash",
    organization: "CH",
    canManagePresence: true,
  });

  const oofEvent = ev({ subject: "Abwesend" });
  const applied = applyOofPresenceFromEvents({
    userId: ben.id,
    ymd: "2026-08-28",
    events: [oofEvent],
  });
  assert.equal(applied.action, "applied");
  const written = getUserDayStatus(ben.id, "2026-08-28");
  assert.equal(written?.status, "absent");
  assert.equal(written?.source, "oof");
  assert.equal(written?.note, "Abwesend");

  const cleared = applyOofPresenceFromEvents({
    userId: ben.id,
    ymd: "2026-08-28",
    events: [],
  });
  assert.equal(cleared.action, "cleared");
  assert.equal(getUserDayStatus(ben.id, "2026-08-28"), null);

  setOwnDayStatus({ userId: ben.id, ymd: "2026-08-28", status: "home" });
  assert.equal(
    applyOofPresenceFromEvents({
      userId: ben.id,
      ymd: "2026-08-28",
      events: [oofEvent],
    }).action,
    "applied"
  );
  assert.equal(getUserDayStatus(ben.id, "2026-08-28")?.source, "oof");

  applyOofPresenceFromEvents({
    userId: ben.id,
    ymd: "2026-08-28",
    events: [],
  });
  setOwnDayStatus({ userId: ben.id, ymd: "2026-08-28", status: "sick" });
  const skipSick = applyOofPresenceFromEvents({
    userId: ben.id,
    ymd: "2026-08-28",
    events: [oofEvent],
  });
  assert.equal(skipSick.action, "skipped");
  assert.equal(skipSick.reason, "self-sick");
  assert.equal(getUserDayStatus(ben.id, "2026-08-28")?.source, "self");
  assert.equal(getUserDayStatus(ben.id, "2026-08-28")?.status, "sick");

  applyOofPresenceFromEvents({
    userId: ben.id,
    ymd: "2026-08-27",
    events: [],
  });
  setOwnDayStatus({ userId: ben.id, ymd: "2026-08-27", status: "vacation" });
  const skipVac = applyOofPresenceFromEvents({
    userId: ben.id,
    ymd: "2026-08-27",
    events: [
      ev({
        date: "2026-08-27",
        start: "2026-08-27T00:00:00",
        end: "2026-08-28T00:00:00",
        subject: "Abwesend",
      }),
    ],
  });
  assert.equal(skipVac.action, "skipped");
  assert.equal(getUserDayStatus(ben.id, "2026-08-27")?.status, "vacation");

  setDelegatedDayStatus({
    actor: {
      userId: anna.id,
      isAdmin: false,
      canManagePresence: true,
      organization: "CH",
    },
    targetUserId: ben.id,
    ymd: "2026-08-26",
    status: "sick",
  });
  const skipDeputy = applyOofPresenceFromEvents({
    userId: ben.id,
    ymd: "2026-08-26",
    events: [
      ev({
        date: "2026-08-26",
        start: "2026-08-26T00:00:00",
        end: "2026-08-27T00:00:00",
      }),
    ],
  });
  assert.equal(skipDeputy.action, "skipped");
  assert.equal(skipDeputy.reason, "deputy");
  assert.equal(getUserDayStatus(ben.id, "2026-08-26")?.source, "deputy");
});
