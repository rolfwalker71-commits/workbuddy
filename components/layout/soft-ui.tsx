import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IconTone } from "@/components/layout/icon-circle";

const chipActive: Record<string, string> = {
  primary: "bg-card text-foreground shadow-sm",
  teal: "bg-card text-[var(--brand-docs)] shadow-sm",
  green: "bg-card text-[var(--brand-finance)] shadow-sm",
  slate: "bg-card text-[var(--brand-settings)] shadow-sm",
};

const chipIdle: Record<string, string> = {
  primary: "bg-transparent text-muted-foreground",
  teal: "bg-transparent text-muted-foreground",
  green: "bg-transparent text-muted-foreground",
  slate: "bg-transparent text-muted-foreground",
};

const fabTone: Record<string, string> = {
  primary: "bg-primary text-primary-foreground shadow-primary/25 hover:bg-primary/90",
  teal: "bg-[var(--brand-docs)] text-white shadow-[var(--brand-docs)]/25 hover:bg-[var(--brand-docs)]/90",
  green:
    "bg-[var(--brand-finance)] text-white shadow-[var(--brand-finance)]/25 hover:bg-[var(--brand-finance)]/90",
  slate:
    "bg-[var(--brand-settings)] text-white shadow-[var(--brand-settings)]/25 hover:bg-[var(--brand-settings)]/90",
};

export function FilterChip({
  active,
  accent = "teal",
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  active?: boolean;
  accent?: IconTone | "primary";
}) {
  const key =
    accent === "teal" ||
    accent === "green" ||
    accent === "slate" ||
    accent === "primary"
      ? accent
      : "primary";

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "h-full min-h-0 shrink-0 gap-1.5 rounded-full px-3 py-0 text-sm font-medium leading-none",
        active ? chipActive[key] : chipIdle[key],
        className
      )}
      {...props}
      data-segment="true"
    >
      {children}
    </Button>
  );
}

export function SoftFab({
  accent = "teal",
  label,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  accent?: IconTone | "primary";
  label?: string;
}) {
  const key =
    accent === "teal" ||
    accent === "green" ||
    accent === "slate" ||
    accent === "primary"
      ? accent
      : "primary";

  return (
    <div className="pointer-events-none fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-1 md:hidden">
      <Button
        type="button"
        size="icon"
        className={cn(
          "pointer-events-auto size-14 rounded-full border-transparent shadow-lg transition-transform active:scale-95",
          fabTone[key],
          className
        )}
        {...props}
      >
        {children}
      </Button>
      {label ? (
        <span className="pointer-events-none text-xs font-medium text-muted-foreground">
          {label}
        </span>
      ) : null}
    </div>
  );
}
