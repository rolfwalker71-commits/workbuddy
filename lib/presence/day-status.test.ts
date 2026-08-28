import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("own day writes and deputy blocks self overwrite", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-presence-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser, getAppUserPublic } = await import(
    "../users/queries.ts"
  );
  const {
    setOwnDayStatus,
    setOwnWeekStatus,
    setDelegatedDayStatus,
    listPresenceToday,
  } = await import("./day-status.ts");

  const anna = createAppUser({
    username: "anna",
    email: "anna@example.com",
    displayName: "Anna",
    passwordHash: "hash",
    organization: "CH",
    canManagePresence: true,
  });
  const ben = createAppUser({
    username: "ben",
    email: "ben@example.com",
    displayName: "Ben",
    passwordHash: "hash",
    organization: "CH",
  });
  createAppUser({
    username: "carla",
    email: "carla@example.com",
    displayName: "Carla",
    passwordHash: "hash",
    organization: "AT",
  });

  const publicAnna = getAppUserPublic(anna.id)!;
  assert.equal(publicAnna.organization, "CH");
  assert.equal(publicAnna.canManagePresence, true);
  assert.equal(publicAnna.can_manage_presence, 1);

  updateAppUser(ben.id, { canManagePresence: false, organization: "CH" });

  const self = setOwnDayStatus({
    userId: ben.id,
    ymd: "2026-08-28",
    status: "home",
  });
  assert.equal(self.source, "self");
  assert.equal(self.status, "home");

  const delegated = setDelegatedDayStatus({
    actor: {
      userId: anna.id,
      isAdmin: false,
      canManagePresence: true,
      organization: "CH",
    },
    targetUserId: ben.id,
    ymd: "2026-08-28",
    status: "sick",
  });
  assert.equal(delegated.source, "deputy");
  assert.equal(delegated.status, "sick");

  assert.throws(
    () =>
      setOwnDayStatus({
        userId: ben.id,
        ymd: "2026-08-28",
        status: "office",
      }),
    /Stellvertretung/
  );

  assert.throws(
    () =>
      setDelegatedDayStatus({
        actor: {
          userId: anna.id,
          isAdmin: false,
          canManagePresence: true,
          organization: "CH",
        },
        targetUserId: ben.id + 1000,
        ymd: "2026-08-28",
        status: "sick",
      }),
    /nicht gefunden/
  );

  const week = setOwnWeekStatus({
    userId: ben.id,
    fromYmd: "2026-08-24",
    days: [
      { ymd: "2026-08-24", status: "office" },
      { ymd: "2026-08-28", status: "office" },
    ],
  });
  assert.equal(week.fromYmd, "2026-08-24");
  assert.deepEqual(week.skipped, [{ ymd: "2026-08-28", reason: "protected" }]);
  assert.equal(
    week.days.find((d) => d.ymd === "2026-08-24")?.status,
    "office"
  );
  assert.equal(week.days.find((d) => d.ymd === "2026-08-28")?.status, "sick");

  const today = listPresenceToday({
    ymd: "2026-08-28",
    organization: "CH",
    viewerUserId: ben.id,
  });
  assert.equal(today.people.length, 2);
  assert.equal(today.self?.status, "sick");
  assert.equal(today.self?.source, "deputy");
});

test("env-admin is omitted from the team roster; org admins stay", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-presence-admin-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser } = await import("../users/queries.ts");
  const { listPresenceToday, setDelegatedDayStatus } = await import(
    "./day-status.ts"
  );

  const admin = createAppUser({
    username: "admin",
    email: "admin@workbuddy.local",
    displayName: "admin",
    passwordHash: "hash",
    active: true,
    isAdmin: true,
  });
  const rolf = createAppUser({
    username: "rolf",
    email: "rolf@example.com",
    displayName: "Rolf Walker",
    passwordHash: "hash",
    active: true,
    isAdmin: true,
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

  const allOrgs = listPresenceToday({
    ymd: "2026-08-28",
    viewerUserId: anna.id,
  });
  assert.deepEqual(
    allOrgs.people.map((p) => p.displayName).sort(),
    ["Anna", "Rolf Walker"]
  );
  assert.equal(
    allOrgs.people.some((p) => p.userId === admin.id),
    false
  );

  const asAdmin = listPresenceToday({
    ymd: "2026-08-28",
    viewerUserId: admin.id,
  });
  assert.equal(asAdmin.self?.userId, admin.id);
  assert.equal(
    asAdmin.people.some((p) => p.userId === admin.id),
    false
  );

  assert.throws(
    () =>
      setDelegatedDayStatus({
        actor: {
          userId: rolf.id,
          isAdmin: true,
          canManagePresence: false,
          organization: "CH",
        },
        targetUserId: admin.id,
        ymd: "2026-08-28",
        status: "office",
      }),
    /kein Teammitglied/
  );
});
