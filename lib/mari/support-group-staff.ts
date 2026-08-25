/** Client-safe helpers: Supportgruppe zuerst, dann Mitarbeiter in der Gruppe. */

export type MariSupportGroupMember = {
  groupId: number;
  employeeNumber: string;
};

export type MariStaffWithGroups = {
  employeeNumber: string;
  supportGroupIds?: number[] | null;
};

export function supportGroupIdsByEmployee(
  memberships: readonly MariSupportGroupMember[]
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const m of memberships) {
    const list = map.get(m.employeeNumber) ?? [];
    if (!list.includes(m.groupId)) list.push(m.groupId);
    map.set(m.employeeNumber, list);
  }
  return map;
}

export function parseMariSupportGroupId(
  raw: string | number | null | undefined
): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function employeeInSupportGroup(
  employee: MariStaffWithGroups,
  groupId: number | null
): boolean {
  if (groupId == null) return false;
  return (employee.supportGroupIds || []).includes(groupId);
}

/** Nur Mitglieder der gewählten Gruppe. Ohne Gruppe: leere Liste. */
export function filterEmployeesBySupportGroup<T extends MariStaffWithGroups>(
  employees: readonly T[],
  groupId: number | null
): T[] {
  if (groupId == null) return [];
  return employees.filter((e) => employeeInSupportGroup(e, groupId));
}

export function firstSupportGroupIdForEmployee(
  employees: readonly MariStaffWithGroups[],
  employeeNumber: string | null | undefined
): number | null {
  const emp = (employeeNumber || "").trim().toUpperCase();
  if (!emp) return null;
  const row = employees.find(
    (e) => e.employeeNumber.trim().toUpperCase() === emp
  );
  const ids = row?.supportGroupIds || [];
  return ids.find((id) => Number.isInteger(id) && id > 0) ?? null;
}

export function supportGroupStaffHint(groupId: number | null): string {
  if (groupId == null) {
    return "Zuerst eine Supportgruppe wählen.";
  }
  return "Keine Mitarbeiter in dieser Supportgruppe.";
}
