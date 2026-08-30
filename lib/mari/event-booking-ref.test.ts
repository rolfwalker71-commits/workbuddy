import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMeetingKind,
  bookingRefFromRecognition,
  classifyEventMeetingKind,
  eventBookingSeriesKey,
  formatBookBodyMarker,
  formatBookedHoursLine,
  formatEventBookingLine,
  parseBookRefFromBody,
  parseBookRefFromCategories,
  pickPreferredBookingRef,
} from "./event-booking-ref.ts";

test("eventBookingSeriesKey prefers seriesMasterId then iCalUId", () => {
  assert.equal(
    eventBookingSeriesKey({
      eventId: "occurrence-9",
      seriesMasterId: "master-1",
      iCalUId: "UID-AAA",
    }),
    "master-1"
  );
  assert.equal(
    eventBookingSeriesKey({
      eventId: "occurrence-9",
      seriesMasterId: null,
      iCalUId: "UID-AAA",
    }),
    "ical:UID-AAA"
  );
  assert.equal(
    eventBookingSeriesKey({ eventId: "single-1" }),
    "single-1"
  );
});

test("classifyEventMeetingKind: colleagues only is internal", () => {
  assert.equal(
    classifyEventMeetingKind([
      "rolf.walker@an-group.one",
      "ada@an-group.one",
    ]),
    "internal"
  );
  assert.equal(classifyEventMeetingKind([]), "internal");
});

test("classifyEventMeetingKind: any external is mixed", () => {
  assert.equal(
    classifyEventMeetingKind([
      "rolf.walker@an-group.one",
      "info@filados.ch",
    ]),
    "mixed"
  );
});

test("internal-only does not use colleague attendee hits", () => {
  const ref = bookingRefFromRecognition({
    meetingKind: "internal",
    title: {
      cardCode: null,
      projectNumber: null,
      contractVisible: null,
      suggestions: [],
      prefill: {
        projectNumber: null,
        projectLabel: null,
        contractId: null,
      },
    },
    attendees: [
      {
        cardCode: "C9999",
        name: "Hitachi Zosen Inova AG",
        projectNumber: "P1",
        projectLabel: "Hitachi",
        contractId: 12,
      },
    ],
  });
  assert.ok(ref);
  assert.equal(ref.meetingKind, "internal");
  assert.equal(ref.contractOptional, true);
  assert.equal(ref.cardCode, null);
  assert.equal(formatEventBookingLine(ref), "Intern · kein Vertrag");
});

test("title name wins over attendees; same card can fill project", () => {
  const ref = bookingRefFromRecognition({
    meetingKind: "mixed",
    title: {
      cardCode: null,
      projectNumber: null,
      contractVisible: null,
      suggestions: [
        {
          cardCode: "C1471",
          name: "Filados",
          projectNumber: null,
          projectLabel: null,
          contractId: null,
        },
      ],
      prefill: {
        projectNumber: null,
        projectLabel: null,
        contractId: null,
      },
    },
    attendees: [
      {
        cardCode: "C1471",
        name: "Filados AG",
        projectNumber: "P600111",
        projectLabel: "Filados AG",
        contractId: 88,
      },
    ],
  });
  assert.ok(ref);
  assert.equal(ref.meetingKind, "mixed");
  assert.equal(ref.customerName, "Filados");
  assert.equal(ref.projectNumber, "P600111");
  assert.equal(ref.contractId, 88);
  assert.equal(formatEventBookingLine(ref), "Filados · P600111 · 88");
});

test("titleForceIntern skips attendee customer even when mixed", () => {
  const ref = bookingRefFromRecognition({
    meetingKind: "mixed",
    titleForceIntern: true,
    title: {
      cardCode: null,
      projectNumber: null,
      contractVisible: null,
      suggestions: [],
      prefill: {
        projectNumber: null,
        projectLabel: null,
        contractId: null,
      },
    },
    attendees: [
      {
        cardCode: "C1471",
        name: "Filados AG",
        projectNumber: "P600111",
        projectLabel: "Filados AG",
        contractId: 88,
      },
    ],
  });
  assert.ok(ref);
  assert.equal(ref.meetingKind, "internal");
  assert.equal(formatEventBookingLine(ref), "Intern · kein Vertrag");
});

test("attendees used only when title has no customer", () => {
  const ref = bookingRefFromRecognition({
    meetingKind: "mixed",
    title: {
      cardCode: null,
      projectNumber: null,
      contractVisible: null,
      suggestions: [],
      prefill: {
        projectNumber: null,
        projectLabel: null,
        contractId: null,
      },
    },
    attendees: [
      {
        cardCode: "C1471",
        name: "Filados AG",
        projectNumber: "P600111",
        projectLabel: "Filados AG",
        contractId: 88,
      },
    ],
  });
  assert.ok(ref);
  assert.equal(ref.customerName, "Filados AG");
  assert.equal(ref.projectNumber, "P600111");
});

