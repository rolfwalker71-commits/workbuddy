import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarEventToBookDefaults,
  DEFAULT_EVENT_ACTIVITY,
  eventBookHoursFromDuration,
  eventTitleHasInternMarker,
  eventTitleNameCandidates,
  hoursBetweenHm,
  isConfidentCustomerNameHit,
  parseEventTitleTokens,
} from "./event-title-tokens.ts";

test("parseEventTitleTokens reads P and V plus activity after ·", () => {
  const a = parseEventTitleTokens("P600111 · Support Tanner");
  assert.equal(a.projectNumber, "P600111");
  assert.equal(a.contractVisible, null);
  assert.equal(a.cardCode, null);
  assert.equal(a.activity, "Support Tanner");
  assert.equal(a.memo, "P600111 · Support Tanner");
  assert.equal(a.hasTokens, true);

  const b = parseEventTitleTokens("P600111 V60011100 · Workshop");
  assert.equal(b.projectNumber, "P600111");
  assert.equal(b.contractVisible, "V60011100");
  assert.equal(b.activity, "Workshop");
  assert.equal(b.hasTokens, true);
});

test("parseEventTitleTokens accepts | as activity separator", () => {
  const parsed = parseEventTitleTokens("P600111|Daily Call");
  assert.equal(parsed.projectNumber, "P600111");
  assert.equal(parsed.activity, "Daily Call");
});

test("parseEventTitleTokens defaults activity when tokens have no separator", () => {
  const parsed = parseEventTitleTokens("P600111 V60011100 Support vor Ort");
  assert.equal(parsed.projectNumber, "P600111");
  assert.equal(parsed.contractVisible, "V60011100");
  assert.equal(parsed.activity, DEFAULT_EVENT_ACTIVITY);
  assert.equal(parsed.memo, "P600111 V60011100 Support vor Ort");
});

test("parseEventTitleTokens without tokens keeps title as activity", () => {
  const parsed = parseEventTitleTokens("Kundentermin Tanner");
  assert.equal(parsed.hasTokens, false);
  assert.equal(parsed.projectNumber, null);
  assert.equal(parsed.contractVisible, null);
  assert.equal(parsed.activity, "Kundentermin Tanner");
  assert.equal(parsed.memo, "Kundentermin Tanner");
});

test("parseEventTitleTokens reads C-card and strips it from activity", () => {
  const parsed = parseEventTitleTokens("C1471 · Support Filados");
  assert.equal(parsed.cardCode, "C1471");
  assert.equal(parsed.projectNumber, null);
  assert.equal(parsed.activity, "Support Filados");
  assert.equal(parsed.hasTokens, true);
});

test("parseEventTitleTokens keeps P over C for project", () => {
  const parsed = parseEventTitleTokens("P600111 C1471 · Workshop");
  assert.equal(parsed.projectNumber, "P600111");
  assert.equal(parsed.cardCode, "C1471");
  assert.equal(parsed.activity, "Workshop");
});

test("eventTitleNameCandidates keeps Filados and skips stopwords", () => {
  assert.deepEqual(eventTitleNameCandidates("Filados Daily Call"), ["Filados"]);
  assert.deepEqual(eventTitleNameCandidates("C1471 · Support"), []);
  assert.deepEqual(eventTitleNameCandidates("ENSO Test"), ["ENSO"]);
});

test("eventTitleNameCandidates prefers Firma after Person - Firma", () => {
  assert.deepEqual(eventTitleNameCandidates("Hr. Brensteiner - Montara"), [
    "Montara",
    "Brensteiner",
  ]);
  assert.deepEqual(
    eventTitleNameCandidates("Frau Korander-Platzer - IWT"),
    ["IWT", "Korander", "Platzer"]
  );
});

test("parseEventTitleTokens reads bare numeric project numbers", () => {
  const parsed = parseEventTitleTokens("200386 - Test");
  assert.equal(parsed.projectNumber, "200386");
  assert.equal(parsed.hasTokens, true);
});

test("eventTitleNameCandidates prefers leading customer before arrow", () => {
  assert.deepEqual(
    eventTitleNameCandidates(
      "Kanadevia → Technische Prüfung / Anpassung Druckspracheinstellung 243 Dublin"
    ),
    ["Kanadevia", "Technische", "Prüfung"]
  );
});

test("eventTitleNameCandidates reads (Name) and (intern)", () => {
  assert.equal(eventTitleHasInternMarker("Daily ANG (intern)"), true);
  assert.equal(eventTitleHasInternMarker("Kanadevia Workshop"), false);
  assert.deepEqual(eventTitleNameCandidates("Daily ANG (intern)"), []);
  assert.deepEqual(eventTitleNameCandidates("(Kanadevia) Workshop Dublin"), [
    "Kanadevia",
    "Dublin",
  ]);
});

