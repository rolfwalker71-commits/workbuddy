import assert from "node:assert/strict";
import test from "node:test";
import {
  MAIL_TICKET_IMPORT_CATEGORY,
  mergeOutlookCategory,
} from "@/lib/microsoft/mail-ticket-stamp";

test("mergeOutlookCategory appends without dropping others", () => {
  const r = mergeOutlookCategory(["Wichtig", "Kunde"], MAIL_TICKET_IMPORT_CATEGORY);
  assert.deepEqual(r.categories, [
    "Wichtig",
    "Kunde",
    "Import als Ticket",
  ]);
  assert.equal(r.added, true);
});

test("mergeOutlookCategory is idempotent", () => {
  const r = mergeOutlookCategory(
    ["Import als Ticket", "Wichtig"],
    MAIL_TICKET_IMPORT_CATEGORY
  );
  assert.deepEqual(r.categories, ["Import als Ticket", "Wichtig"]);
  assert.equal(r.added, false);
});
