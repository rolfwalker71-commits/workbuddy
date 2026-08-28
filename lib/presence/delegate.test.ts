import assert from "node:assert/strict";
import test from "node:test";
import { canDelegatePresence } from "./delegate.ts";

test("admin may set anyone including users without organization", () => {
  assert.equal(
    canDelegatePresence(
      { isAdmin: true, canManagePresence: false, organization: "CH" },
      { organization: "DE" }
    ),
    true
  );
  assert.equal(
    canDelegatePresence(
      { isAdmin: true, canManagePresence: false, organization: null },
      { organization: null }
    ),
    true
  );
});

test("deputy needs the flag and the same organization", () => {
  const deputy = {
    isAdmin: false,
    canManagePresence: true,
    organization: "CH" as const,
  };
  assert.equal(canDelegatePresence(deputy, { organization: "CH" }), true);
  assert.equal(canDelegatePresence(deputy, { organization: "AT" }), false);
  assert.equal(canDelegatePresence(deputy, { organization: null }), false);
});

test("same organization without the flag is denied", () => {
  assert.equal(
    canDelegatePresence(
      { isAdmin: false, canManagePresence: false, organization: "MX" },
      { organization: "MX" }
    ),
    false
  );
});

test("deputy without own organization cannot act", () => {
  assert.equal(
    canDelegatePresence(
      { isAdmin: false, canManagePresence: true, organization: null },
      { organization: "CH" }
    ),
    false
  );
});
