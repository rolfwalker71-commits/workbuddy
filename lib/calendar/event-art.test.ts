import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveEventArt,
  resolveEventArtLeft,
  resolveEventArtRight,
} from "./event-art.ts";

test("birthday and train win on title keywords", () => {
  assert.equal(
    resolveEventArtRight({ title: "Peter Müller hat Geburtstag" }).id,
    "birthday"
  );
  assert.equal(
    resolveEventArtRight({
      title: "Mischa / Lina nach Zürich Bahnhof",
    }).id,
    "train"
  );
});

test("shift codes and day-close ritual match", () => {
  assert.equal(resolveEventArtRight({ title: "F4 · F4 Früh" }).id, "shift");
  assert.equal(
    resolveEventArtRight({ id: "buddy-day-close", title: "Tagesabschluss" }).id,
    "day-close"
  );
});

test("support and standup topics", () => {
  assert.equal(
    resolveEventArtRight({ title: "Maringo Ticket 4421" }).id,
    "support"
  );
  assert.equal(
    resolveEventArtRight({ title: "AI Wochencall" }).id,
    "standup"
  );
  assert.equal(
    resolveEventArtRight({ title: "Mittagessen bei Eltern" }).id,
    "lunch"
  );
});

test("left art is Teams, Meet, or generic meeting", () => {
  assert.equal(
    resolveEventArtLeft({
      title: "AI Wochencall",
      location: "Microsoft Teams Besprechung",
      meetUrl: "https://teams.microsoft.com/l/meetup-join/x",
    })?.id,
    "teams"
  );
  assert.equal(
    resolveEventArtLeft({
      title: "Review",
      meetUrl: "https://meet.google.com/abc-defg-hij",
    })?.id,
    "meet"
  );
  assert.equal(
    resolveEventArtLeft({ title: "Kunden-Besprechung" })?.id,
    "meeting"
  );
  assert.equal(resolveEventArtLeft({ title: "F4 Früh" }), null);
});

test("resolveEventArt combines both sides", () => {
  const art = resolveEventArt({
    title: "Weekly Sync",
    location: "Microsoft Teams",
  });
  assert.equal(art.right.id, "standup");
  assert.equal(art.left?.id, "teams");
});

test("90-day crawl topics: morgencall, cruise, hockey, flight", () => {
  assert.equal(resolveEventArtRight({ title: "Morgencall" }).id, "morgencall");
  assert.equal(
    resolveEventArtRight({ title: "🚢 Kreuzfahrt: Seetag", location: "Atlantik" })
      .id,
    "cruise"
  );
  assert.equal(
    resolveEventArtRight({
      title: "HC Ambri-Piotta - ZSC Lions",
      calendarName: "HC Ambri-Piotta",
    }).id,
    "hockey"
  );
  assert.equal(
    resolveEventArtRight({ title: "✈️ Flug: Flug von Lissabon nach Zürich" }).id,
    "flight"
  );
});

test("90-day crawl topics: hotel, car, vacation, doctor, sport, education", () => {
  assert.equal(
    resolveEventArtRight({ title: "🏨 Hotel: Miami Marriott Biscayne Bay" }).id,
    "hotel"
  );
  assert.equal(
    resolveEventArtRight({ title: "🚗 Mietauto: Mietwagenreservierung" }).id,
    "car"
  );
  assert.equal(resolveEventArtRight({ title: "Ferien" }).id, "vacation");
  assert.equal(
    resolveEventArtRight({ title: "Zahnarzt Valentyna 🪥" }).id,
    "doctor"
  );
  assert.equal(resolveEventArtRight({ title: "Abendlauf 2. Abend 🏃" }).id, "sport");
  assert.equal(
    resolveEventArtRight({
      title: 'ANG - Virtual Classroom - Deep-Dive',
    }).id,
    "education"
  );
});

test("phone is a left format and ANG monthly sync uses standup", () => {
  assert.equal(
    resolveEventArtLeft({ title: "Gynäkologie Termin telefonisch" })?.id,
    "phone"
  );
  assert.equal(
    resolveEventArtRight({ title: "ANG Monatstreffen (GL Schweiz)" }).id,
    "standup"
  );
});
