import assert from "node:assert/strict";
import test from "node:test";
import { notifyReasonVisibleForModules } from "./prefs.ts";

test("prefs catalog filters reasons by user modules", () => {
  assert.equal(
    notifyReasonVisibleForModules("google_mail_day", ["google"], false),
    true
  );
  assert.equal(
    notifyReasonVisibleForModules("google_mail_day", ["microsoft"], false),
    false
  );
  assert.equal(
    notifyReasonVisibleForModules("evening_digest", ["microsoft"], false),
    true
  );
  assert.equal(
    notifyReasonVisibleForModules("evening_digest", ["maringo"], false),
    false
  );
  assert.equal(
    notifyReasonVisibleForModules("mari_ticket_changed", ["maringo"], false),
    true
  );
  assert.equal(
    notifyReasonVisibleForModules("evening_digest", ["maringo"], true),
    true
  );
});
