import { cn } from "@/lib/utils";
import { presenceIsoArt } from "@/lib/presence/art";
import type { PresenceStatus } from "@/lib/presence/status";

export function PresenceIsoArt({
  status,
  variant,
  className,
}: {
  status: PresenceStatus | null | undefined;
  variant: "hero" | "watermark" | "thumb";
  className?: string;
}) {
  const art = presenceIsoArt(status);
  if (!art) return null;

  if (variant === "thumb") {
    return (
      <img
        src={art.src}
        alt=""
        aria-hidden
        className={cn("h-8 w-8 shrink-0 object-contain", className)}
      />
    );
  }

  if (variant === "hero") {
    return (
      <img
        src={art.src}
        alt=""
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 right-1 h-[4.5rem] w-[4.5rem] -translate-y-1/2 object-contain sm:right-1.5 sm:h-[5.25rem] sm:w-[5.25rem]",
          className
        )}
      />
    );
  }

  return (
    <img
      src={art.src}
      alt=""
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 h-full w-[min(52%,8.5rem)] object-cover object-right opacity-[0.26] dark:opacity-[0.16]",
        "[mask-image:linear-gradient(to_left,black_18%,transparent_92%)]",
        "[-webkit-mask-image:linear-gradient(to_left,black_18%,transparent_92%)]",
        className
      )}
    />
  );
}
