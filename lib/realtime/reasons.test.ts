import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_NOTIFY_REASONS,
  LEGACY_NOTIFY_REASONS,
  NOTIFY_REASON_DEFAULT_OFF,
  NOTIFY_REASON_DOMAIN,
  NOTIFY_REASON_LABELS,
  notifyReasonVisibleForModules,
} from "./reason-catalog.ts";
import { isReasonEnabled, mergeNotificationPrefs } from "./prefs-client.ts";
import { notifyReasonDisplayLabel } from "../i18n/display.ts";

test("every reason has a label and a domain", () => {
  for (const reason of ALL_NOTIFY_REASONS) {
    assert.ok(
      NOTIFY_REASON_LABELS[reason],
      `missing NOTIFY_REASON_LABELS entry for ${reason}`
    );
    assert.ok(
      NOTIFY_REASON_DOMAIN[reason],
      `missing NOTIFY_REASON_DOMAIN entry for ${reason}`
    );
  }
});

test("every reason resolves to a translated label in both locales", () => {
  // Fehlt ein NOTIFY_MESSAGE-Eintrag, rendert die UI den rohen Key.
  for (const reason of ALL_NOTIFY_REASONS) {
    for (const locale of ["de", "en"] as const) {
      const label = notifyReasonDisplayLabel(reason, locale);
      assert.ok(label, `${reason}/${locale} produced no label`);
      assert.doesNotMatch(
        label,
        /^notify\./,
        `${reason}/${locale} fell through to the raw message key`
      );
    }
  }
});

test("the client prefs default covers exactly the catalog", () => {
  // prefs-client.ts hielt früher eine handkopierte Reason-Liste; dieser Test
  // hält fest, dass beide Seiten dieselbe Quelle benutzen.
  const prefs = mergeNotificationPrefs(null);
  assert.deepEqual(
    Object.keys(prefs.events).sort(),
    [...ALL_NOTIFY_REASONS].sort()
  );
});

test("module visibility keeps maringo reasons away from microsoft-only users", () => {
  assert.equal(
    notifyReasonVisibleForModules("mari_ticket_changed", ["microsoft"]),
    false
  );
  assert.equal(
    notifyReasonVisibleForModules("mari_ticket_changed", ["maringo"]),
    true
  );
  assert.equal(
    notifyReasonVisibleForModules("mari_ticket_changed", [], true),
    true
  );
});

test("the evening digest needs the microsoft module despite being an app reason", () => {
  assert.equal(NOTIFY_REASON_DOMAIN.evening_digest, "app");
  assert.equal(notifyReasonVisibleForModules("evening_digest", ["maringo"]), false);
  assert.equal(
    notifyReasonVisibleForModules("evening_digest", ["microsoft"]),
    true
  );
  assert.equal(notifyReasonVisibleForModules("app_status", []), true);
});

test("the noisiest ticket reason stays off until it is switched on", () => {
  // "fehlender Schlüssel = an" wäre hier die falsche Vorgabe: jede
  // Feldänderung an jedem Ticket würde ungefragt jeden erreichen.
  assert.ok(NOTIFY_REASON_DEFAULT_OFF.has("mari_ticket_field"));
  const prefs = mergeNotificationPrefs(null);
  assert.equal(isReasonEnabled(prefs, "mari_ticket_field"), false);
  assert.equal(isReasonEnabled(prefs, "mari_ticket_status"), true);

  const opted = mergeNotificationPrefs({ events: { mari_ticket_field: true } });
  assert.equal(isReasonEnabled(opted, "mari_ticket_field"), true);
});

test("switching off the replaced reason keeps its successors quiet", () => {
  // Wer Ticket-Push bewusst abgeschaltet hatte, darf durch die Aufteilung in
  // vier Arten nicht still wieder beschallt werden.
  const migrated = mergeNotificationPrefs({
    events: { mari_ticket_changed: false },
  });
  for (const reason of [
    "mari_ticket_new",
    "mari_ticket_status",
    "mari_ticket_reply",
    "mari_ticket_field",
  ] as const) {
    assert.equal(isReasonEnabled(migrated, reason), false, reason);
  }
});

test("an explicit choice on a successor wins over the legacy intent", () => {
  const explicit = mergeNotificationPrefs({
    events: { mari_ticket_changed: false, mari_ticket_status: true },
  });
  assert.equal(isReasonEnabled(explicit, "mari_ticket_status"), true);
});

test("the replaced reason is hidden from the account catalog", () => {
  assert.ok(LEGACY_NOTIFY_REASONS.has("mari_ticket_changed"));
  // Weiterhin Teil der Union, damit alte Historienzeilen ein Label bekommen.
  assert.ok(ALL_NOTIFY_REASONS.includes("mari_ticket_changed"));
});

test("scopes and quiet hours come with sane defaults", () => {
  const prefs = mergeNotificationPrefs(null);
  assert.deepEqual(prefs.mariTicketScopes, {
    assigned: true,
    allNew: true,
    watched: true,
  });
  assert.equal(prefs.quietHours.enabled, true);
  assert.equal(prefs.quietHours.weekdaysOnly, true);
});

test("a partial scope patch keeps the other scopes untouched", () => {
  const prefs = mergeNotificationPrefs({ mariTicketScopes: { allNew: false } });
  assert.equal(prefs.mariTicketScopes.allNew, false);
  assert.equal(prefs.mariTicketScopes.assigned, true);
  assert.equal(prefs.mariTicketScopes.watched, true);
});
