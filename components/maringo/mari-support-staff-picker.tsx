"use client";

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { MariEmployeeOption } from "@/lib/mari/tickets";
import type { MariSupportGroupOption } from "@/lib/mari/ticket-meta";
import {
  filterEmployeesBySupportGroup,
  filterVisibleSupportGroups,
  parseMariSupportGroupId,
  supportGroupStaffHint,
} from "@/lib/mari/support-group-staff";
import { useT } from "@/components/i18n/locale-provider";

const FORM_SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-[0.8125rem]";

const FILTER_SELECT_CLASS =
  "h-10 min-h-10 w-full rounded-lg border border-border/70 bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

export function MariSupportStaffPicker({
  groups,
  employees,
  groupId,
  employeeNumber,
  onGroupChange,
  onEmployeeChange,
  onReset,
  resetLabel,
  groupLabel,
  employeeLabel,
  groupSelectId,
  employeeSelectId,
  disabled,
  variant = "form",
  hideGroupLabel,
  hideEmployeeLabel,
  emptyGroupLabel,
  emptyEmployeeLabel,
  currentGroupLabel,
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
  onReset?: () => void;
  resetLabel?: string;
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
  /** Assigned group name when the current id is hidden from new picks. */
  currentGroupLabel?: string | null;
  extraEmployeeOptions?: { value: string; label: string }[];
  formatEmployeeOption?: (employee: MariEmployeeOption) => string;
  footer?: ReactNode;
}) {
  const t = useT();
  const resolvedReset = resetLabel ?? t("tickets.reset");
  const resolvedGroupLabel = groupLabel ?? t("tickets.supportGroup");
  const resolvedEmployeeLabel = employeeLabel ?? t("tickets.employee");
  const resolvedEmptyGroup = emptyGroupLabel ?? t("tickets.supportGroupPlaceholder");
  const resolvedEmptyEmployee = emptyEmployeeLabel ?? t("tickets.emptyEmployee");
  const parsedGroupId = parseMariSupportGroupId(groupId);
  const keepAssigned =
    variant === "form" ? parsedGroupId : null;
  const visibleGroups = filterVisibleSupportGroups(groups, keepAssigned);
  const pickerGroups =
    parsedGroupId != null &&
    variant === "form" &&
    !visibleGroups.some((g) => g.groupId === parsedGroupId)
      ? [
          {
            groupId: parsedGroupId,
            description:
              (currentGroupLabel || "").trim() || t("tickets.groupN", { id: parsedGroupId }),
          },
          ...visibleGroups,
        ]
      : visibleGroups;
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
  const isFilterRow = variant === "filter";

  const groupField = (
    <div className={cn(isFilterRow ? "min-w-[7.5rem] flex-1 space-y-1" : "space-y-1")}>
      <Label
        htmlFor={groupSelectId}
        className={hideGroupLabel ? "sr-only" : undefined}
      >
        {resolvedGroupLabel}
      </Label>
      <select
        id={groupSelectId}
        className={selectClass}
        value={groupId}
        disabled={disabled}
        onChange={(e) => onGroupChange(e.target.value)}
      >
        <option value="">{resolvedEmptyGroup}</option>
        {pickerGroups.map((g) => (
          <option key={g.groupId} value={g.groupId}>
            {g.description}
          </option>
        ))}
      </select>
    </div>
  );

  const employeeField = (
    <div className={cn(isFilterRow ? "min-w-[7.5rem] flex-1 space-y-1" : "space-y-1")}>
      <Label
        htmlFor={employeeSelectId}
        className={hideEmployeeLabel ? "sr-only" : undefined}
      >
        {resolvedEmployeeLabel}
      </Label>
      <select
        id={employeeSelectId}
        className={cn(selectClass, employeeDisabled && "opacity-70")}
        value={employeeNumber}
        disabled={employeeDisabled}
        onChange={(e) => onEmployeeChange(e.target.value)}
      >
        <option value="">{resolvedEmptyEmployee}</option>
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
      {!isFilterRow && hint ? (
        <p className="text-[0.625rem] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-1.5">
      {isFilterRow ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {groupField}
          {employeeField}
          {onReset ? (
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={disabled}
              className="h-10 min-h-10 shrink-0 gap-1.5 px-3 text-sm"
            >
              <RotateCcw className="size-4" strokeWidth={APP_ICON_STROKE} />
              {resolvedReset}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {groupField}
          {employeeField}
        </>
      )}
      {isFilterRow && hint ? (
        <p className="text-[0.625rem] text-muted-foreground">{hint}</p>
      ) : null}
      {footer}
    </div>
  );
}
