import { cn } from "@/lib/utils";

/** Soft pill track — Kalender | Mail chrome. */
export const segmentedTrackClass =
  "inline-flex h-10 min-h-10 w-fit flex-wrap items-center rounded-full bg-muted p-0.5";

/** Active/idle segment on a Button or TabsTrigger. Always override Button min-h-11. */
export function segmentedTriggerClass(active: boolean) {
  return cn(
    "h-full min-h-0 gap-1.5 rounded-full px-3 py-0 text-sm font-medium leading-none whitespace-normal",
    active
      ? "bg-card text-foreground shadow-sm"
      : "text-muted-foreground hover:bg-transparent hover:text-foreground"
  );
}