test("title C/P/V wins over attendees", () => {
  const ref = bookingRefFromRecognition({
    meetingKind: "mixed",
    title: {
      cardCode: "C1471",
      projectNumber: "P600111",
      contractVisible: "V60011100",
      suggestions: [
        {
          cardCode: "C1471",
          name: "Filados AG",
          projectNumber: "P600111",
          projectLabel: "Filados AG",
          contractId: 1,
        },
      ],
      prefill: {
        projectNumber: "P600111",
        projectLabel: "Filados AG",
        contractId: null,
      },
    },
    attendees: [
      {
        cardCode: "C9",
        name: "Other",
        projectNumber: "P9",
        projectLabel: "Other",
        contractId: 9,
      },
    ],
  });
  assert.ok(ref);
  assert.equal(ref.projectNumber, "P600111");
  assert.equal(ref.cardCode, "C1471");
  assert.equal(ref.contractVisible, "V60011100");
});

test("title name Filados without attendees still shows Kunde", () => {
  const ref = bookingRefFromRecognition({
    meetingKind: "mixed",
    title: {
      cardCode: null,
      projectNumber: null,
      contractVisible: null,
      suggestions: [
        {
          cardCode: "C1471",
          name: "Filados",
          projectNumber: null,
          projectLabel: null,
          contractId: null,
        },
      ],
      prefill: {
        projectNumber: null,
        projectLabel: null,
        contractId: null,
      },
    },
    attendees: [],
  });
  assert.ok(ref);
  assert.equal(formatEventBookingLine(ref), "Filados");
});

test("formatBookedHoursLine prefixes recognition", () => {
  assert.equal(formatBookedHoursLine(null), "Zeiterfassung");
  assert.equal(
    formatBookedHoursLine({
      cardCode: "C1471",
      customerName: "Filados AG",
      projectNumber: "P600111",
      projectLabel: "Support",
      contractId: 88,
      contractVisible: "V60011100",
      source: "pinned",
      meetingKind: "mixed",
      contractOptional: false,
    }),
    "Zeiterfassung: Filados AG · P600111 · V60011100"
  );
});

test("ticket beats guess; pin beats ticket", () => {
  const guess = bookingRefFromRecognition({
    meetingKind: "mixed",
    title: {
      cardCode: null,
      projectNumber: "P1",
      contractVisible: null,
      suggestions: [],
      prefill: {
        projectNumber: "P1",
        projectLabel: "Guess",
        contractId: null,
      },
    },
    attendees: [],
  });
  const ticket = applyMeetingKind(
    {
      cardCode: "C1",
      customerName: "Ticketkunde",
      projectNumber: "P2",
      projectLabel: "Ticket",
      contractId: 5,
      contractVisible: null,
      source: "ticket",
      meetingKind: "mixed",
      contractOptional: false,
    },
    "mixed"
  );
  const pin = applyMeetingKind(
    {
      cardCode: "C1",
      customerName: "Pin",
      projectNumber: "P3",
      projectLabel: "Pin",
      contractId: 0,
      contractVisible: null,
      source: "pinned",
      meetingKind: "mixed",
      contractOptional: false,
    },
    "mixed"
  );
  assert.equal(pickPreferredBookingRef(guess, ticket)?.source, "ticket");
  assert.equal(pickPreferredBookingRef(guess, ticket, pin)?.source, "pinned");
});

test("Graph body and category markers round-trip codes", () => {
  const marker = formatBookBodyMarker({
    cardCode: "C1471",
    customerName: "Filados",
    projectNumber: "P600111",
    projectLabel: null,
    contractId: 88,
    contractVisible: "V60011100",
    source: "pinned",
    meetingKind: "mixed",
    contractOptional: false,
  });
  const fromBody = parseBookRefFromBody(`Notes\n\n${marker}`);
  assert.equal(fromBody?.cardCode, "C1471");
  assert.equal(fromBody?.projectNumber, "P600111");
  assert.equal(fromBody?.contractId, 88);
  assert.equal(fromBody?.contractVisible, "V60011100");

  const fromCat = parseBookRefFromCategories([
    "WorkBuddy/Book",
    "WorkBuddy/KPV:C1471:P600111:88",
  ]);
  assert.equal(fromCat?.cardCode, "C1471");
  assert.equal(fromCat?.projectNumber, "P600111");
  assert.equal(fromCat?.contractId, 88);
});
