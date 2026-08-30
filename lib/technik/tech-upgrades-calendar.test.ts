import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPANY_TECH_UPGRADES_MAILBOX,
  eventMayAffectInternal,
  inferCustomerName,
  inferSystemsAffected,
  mapTechUpgradeEvent,
  normalizeTechUpgradesMailbox,
} from "./tech-upgrades-calendar.ts";

test("normalizeTechUpgradesMailbox defaults to techupgrades@an-group.one", () => {
  assert.equal(normalizeTechUpgradesMailbox(null), COMPANY_TECH_UPGRADES_MAILBOX);
  assert.equal(normalizeTechUpgradesMailbox(""), COMPANY_TECH_UPGRADES_MAILBOX);
  assert.equal(normalizeTechUpgradesMailbox("not-an-email"), COMPANY_TECH_UPGRADES_MAILBOX);
  assert.equal(
    normalizeTechUpgradesMailbox("  TechUpgrades@an-group.one "),
    "techupgrades@an-group.one"
  );
});

test("inferCustomerName prefers location then subject prefix", () => {
  assert.equal(inferCustomerName("Upgrade ERP", "Kanadevia"), "Kanadevia");
  assert.equal(inferCustomerName("Upgrade ERP", "Raum 3"), null);
  assert.equal(
    inferCustomerName("Kunde: Helvetia", null),
    "Helvetia"
  );
  assert.equal(
    inferCustomerName("Kanadevia – Upgrade ERP", null),
    "Kanadevia"
  );
  assert.equal(inferCustomerName("Upgrade Firewall intern", null), null);
});

test("inferSystemsAffected reads categories and keywords", () => {
  assert.deepEqual(
    inferSystemsAffected({
      subject: "Wartung",
      categories: ["ERP"],
    }),
    ["ERP"]
  );
  const systems = inferSystemsAffected({
    subject: "Upgrade VPN",
    bodyPreview: "Maringo und Exchange bleiben offen.",
  });
  assert.ok(systems.includes("VPN"));
  assert.ok(systems.includes("Maringo"));
  assert.ok(systems.includes("Exchange"));
});

test("internal risk is only the word intern in the subject", () => {
  assert.equal(eventMayAffectInternal("BLOCKER: SAP Upgrade Bübchen HANA"), false);
  assert.equal(eventMayAffectInternal("Upgrade VPN"), false);
  assert.equal(eventMayAffectInternal("Upgrade Firewall intern"), true);
  assert.equal(eventMayAffectInternal("Wartung interne Systeme"), true);
  assert.equal(eventMayAffectInternal("Patch intern: Exchange"), true);
  assert.equal(eventMayAffectInternal("Internet-Proxy Upgrade"), false);
  assert.equal(eventMayAffectInternal("International rollout"), false);
});

test("mapTechUpgradeEvent maps a Graph row without writing presence fields", () => {
  const mapped = mapTechUpgradeEvent({
    id: "ev-1",
    subject: "Kanadevia – Upgrade ERP",
    start: { dateTime: "2026-09-03T09:00:00" },
    end: { dateTime: "2026-09-03T11:00:00" },
    isAllDay: false,
    location: { displayName: "Remote" },
    bodyPreview: "VPN und Firewall. Microsoft Teams-Besprechung.",
    categories: [],
    webLink: "https://outlook.office.com/x",
  });
  assert.ok(mapped);
  assert.equal(mapped?.date, "2026-09-03");
  assert.equal(mapped?.customerName, "Remote");
  assert.ok(mapped?.systemsAffected.includes("VPN"));
  assert.equal(mapped?.mayAffectInternal, false);
  assert.equal("status" in (mapped || {}), false);

  const internal = mapTechUpgradeEvent({
    id: "ev-2",
    subject: "Wartung Exchange intern",
    start: { dateTime: "2026-09-04T09:00:00" },
    end: { dateTime: "2026-09-04T11:00:00" },
  });
  assert.equal(internal?.mayAffectInternal, true);
});
