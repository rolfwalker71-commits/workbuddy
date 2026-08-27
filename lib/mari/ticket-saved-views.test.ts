import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("saved ticket views persist and reject empty handlers", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-views-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");
  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const {
    createMariTicketSavedView,
    listMariTicketSavedViews,
    updateMariTicketSavedView,
    deleteMariTicketSavedView,
    mariTicketSavedViewHref,
    parseMariTicketSavedView,
  } = await import("./ticket-saved-views.ts");

  assert.equal(parseMariTicketSavedView({ label: "x", handledBy: [] }), null);
  const view = createMariTicketSavedView("user:1", {
    label: "Abteilung offen",
    handledBy: ["m1010", "M2055"],
    statuses: [1, 11, 99],
    overdueOnly: false,
    showOnHome: true,
  });
  assert.equal(view.label, "Abteilung offen");
  assert.deepEqual(view.handledBy, ["M1010", "M2055"]);
  assert.ok(!view.statuses.includes(99));
  assert.ok(view.statuses.includes(1));
  assert.equal(
    mariTicketSavedViewHref(view),
    `/maringo?handledBy=M1010%2CM2055&status=${view.statuses.join("%2C")}`
  );

  const listed = listMariTicketSavedViews("user:1");
  assert.equal(listed.length, 1);
  const renamed = updateMariTicketSavedView("user:1", view.id, {
    label: "Review",
  });
  assert.equal(renamed?.label, "Review");
  assert.equal(deleteMariTicketSavedView("user:1", view.id), true);
  assert.equal(listMariTicketSavedViews("user:1").length, 0);
});
