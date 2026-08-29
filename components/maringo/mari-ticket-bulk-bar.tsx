"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LABELS, TICKET_EDIT_STATUS_IDS } from "@/lib/mari/status";
import { formatTicketIdList } from "@/lib/mari/ticket-bulk";
import { cn } from "@/lib/utils";

export function MariTicketSelectCheckbox({
  checked,
  indeterminate = false,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate && !checked;
    }
  }, [indeterminate, checked]);

  return (
    <label
      className={cn(
        "flex size-9 shrink-0 cursor-pointer items-center justify-center",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        className="size-4 accent-orange-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        aria-label={label}
      />
    </label>
  );
}

export function MariTicketBulkBar({
  selectedIds,
  busy,
  dueDraft,
  onDueDraftChange,
  onApplyStatus,
  onApplyDue,
  onDelete,
}: {
  selectedIds: number[];
  busy: boolean;
  dueDraft: string;
  onDueDraftChange: (value: string) => void;
  onApplyStatus: (statusId: number) => void;
  onApplyDue: () => void;
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const count = selectedIds.length;
  const idList = formatTicketIdList(selectedIds, 20);

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 bg-orange-50/70 px-3 py-1.5 dark:bg-orange-500/10">
      <p className="mr-1 text-[0.6875rem] font-semibold tabular-nums text-orange-950 dark:text-orange-100">
        {count} ausgewählt
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-[0.6875rem] font-semibold"
              disabled={busy}
            />
          }
        >
          Status
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Status setzen</DropdownMenuLabel>
            {TICKET_EDIT_STATUS_IDS.map((id) => (
              <DropdownMenuItem
                key={id}
                disabled={busy}
                onClick={() => onApplyStatus(id)}
              >
                {STATUS_LABELS[id] || `Status ${id}`}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="inline-flex items-center gap-1.5">
        <Calendar className="size-3.5 text-muted-foreground" aria-hidden />
        <Label htmlFor="bulkDueDate" className="sr-only">
          Stichtag
        </Label>
        <Input
          id="bulkDueDate"
          type="date"
          className="h-7 w-auto border-border/60 bg-background px-2 shadow-none"
          value={dueDraft}
          onChange={(e) => onDueDraftChange(e.target.value)}
          disabled={busy}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[0.6875rem]"
          disabled={busy || !dueDraft}
          onClick={onApplyDue}
        >
          Setzen
        </Button>
      </div>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="ml-auto h-7 text-[0.6875rem]"
        disabled={busy}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-3.5" />
        Löschen
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {count} Ticket{count === 1 ? "" : "s"} löschen?
            </DialogTitle>
            <DialogDescription>
              Unwiderruflich in Maringo löschen, inklusive aller Anhänge.
            </DialogDescription>
          </DialogHeader>
          <p className="break-words text-sm font-medium tabular-nums leading-snug">
            {idList}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
