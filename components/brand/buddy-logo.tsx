import { BRAND } from "@/lib/branding";
import { cn } from "@/lib/utils";

/** WorkBuddy B-Monogramm. */
export function BuddyLogo({
  size = 48,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/workbuddy-logo.svg"
        width={size}
        height={size}
        alt={BRAND.app}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        className="size-full object-contain"
        draggable={false}
      />
    </span>
  );
}

export const WorkBuddyLogo = BuddyLogo;
