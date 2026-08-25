"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { MariEmployeeOption } from "@/lib/mari/tickets";
import type { MariSupportGroupOption } from "@/lib/mari/ticket-meta";
import {
  filterEmployeesBySupportGroup,
  parseMariSupportGroupId,
  supportGroupStaffHint,
} from "@/lib/mari/support-group-staff";

const FORM_SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-[0.8125rem]";

const FILTER_SELECT_CLASS =
  "h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

export function MariSupportStaffPicker({
  groups,
  employees,
  groupId,
  employeeNumber,
  onGroupChange,
  onEmployeeChange,
  groupLabel = "Supportgruppe",
  employeeLabel = "Mitarbeiter",
  groupSelectId,
  employeeSelectId,
  disabled,
  variant = "form",
  hideGroupLabel,
  hideEmployeeLabel,
  emptyGroupLabel = "— Supportgruppe —",
  emptyEmployeeLabel = "— wählen —",
  extraEmployeeOptions,
  formatEmployeeOption,
  footer,
}: {
  groups: MariSupportGroupOption[];
  employees: MariEmployeeOption[];
  groupId: string;
  employeeNumber: string;
  onGroupChange: (groupId: string) => void;
  onEmployeeChange: (employeeNumber: string) => void;
  groupLabel?: string;
  employeeLabel?: string;
  groupSelectId: string;
  employeeSelectId: string;
  disabled?: boolean;
  variant?: "form" | "filter";
  hideGroupLabel?: boolean;
  hideEmployeeLabel?: boolean;
  emptyGroupLabel?: string;
  emptyEmployeeLabel?: string;
  extraEmployeeOptions?: { value: string; label: string }[];
  formatEmployeeOption?: (employee: MariEmployeeOption) => string;
  footer?: ReactNode;
}) {
  const parsedGroupId = parseMariSupportGroupId(groupId);
  const staff = filterEmployeesBySupportGroup(employees, parsedGroupId);
  const hasExtra = Boolean(extraEmployeeOptions?.length);
  const employeeDisabled =
    disabled || (parsedGroupId == null && !hasExtra && !employeeNumber);
  const selectClass =
    variant === "filter" ? FILTER_SELECT_CLASS : FORM_SELECT_CLASS;
  const hint =
    staff.length === 0 &&
    !extraEmployeeOptions?.some((o) => o.value && o.value !== "__manual__")
      ? supportGroupStaffHint(parsedGroupId)
      : null;

  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        <Label
          htmlFor={groupSelectId}
          className={hideGroupLabel ? "sr-only" : undefined}
        >
          {groupLabel}
        </Label>
        <select
          id={groupSelectId}
          className={selectClass}
          value={groupId}
          disabled={disabled}
          onChange={(e) => onGroupChange(e.target.value)}
        >
          <option value="">{emptyGroupLabel}</option>
          {groups.map((g) => (
            <option key={g.groupId} value={g.groupId}>
              {g.description}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label
          htmlFor={employeeSelectId}
          className={hideEmployeeLabel ? "sr-only" : undefined}
        >
          {employeeLabel}
        </Label>
        <select
          id={employeeSelectId}
          className={cn(selectClass, employeeDisabled && "opacity-70")}
          value={employeeNumber}
          disabled={employeeDisabled}
          onChange={(e) => onEmployeeChange(e.target.value)}
        >
          <option value="">{emptyEmployeeLabel}</option>
          {staff.map((e) => (
            <option key={e.employeeNumber} value={e.employeeNumber}>
              {formatEmployeeOption
                ? formatEmployeeOption(e)
                : `${e.matchcode} (${e.employeeNumber})`}
            </option>
          ))}
          {extraEmployeeOptions?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {hint ? (
          <p className="text-[0.625rem] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {footer}
    </div>
  );
}