test("isConfidentCustomerNameHit is exact or starts-with only", () => {
  assert.equal(isConfidentCustomerNameHit("Filados", "Filados AG"), true);
  assert.equal(isConfidentCustomerNameHit("ENSO", "ENSO AG"), true);
  assert.equal(isConfidentCustomerNameHit("ENSO", "Hitachi Zosen Inova AG"), false);
  assert.equal(isConfidentCustomerNameHit("fil", "Filados AG"), false);
  assert.equal(isConfidentCustomerNameHit("ados", "Filados AG"), false);
  assert.equal(isConfidentCustomerNameHit("IWT", "IWT GmbH"), true);
  assert.equal(isConfidentCustomerNameHit("Montara", "Gruppe Montara AG"), true);
});

test("parseEventTitleTokens empty subject is Besprechung", () => {
  const parsed = parseEventTitleTokens("   ");
  assert.equal(parsed.activity, DEFAULT_EVENT_ACTIVITY);
  assert.equal(parsed.hasTokens, false);
});

test("hoursBetweenHm rounds to quarter hours", () => {
  assert.equal(hoursBetweenHm("09:00", "10:00"), 1);
  assert.equal(hoursBetweenHm("09:00", "09:40"), 0.75);
  assert.equal(hoursBetweenHm("09:00", "09:10"), 0.25);
  assert.equal(hoursBetweenHm("10:00", "09:00"), null);
});

test("eventBookHoursFromDuration falls back to 0.25 and clamps", () => {
  assert.equal(eventBookHoursFromDuration("09:00", "10:30"), 1.5);
  assert.equal(eventBookHoursFromDuration(null, null), 0.25);
  assert.equal(eventBookHoursFromDuration("00:00", "23:59"), 24);
});

test("calendarEventToBookDefaults uses duration hours and title tokens", () => {
  const d = calendarEventToBookDefaults({
    title: "P600111 V60011100 · Workshop",
    date: "2026-08-29",
    startHm: "13:00",
    endHm: "14:15",
  });
  assert.equal(d.projectNumber, "P600111");
  assert.equal(d.contractVisible, "V60011100");
  assert.equal(d.activity, "Workshop");
  assert.equal(d.memoText, "P600111 V60011100 · Workshop");
  assert.equal(d.hours, 1.25);
  assert.equal(d.hoursBillable, 1.25);
  assert.equal(d.hours, d.hoursBillable);
  assert.equal(d.issueId, null);
});

test("calendarEventToBookDefaults keeps ticket project/contract over tokens", () => {
  const d = calendarEventToBookDefaults({
    title: "P600111 · Ignorieren",
    date: "2026-08-29",
    startHm: "09:00",
    endHm: "10:00",
    ticket: {
      issueId: 42,
      projectNumber: "P200000",
      projectLabel: "Werk (P200000)",
      contractId: 99,
      contractPositionId: 3,
      activity: "Ticket-Betreff",
    },
  });
  assert.equal(d.issueId, 42);
  assert.equal(d.projectNumber, "P200000");
  assert.equal(d.contractId, 99);
  assert.equal(d.contractPositionId, 3);
  assert.equal(d.contractVisible, null);
  assert.equal(d.activity, "Ticket-Betreff");
  assert.equal(d.hours, 1);
  assert.equal(d.hoursBillable, 1);
  assert.equal(d.billable, true);
  assert.equal(d.memoText, "P600111 · Ignorieren");
});

test("calendarEventToBookDefaults prefers stored pin over title tokens", () => {
  const d = calendarEventToBookDefaults({
    title: "P600111 · Ignorieren",
    date: "2026-08-29",
    startHm: "09:00",
    endHm: "10:00",
    stored: {
      projectNumber: "P100",
      projectLabel: "Infra Intern (P100)",
      contractId: 0,
      source: "pinned",
      contractOptional: true,
    },
    contractOptional: true,
  });
  assert.equal(d.projectNumber, "P100");
  assert.equal(d.projectLabel, "Infra Intern (P100)");
  assert.equal(d.contractId, 0);
  assert.equal(d.contractOptional, true);
  assert.equal(d.hours, 1);
});

test("calendarEventToBookDefaults prefers stamp memo over title", () => {
  const d = calendarEventToBookDefaults({
    title: "P600111 · Workshop",
    date: "2026-08-29",
    startHm: "09:00",
    endHm: "09:30",
    memo: "Vor Ort bei Tanner, Parkplatz hinten",
  });
  assert.equal(d.memoText, "Vor Ort bei Tanner, Parkplatz hinten");
  assert.equal(d.hours, 0.5);
  assert.equal(d.hoursBillable, 0.5);
});
