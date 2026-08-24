import { cn } from "@/lib/utils";

/** ANG wordmark — only for the app header (sidebar + mobile bar). */
export function AngHeaderLogo({
  className,
  compact = false,
  collapsed = false,
  priority = false,
}: {
  className?: string;
  compact?: boolean;
  collapsed?: boolean;
  priority?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        collapsed
          ? "h-5 w-10"
          : compact
            ? "h-7 w-[4.75rem]"
            : "h-8 w-[5.5rem]",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/ang-logo.png"
        width={300}
        height={110}
        alt="ANG"
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        className="size-full object-contain object-left"
        draggable={false}
      />
    </span>
  );
}
