"use client";

import { RotateCcw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { MariEmployeeOption } from "@/lib/mari/tickets";
import type { MariSupportGroupOption } from "@/lib/mari/ticket-meta";
import { parseTicketNumberQuery } from "@/lib/mari/ticket-search-shared";
import {
  filterEmployeesBySupportGroup,
  filterVisibleSupportGroups,
  parseMariSupportGroupId,
} from "@/lib/mari/support-group-staff";

const FILTER_SELECT_CLASS =
  "h-10 min-h-10 w-full rounded-lg border border-border/70 bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

export function MariHandlerMultiPicker({
  groups,
  employees,
  groupId,
  selected,
  defaultHandledBy,
  onGroupChange,
  onSelectedChange,
  onReset,
  disabled,
  extraNumber,
  onExtraNumberChange,
  onTicketNumber,
}: {
  groups: MariSupportGroupOption[];
  employees: MariEmployeeOption[];
  groupId: string;
  selected: string[];
  defaultHandledBy: string;
  onGroupChange: (groupId: string) => void;
  onSelectedChange: (next: string[]) => void;
  onReset?: () => void;
  disabled?: boolean;
  extraNumber: string;
  onExtraNumberChange: (value: string) => void;
  /** Digit-only input is a ticket number, not a Personalnummer. */
  onTicketNumber?: (issueId: number) => void;
}) {
  const parsedGroupId = parseMariSupportGroupId(groupId);
  const visibleGroups = filterVisibleSupportGroups(groups);
  const staff = filterEmployeesBySupportGroup(employees, parsedGroupId);
  const selectedSet = new Set(selected);

  function toggle(emp: string) {
    if (selectedSet.has(emp)) {
      const next = selected.filter((n) => n !== emp);
      if (next.length === 0) return;
      onSelectedChange(next);
      return;
    }
    onSelectedChange([...selected, emp].sort());
  }

  function takeGroup() {
    const nums = staff.map((e) => e.employeeNumber);
    if (nums.length === 0) return;
    onSelectedChange([...new Set([...selected, ...nums])].sort());
  }

  function addExtra() {
    const raw = extraNumber.trim();
    const ticketId = parseTicketNumberQuery(raw);
    if (ticketId != null && onTicketNumber) {
      onTicketNumber(ticketId);
      onExtraNumberChange("");
      return;
    }
    const n = raw.toUpperCase();
    if (!/^[A-Z0-9]{2,20}$/.test(n)) return;
    if (!selectedSet.has(n)) onSelectedChange([...selected, n].sort());
    onExtraNumberChange("");
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end gap-1.5">
        <div className="min-w-[7.5rem] flex-1 space-y-1">
          <Label htmlFor="mari-filter-group" className="sr-only">
            Supportgruppe
          </Label>
          <select
            id="mari-filter-group"
            className={FILTER_SELECT_CLASS}
            value={groupId}
            disabled={disabled}
            onChange={(e) => onGroupChange(e.target.value)}
          >
            <option value="">— Supportgruppe —</option>
            {visibleGroups.map((g) => (
              <option key={g.groupId} value={g.groupId}>
                {g.description}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || parsedGroupId == null || staff.length === 0}
          onClick={takeGroup}
          className="h-10 rounded-lg px-2.5 text-xs font-semibold"
        >
          <Users className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          Gruppe
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                className="h-10 rounded-lg px-2.5 text-xs font-semibold"
              />
            }
          >
            Bearbeiter · {selected.length}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Mehrfachauswahl</DropdownMenuLabel>
              {staff.map((e) => (
                <DropdownMenuCheckboxItem
                  key={e.employeeNumber}
                  checked={selectedSet.has(e.employeeNumber)}
                  onCheckedChange={() => toggle(e.employeeNumber)}
                >
                  {e.matchcode} ({e.employeeNumber})
                  {defaultHandledBy && e.employeeNumber === defaultHandledBy
                    ? " · ich"
                    : ""}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {onReset ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={onReset}
            aria-label="Reset"
            className="size-10"
          >
            <RotateCcw className="size-4" strokeWidth={APP_ICON_STROKE} />
          </Button>
        ) : null}
      </div>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((n) => (
            <Button
              key={n}
              type="button"
              variant="outline"
              size="sm"
              title="Abwählen"
              disabled={disabled || selected.length === 1}
              onClick={() => toggle(n)}
              className="h-auto rounded-full px-2 py-0.5 text-[0.625rem] font-semibold"
            >
              {n}
              {n === defaultHandledBy ? " · ich" : ""}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        <Input
          value={extraNumber}
          onChange={(e) => onExtraNumberChange(e.target.value.toUpperCase())}
          placeholder="Personalnr. (M2055) oder Ticket-Nr."
          className="h-8 text-xs"
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addExtra();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs"
          disabled={disabled}
          onClick={addExtra}
        >
          Dazu
        </Button>
      </div>
    </div>
  );
}
