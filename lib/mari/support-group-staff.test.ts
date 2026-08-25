import assert from "node:assert/strict";
import test from "node:test";
import {
  employeeInSupportGroup,
  filterEmployeesBySupportGroup,
  firstSupportGroupIdForEmployee,
  parseMariSupportGroupId,
  supportGroupIdsByEmployee,
  supportGroupStaffHint,
} from "./support-group-staff.ts";

const staff = [
  { employeeNumber: "M1010", supportGroupIds: [100025] },
  { employeeNumber: "M5020", supportGroupIds: [100020, 100025] },
  { employeeNumber: "M9999", supportGroupIds: [] },
];

test("parseMariSupportGroupId accepts positive ints", () => {
  assert.equal(parseMariSupportGroupId("100025"), 100025);
  assert.equal(parseMariSupportGroupId(100020), 100020);
  assert.equal(parseMariSupportGroupId(""), null);
  assert.equal(parseMariSupportGroupId("0"), null);
  assert.equal(parseMariSupportGroupId("x"), null);
});

test("filterEmployeesBySupportGroup requires a group", () => {
  assert.deepEqual(filterEmployeesBySupportGroup(staff, null), []);
  assert.deepEqual(
    filterEmployeesBySupportGroup(staff, 100025).map((e) => e.employeeNumber),
    ["M1010", "M5020"]
  );
  assert.deepEqual(
    filterEmployeesBySupportGroup(staff, 100020).map((e) => e.employeeNumber),
    ["M5020"]
  );
});

test("employeeInSupportGroup is false without a group", () => {
  assert.equal(employeeInSupportGroup(staff[0]!, null), false);
  assert.equal(employeeInSupportGroup(staff[0]!, 100025), true);
});

test("firstSupportGroupIdForEmployee uses membership", () => {
  assert.equal(firstSupportGroupIdForEmployee(staff, "m1010"), 100025);
  assert.equal(firstSupportGroupIdForEmployee(staff, "M5020"), 100020);
  assert.equal(firstSupportGroupIdForEmployee(staff, "M9999"), null);
  assert.equal(firstSupportGroupIdForEmployee(staff, ""), null);
});

test("supportGroupStaffHint is German", () => {
  assert.match(supportGroupStaffHint(null), /Supportgruppe/);
  assert.match(supportGroupStaffHint(100025), /Keine Mitarbeiter/);
});

test("supportGroupIdsByEmployee dedupes memberships", () => {
  const map = supportGroupIdsByEmployee([
    { groupId: 100025, employeeNumber: "M1010" },
    { groupId: 100020, employeeNumber: "M5020" },
    { groupId: 100025, employeeNumber: "M5020" },
    { groupId: 100025, employeeNumber: "M1010" },
  ]);
  assert.deepEqual(map.get("M1010"), [100025]);
  assert.deepEqual(map.get("M5020"), [100020, 100025]);
});
