import assert from "node:assert/strict";
import test from "node:test";
import {
  employeeInSupportGroup,
  filterEmployeesBySupportGroup,
  filterVisibleSupportGroups,
  firstSupportGroupIdForEmployee,
  isHiddenSupportGroupName,
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

test("isHiddenSupportGroupName matches trimmed leading *", () => {
  assert.equal(isHiddenSupportGroupName("*"), true);
  assert.equal(isHiddenSupportGroupName("** ANG DE"), true);
  assert.equal(isHiddenSupportGroupName("** Support Eingang"), true);
  assert.equal(isHiddenSupportGroupName("* Foo"), true);
  assert.equal(isHiddenSupportGroupName("  * intern"), true);
  assert.equal(isHiddenSupportGroupName("Applikation CH"), false);
  assert.equal(isHiddenSupportGroupName("ANG * DE"), false);
  assert.equal(isHiddenSupportGroupName(""), false);
  assert.equal(isHiddenSupportGroupName(null), false);
  assert.equal(isHiddenSupportGroupName(undefined), false);
});

test("filterVisibleSupportGroups hides * names and can keep current", () => {
  const groups = [
    { groupId: 1, description: "Applikation CH" },
    { groupId: 2, description: "** ANG DE" },
    { groupId: 3, description: "* Support Eingang" },
    { groupId: 4, description: "  ** Support NeoDelta Ticketeingang" },
  ];
  assert.deepEqual(
    filterVisibleSupportGroups(groups).map((g) => g.groupId),
    [1]
  );
  assert.deepEqual(
    filterVisibleSupportGroups(groups, 2).map((g) => g.groupId),
    [1, 2]
  );
});

test("firstSupportGroupIdForEmployee uses membership", () => {
  assert.equal(firstSupportGroupIdForEmployee(staff, "m1010"), 100025);
  assert.equal(firstSupportGroupIdForEmployee(staff, "M5020"), 100020);
  assert.equal(firstSupportGroupIdForEmployee(staff, "M9999"), null);
  assert.equal(firstSupportGroupIdForEmployee(staff, ""), null);
});

test("firstSupportGroupIdForEmployee skips hidden groups when listed", () => {
  const mixed = [
    { employeeNumber: "M1010", supportGroupIds: [9, 100025] },
  ];
  assert.equal(
    firstSupportGroupIdForEmployee(mixed, "M1010", {
      groups: [
        { groupId: 9, description: "** ANG DE" },
        { groupId: 100025, description: "Applikation CH" },
      ],
    }),
    100025
  );
  assert.equal(
    firstSupportGroupIdForEmployee(mixed, "M1010", {
      groups: [{ groupId: 9, description: "* intern" }],
    }),
    null
  );
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
