import { cn } from "@/lib/utils";

/** Soft pill track — Kalender | Mail chrome. Never add `h-auto`: it collapses trigger `h-full`. */
export const segmentedTrackClass =
  "inline-flex h-10 min-h-10 w-fit flex-wrap items-stretch rounded-full bg-muted p-0.5";

/**
 * Opt out of the coarse-pointer 44×44 `[data-slot=button]` floor in globals.css.
 * Spread onto every segment trigger (Button or native).
 */
export const segmentedTriggerProps = { "data-segment": "true" } as const;

/**
 * Active/idle segment. Fills the track minus `p-0.5` — not a short text chip.
 * `h-9` is the definite fill inside `h-10 p-0.5` (avoids `h-full` collapsing).
 * `border-0 bg-clip-border` beats Button `border` + `bg-clip-padding` (inset chip).
 */
export function segmentedTriggerClass(active: boolean) {
  return cn(
    "h-9 min-h-0 self-stretch gap-1.5 rounded-full border-0 bg-clip-border px-3 py-0 text-sm font-medium leading-none whitespace-normal",
    active
      ? "bg-card text-foreground shadow-sm"
      : "text-muted-foreground hover:bg-transparent hover:text-foreground"
  );
}
