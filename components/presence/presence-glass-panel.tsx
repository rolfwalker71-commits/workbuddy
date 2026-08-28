import { cn } from "@/lib/utils";

/** Frosted nest for copy on isometric fill art. Theme foreground, never forced black. */
export const presenceGlassPanelClassName =
  "rounded-xl bg-white/80 text-foreground shadow-sm ring-1 ring-black/8 backdrop-blur-md dark:bg-zinc-950/75 dark:ring-white/12";

export function PresenceGlassPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(presenceGlassPanelClassName, className)}>{children}</div>;
}
