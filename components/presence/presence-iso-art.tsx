import { cn } from "@/lib/utils";
import { presenceIsoArt } from "@/lib/presence/art";
import type { PresenceStatus } from "@/lib/presence/status";

export function PresenceIsoArt({
  status,
  variant,
  className,
}: {
  status: PresenceStatus | null | undefined;
  variant: "hero" | "soft" | "tile" | "watermark" | "thumb";
  className?: string;
}) {
  const art = presenceIsoArt(status);

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
          "pointer-events-none absolute inset-0 size-full object-cover object-[75%_center] saturate-[1.15] contrast-[1.05]",
          className
        )}
      />
    );
  }

  if (variant === "soft") {
    return (
      <img
        src={art.src}
        alt=""
        aria-hidden
        decoding="async"
        className={cn(
          "pointer-events-none absolute inset-0 size-full object-cover object-[70%_center] opacity-[0.4] saturate-[0.8] contrast-[0.95] dark:opacity-[0.28]",
          className
        )}
      />
    );
  }

  if (variant === "tile") {
    return (
      <img
        src={art.src}
        alt=""
        aria-hidden
        decoding="async"
        className={cn(
          "pointer-events-none absolute inset-0 size-full object-cover object-[68%_40%] opacity-[0.52] saturate-[0.95] contrast-[1] dark:opacity-[0.38]",
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
