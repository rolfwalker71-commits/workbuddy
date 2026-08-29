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
import { statusDisplayLabel } from "@/lib/i18n/display";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/components/i18n/locale-provider";

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
  const t = useT();
  const { locale } = useLocale();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const count = selectedIds.length;
  const idList = formatTicketIdList(selectedIds, 20);

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 bg-orange-50/70 px-3 py-1.5 dark:bg-orange-500/10">
      <p className="mr-1 text-[0.6875rem] font-semibold tabular-nums text-orange-950 dark:text-orange-100">
        {t("tickets.selectedCount", { count })}
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
          {t("tickets.status")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("tickets.setStatus")}</DropdownMenuLabel>
            {TICKET_EDIT_STATUS_IDS.map((id) => (
              <DropdownMenuItem
                key={id}
                disabled={busy}
                onClick={() => onApplyStatus(id)}
              >
                {statusDisplayLabel(id, locale, STATUS_LABELS[id])}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="inline-flex items-center gap-1.5">
        <Calendar className="size-3.5 text-muted-foreground" aria-hidden />
        <Label htmlFor="bulkDueDate" className="sr-only">
          {t("tickets.dueDate")}
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
          {t("tickets.setDue")}
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
        {t("common.delete")}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {count === 1
                ? t("tickets.confirmDeleteN", { count })
                : t("tickets.confirmDeleteNPlural", { count })}
            </DialogTitle>
            <DialogDescription>
              {t("tickets.confirmDeleteDesc")}
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
              {t("common.cancel")}
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
              {t("tickets.deleteForever")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
